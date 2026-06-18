import { createServer, type Server } from 'http';
import { z } from 'zod';

import { createApp, shouldSkipGlobalRateLimit } from './app';
import { configureLogger, flushLogger, logger } from './core/logger';
import { createCacheStore } from './infra/cache';
import { createSetupOnlyModule } from './modules/setup';

const setupRuntimeEnvSchema = z.object({
  CORS_ORIGINS: z.string().min(1).default('http://localhost:8011'),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  LOG_PENDING_WRITE_MAX: z.coerce.number().int().positive().default(1000),
  LOG_REQUEST_ENABLED: z.enum(['true', 'false']).default('true'),
  LOG_TARGETS: z.enum(['console']).default('console'),
  LOG_WRITE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

export async function bootstrapSetup() {
  const env = loadSetupRuntimeEnv();
  const cacheStore = createCacheStore({ store: 'memory' });

  configureLogger({
    maxPendingWrites: env.LOG_PENDING_WRITE_MAX,
    targets: ['console'],
    writeTimeoutMs: env.LOG_WRITE_TIMEOUT_MS,
  });

  const app = createApp([createSetupOnlyModule()], {
    corsOrigins: parseCommaSeparatedValues(env.CORS_ORIGINS),
    globalRateLimit: {
      max: env.GLOBAL_RATE_LIMIT_MAX,
      windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MS,
      cacheStore,
      scope: 'ip',
      skip: shouldSkipGlobalRateLimit,
    },
    requestLogEnabled: env.LOG_REQUEST_ENABLED === 'true',
    trustProxy: env.TRUST_PROXY === 'true',
  });
  const server = createServer(app.callback());

  await listen(server, env.SERVER_PORT, env.SERVER_HOST);
  logger.warn(`Setup mode enabled. HTTP server listening on ${env.SERVER_HOST}:${env.SERVER_PORT}`);

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

function loadSetupRuntimeEnv() {
  return setupRuntimeEnvSchema.parse(process.env);
}

function parseCommaSeparatedValues(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function listen(server: Server, port: number, host: string) {
  return new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
