import { createServer } from 'http';
import { z } from 'zod';

import { SetupBoolean, setupBooleanValues, SetupCacheStore, SetupLogTarget } from '@tilty/shared/setup';

import { createApp, shouldSkipGlobalRateLimit } from './app';
import { defaultSetupRuntimeEnvironment } from './config/defaults';
import { flushLogger, logger } from './core/logger';
import { closeServer, frontendDistDirectory, listen, warnIfFrontendEntryFileMissing } from './core/server';
import { parseSeparatedValues } from './core/strings';
import { createCacheStore } from './infra/cache';
import { configureLogger } from './infra/logger';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { createSetupOnlyModule } from './modules/setup';
import { loadSetupToken, removeSetupTokenFile, SetupAccessService } from './modules/setup/setup-access';

const numberDefault = (value: string) => Number(value);

const setupRuntimeEnvSchema = z
  .object({
    APP_DOMAIN: z.string().min(1).default(defaultSetupRuntimeEnvironment.APP_DOMAIN),
    APP_CORS_ORIGINS: z.string().min(1).optional(),
    APP_CSP_RESOURCE_ORIGINS: z.string().min(1).optional(),
    GLOBAL_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupRuntimeEnvironment.GLOBAL_RATE_LIMIT_MAX)),
    GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupRuntimeEnvironment.GLOBAL_RATE_LIMIT_WINDOW_MS)),
    LOG_PENDING_WRITE_MAX: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupRuntimeEnvironment.LOG_PENDING_WRITE_MAX)),
    LOG_REQUEST_ENABLED: z.enum(setupBooleanValues).default(defaultSetupRuntimeEnvironment.LOG_REQUEST_ENABLED),
    LOG_TARGETS: z.literal(SetupLogTarget.Console).default(defaultSetupRuntimeEnvironment.LOG_TARGETS),
    LOG_WRITE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupRuntimeEnvironment.LOG_WRITE_TIMEOUT_MS)),
    SERVER_HOST: z.string().default(defaultSetupRuntimeEnvironment.SERVER_HOST),
    SERVER_PORT: z.coerce.number().int().positive().default(numberDefault(defaultSetupRuntimeEnvironment.SERVER_PORT)),
    SERVER_TRUST_PROXY: z.enum(setupBooleanValues).default(defaultSetupRuntimeEnvironment.SERVER_TRUST_PROXY),
    SETUP_REMOTE_ENABLED: z.enum(setupBooleanValues).default(SetupBoolean.False),
    SETUP_TOKEN: z.string().trim().min(32).max(512).optional(),
  })
  .superRefine((config, ctx) => {
    const remoteEnabled = config.SETUP_REMOTE_ENABLED === SetupBoolean.True;

    if (!isLoopbackBindHost(config.SERVER_HOST) && !remoteEnabled) {
      ctx.addIssue({
        code: 'custom',
        path: ['SERVER_HOST'],
        message: 'A non-loopback setup bind requires SETUP_REMOTE_ENABLED=true',
      });
    }

    if (remoteEnabled && !isHttpsOrigin(config.APP_DOMAIN)) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_DOMAIN'],
        message: 'Remote setup requires an HTTPS APP_DOMAIN',
      });
    }

    if (remoteEnabled && config.SERVER_TRUST_PROXY !== SetupBoolean.True) {
      ctx.addIssue({
        code: 'custom',
        path: ['SERVER_TRUST_PROXY'],
        message: 'Remote setup requires SERVER_TRUST_PROXY=true behind the HTTPS reverse proxy',
      });
    }

    if (
      remoteEnabled &&
      parseSeparatedValues(config.APP_CORS_ORIGINS ?? config.APP_DOMAIN, ',').some((origin) => !isHttpsOrigin(origin))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_CORS_ORIGINS'],
        message: 'Remote setup requires HTTPS CORS origins',
      });
    }

    if (remoteEnabled && !config.APP_CSP_RESOURCE_ORIGINS) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_CSP_RESOURCE_ORIGINS'],
        message: 'Remote setup requires an explicit CSP resource origin allowlist',
      });
    }

    if (
      remoteEnabled &&
      config.APP_CSP_RESOURCE_ORIGINS &&
      parseSeparatedValues(config.APP_CSP_RESOURCE_ORIGINS, /[,\n]/).includes('*')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_CSP_RESOURCE_ORIGINS'],
        message: 'Remote setup does not allow a wildcard CSP resource origin',
      });
    }
  });

