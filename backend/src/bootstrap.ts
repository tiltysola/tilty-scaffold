import { existsSync } from 'fs';
import { createServer, type Server } from 'http';
import { resolve } from 'path';

import { createApp, shouldSkipGlobalRateLimit } from './app';
import { loadEnv } from './config/env';
import { configureLogger, flushLogger, logger } from './core/logger';
import { collectJobs, startScheduler, stopScheduler } from './core/scheduler';
import { createCacheStore } from './infra/cache';
import { connectDatabase, createSequelize } from './infra/database';
import { createFileStorage } from './infra/file-storage';
import { assertDatabaseMigrationsApplied } from './infra/migrator';
import { createModules, createServices, initModels } from './modules';

const frontendDistDirectory = resolve(__dirname, '../../frontend/dist');
const frontendEntryFilePath = resolve(frontendDistDirectory, 'index.html');

export async function bootstrap() {
  const environmentConfig = loadEnv();
  configureLogger(environmentConfig.logger);
  warnIfFrontendEntryFileMissing();

  const cacheStore = createCacheStore(environmentConfig.cache);
  const fileStorage = createFileStorage(environmentConfig.fileStorage);
  const sequelize = createSequelize(environmentConfig.database);
  const models = initModels(sequelize);
  const services = createServices(models, {
    authTokens: environmentConfig.authTokens,
    authTokenSecret: environmentConfig.authTokenSecret,
    cacheStore,
    fileStorage,
    ...(environmentConfig.email ? { email: environmentConfig.email } : {}),
    ...(environmentConfig.sso ? { sso: environmentConfig.sso } : {}),
  });
  const modules = createModules(services, {
    authCookies: environmentConfig.authCookies,
    authRateLimit: {
      ...environmentConfig.authRateLimit,
      cacheStore,
    },
    avatarUploadMaxBytes: environmentConfig.fileUpload.maxBytes,
    readinessChecks: [
      {
        name: 'database',
        check: async () => {
          await sequelize.authenticate();
        },
      },
      ...(environmentConfig.cache.store === 'redis'
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

  await connectDatabase(sequelize, environmentConfig.databaseSync);
  if (environmentConfig.databaseSync === 'off') {
    await assertDatabaseMigrationsApplied(sequelize);
  }
  await services.accessControl.syncSystemAccessControl();

  const scheduler = environmentConfig.scheduleEnabled
    ? startScheduler(
        collectJobs(modules),
        environmentConfig.schedulerLock
          ? {
              lock: {
                cacheStore,
                ttlMs: environmentConfig.schedulerLock.ttlMs,
              },
            }
          : undefined,
      )
    : undefined;
  const app = createApp(modules, {
    corsOrigins: environmentConfig.corsOrigins,
    frontendFiles: {
      root: frontendDistDirectory,
    },
    globalRateLimit: {
      ...environmentConfig.globalRateLimit,
      cacheStore,
      scope: 'ip',
      skip: shouldSkipGlobalRateLimit,
    },
    requestLogEnabled: environmentConfig.requestLogEnabled,
    setupRedirect: { mode: 'locked' },
    ...(environmentConfig.localFiles ? { staticFiles: environmentConfig.localFiles } : {}),
    trustProxy: environmentConfig.trustProxy,
  });
  const server = createServer(app.callback());

  await listen(server, environmentConfig.port, environmentConfig.host);
  logger.info(`HTTP server listening on ${environmentConfig.host}:${environmentConfig.port}`);

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

function warnIfFrontendEntryFileMissing() {
  if (!existsSync(frontendEntryFilePath)) {
    logger.warn(
      `Frontend entry file was not found at ${frontendEntryFilePath}. Backend-served browser routes require npm run build:frontend.`,
    );
  }
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
