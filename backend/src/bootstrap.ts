import { createServer, type Server } from 'http';

import { createApp, shouldSkipGlobalRateLimit } from './app';
import { loadEnv } from './config/env';
import { configureLogger, flushLogger, logger } from './core/logger';
import { collectJobs, startScheduler, stopScheduler } from './core/scheduler';
import { createCacheStore } from './infra/cache';
import { connectDatabase, createSequelize } from './infra/database';
import { createFileStorage } from './infra/file-storage';
import { assertDatabaseMigrationsApplied } from './infra/migrator';
import { createModules, createServices, initModels } from './modules';

export async function bootstrap() {
  const env = loadEnv();
  configureLogger(env.logger);

  const cacheStore = createCacheStore(env.cache);
  const fileStorage = createFileStorage(env.fileStorage);
  const sequelize = createSequelize(env.database);
  const models = initModels(sequelize);
  const services = createServices(models, {
    authTokens: env.authTokens,
    authTokenSecret: env.authTokenSecret,
    cacheStore,
    fileStorage,
    ...(env.email ? { email: env.email } : {}),
    ...(env.sso ? { sso: env.sso } : {}),
  });
  const modules = createModules(services, {
    authCookies: env.authCookies,
    authRateLimit: {
      ...env.authRateLimit,
      cacheStore,
    },
    avatarUploadMaxBytes: env.fileUpload.maxBytes,
    readinessChecks: [
      {
        name: 'database',
        check: async () => {
          await sequelize.authenticate();
        },
      },
      ...(env.cache.store === 'redis'
        ? [
            {
              name: 'cache',
              check: async () => {
                await cacheStore.check();
              },
            },
          ]
        : []),
    ],
  });

  await connectDatabase(sequelize, env.databaseSync);
  if (env.databaseSync === 'off') {
    await assertDatabaseMigrationsApplied(sequelize);
  }
  await services.accessControl.syncSystemAccessControl();

  const scheduler = env.scheduleEnabled
    ? startScheduler(
        collectJobs(modules),
        env.schedulerLock
          ? {
              lock: {
                cacheStore,
                ttlMs: env.schedulerLock.ttlMs,
              },
            }
          : undefined,
      )
    : undefined;
  const app = createApp(modules, {
    corsOrigins: env.corsOrigins,
    globalRateLimit: {
      ...env.globalRateLimit,
      cacheStore,
      scope: 'ip',
      skip: shouldSkipGlobalRateLimit,
    },
    requestLogEnabled: env.requestLogEnabled,
    setupRedirect: { mode: 'locked' },
    ...(env.localFiles ? { staticFiles: env.localFiles } : {}),
    trustProxy: env.trustProxy,
  });
  const server = createServer(app.callback());

  await listen(server, env.port, env.host);
  logger.info(`HTTP server listening on ${env.host}:${env.port}`);

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}; shutting down.`);
    await closeServer(server);
    await stopScheduler(scheduler);
    await cacheStore.close();
    await sequelize.close();
    logger.info('Shutdown complete.');
    await flushLogger();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
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
