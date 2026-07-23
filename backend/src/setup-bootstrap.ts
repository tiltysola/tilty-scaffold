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
import { createSetupOnlyModule } from './modules/setup';

const numberDefault = (value: string) => Number(value);

const setupRuntimeEnvSchema = z.object({
  APP_DOMAIN: z.string().min(1).default(defaultSetupRuntimeEnvironment.APP_DOMAIN),
  APP_CORS_ORIGINS: z.string().min(1).optional(),
  APP_CSP_RESOURCE_ORIGINS: z.string().min(1).default(defaultSetupRuntimeEnvironment.APP_CSP_RESOURCE_ORIGINS),
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
});

export async function bootstrapSetup() {
  const setupRuntimeConfig = loadSetupRuntimeEnv();
  const cacheStore = createCacheStore({ store: SetupCacheStore.Memory });

  configureLogger({
    maxPendingWrites: setupRuntimeConfig.LOG_PENDING_WRITE_MAX,
    targets: [SetupLogTarget.Console],
    writeTimeoutMs: setupRuntimeConfig.LOG_WRITE_TIMEOUT_MS,
  });
  warnIfFrontendEntryFileMissing();

  const app = createApp([createSetupOnlyModule()], {
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
  });
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
  return setupRuntimeEnvSchema.parse(process.env);
}