export async function bootstrapSetup() {
  const setupRuntimeConfig = loadSetupRuntimeEnv();
  const cacheStore = createCacheStore({ store: SetupCacheStore.Memory });
  const setupToken = await loadSetupToken(setupRuntimeConfig.SETUP_TOKEN);
  const setupAccess = new SetupAccessService(cacheStore, setupToken.token, {
    requireSecure: setupRuntimeConfig.SETUP_REMOTE_ENABLED === SetupBoolean.True,
  });
  const setupRateLimit = rateLimitMiddleware({ cacheStore, max: 120, scope: 'route', windowMs: 60_000 });
  const setupProbeRateLimit = rateLimitMiddleware({ cacheStore, max: 10, scope: 'route', windowMs: 60_000 });
  const setupCompleteRateLimit = rateLimitMiddleware({ cacheStore, max: 5, scope: 'route', windowMs: 60_000 });

  configureLogger({
    maxPendingWrites: setupRuntimeConfig.LOG_PENDING_WRITE_MAX,
    targets: [SetupLogTarget.Console],
    writeTimeoutMs: setupRuntimeConfig.LOG_WRITE_TIMEOUT_MS,
  });
  warnIfFrontendEntryFileMissing();

  if (setupToken.tokenFilePath) {
    logger.warn(`Setup access token is stored in ${setupToken.tokenFilePath}.`);
  } else {
    logger.warn('Setup access token is loaded from SETUP_TOKEN.');
  }

  const app = createApp(
    [
      createSetupOnlyModule({
        access: setupAccess,
        completeRateLimit: setupCompleteRateLimit,
        onCompleted: async () => removeSetupTokenFile(setupToken.tokenFilePath),
        probeRateLimit: setupProbeRateLimit,
        rateLimit: setupRateLimit,
      }),
    ],
    {
      corsOrigins: parseSeparatedValues(setupRuntimeConfig.APP_CORS_ORIGINS ?? setupRuntimeConfig.APP_DOMAIN, ','),
      cspResourceOrigins: parseSeparatedValues(setupRuntimeConfig.APP_CSP_RESOURCE_ORIGINS, /[,\n]/),
      frontendFiles: {
        root: frontendDistDirectory,
      },
      globalRateLimit: {
        max: setupRuntimeConfig.GLOBAL_RATE_LIMIT_MAX,
        windowMs: setupRuntimeConfig.GLOBAL_RATE_LIMIT_WINDOW_MS,
        cacheStore,
        scope: 'ip',
        skip: shouldSkipGlobalRateLimit,
      },
      requestLogEnabled: setupRuntimeConfig.LOG_REQUEST_ENABLED === SetupBoolean.True,
      setupRedirect: { mode: 'setup' },
      trustProxy: setupRuntimeConfig.SERVER_TRUST_PROXY === SetupBoolean.True,
    },
  );
  const server = createServer(app.callback());

  await listen(server, setupRuntimeConfig.SERVER_PORT, setupRuntimeConfig.SERVER_HOST);
  logger.warn(
    `Setup mode enabled. HTTP server listening on ${setupRuntimeConfig.SERVER_HOST}:${setupRuntimeConfig.SERVER_PORT}`,
  );

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}; shutting down setup server.`);
    await closeServer(server);
    await cacheStore.close();
    logger.info('Setup shutdown complete.');
    await flushLogger();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export function loadSetupRuntimeEnv() {
  const config = setupRuntimeEnvSchema.parse(process.env);

  return {
    ...config,
    APP_CSP_RESOURCE_ORIGINS: config.APP_CSP_RESOURCE_ORIGINS ?? config.APP_DOMAIN,
  };
}

function isLoopbackBindHost(host: string) {
  return ['127.0.0.1', '::1', 'localhost'].includes(host.trim().toLowerCase());
}

function isHttpsOrigin(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.origin === value.replace(/\/$/, '');
  } catch {
    return false;
  }
}
