import { createServer } from 'http';
import { z } from 'zod';

import { createApp, shouldSkipGlobalRateLimit } from './app';
import { flushLogger, logger } from './core/logger';
import { closeServer, frontendDistDirectory, listen, warnIfFrontendEntryFileMissing } from './core/server';
import { createCacheStore } from './infra/cache';
import { configureLogger } from './infra/logger';
import { createSetupOnlyModule } from './modules/setup';

const defaultAppDomain = 'http://localhost:8011';

const setupRuntimeEnvSchema = z.object({
  APP_DOMAIN: z.string().min(1).default(defaultAppDomain),
  APP_CORS_ORIGINS: z.string().min(1).optional(),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  LOG_PENDING_WRITE_MAX: z.coerce.number().int().positive().default(1000),
  LOG_REQUEST_ENABLED: z.enum(['true', 'false']).default('true'),
  LOG_TARGETS: z.enum(['console']).default('console'),
  LOG_WRITE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SERVER_HOST: z.string().default('127.0.0.1'),
  SERVER_PORT: z.coerce.number().int().positive().default(3000),
  SERVER_TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

export async function bootstrapSetup() {
  const setupRuntimeConfig = loadSetupRuntimeEnv();
  const cacheStore = createCacheStore({ store: 'memory' });

  configureLogger({
    maxPendingWrites: setupRuntimeConfig.LOG_PENDING_WRITE_MAX,
    targets: ['console'],
    writeTimeoutMs: setupRuntimeConfig.LOG_WRITE_TIMEOUT_MS,
  });
  warnIfFrontendEntryFileMissing();

  const app = createApp([createSetupOnlyModule()], {
    corsOrigins: parseCommaSeparatedValues(setupRuntimeConfig.APP_CORS_ORIGINS ?? setupRuntimeConfig.APP_DOMAIN),
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
    requestLogEnabled: setupRuntimeConfig.LOG_REQUEST_ENABLED === 'true',
    setupRedirect: { mode: 'setup' },
    trustProxy: setupRuntimeConfig.SERVER_TRUST_PROXY === 'true',
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

function parseCommaSeparatedValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
