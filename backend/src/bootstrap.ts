import { createServer } from 'http';

import { createApp, shouldSkipGlobalRateLimit } from './app';
import { initModels } from './composition/models';
import { createModules } from './composition/modules';
import { createServices } from './composition/services';
import { loadEnv } from './config/env';
import { flushLogger, logger } from './core/logger';
import { collectJobs, startScheduler, stopScheduler } from './core/scheduler';
import { closeServer, frontendDistDirectory, listen, warnIfFrontendEntryFileMissing } from './core/server';
import { createCacheStore } from './infra/cache';
import { connectDatabase, createSequelize } from './infra/database';
import { createFileStorage } from './infra/file-storage';
import { configureLogger } from './infra/logger';
import { assertDatabaseMigrationsApplied } from './infra/migrator';

export async function bootstrap() {
  const environmentConfig = loadEnv();
  configureLogger(environmentConfig.logger);
  warnIfFrontendEntryFileMissing();

  const cacheStore = createCacheStore(environmentConfig.cache);
  const fileStorage = createFileStorage(environmentConfig.fileStorage);
  const sequelize = createSequelize(environmentConfig.database);
  const models = initModels(sequelize);
  const services = createServices(models, {
    appDomain: environmentConfig.appDomain,
    authTokens: environmentConfig.authTokens,
    authTokenSecret: environmentConfig.authTokenSecret,
    authVerification: environmentConfig.authVerification,
    cacheStore,
    fileStorage,
    passkey: environmentConfig.passkey,
    ...(environmentConfig.email ? { email: environmentConfig.email } : {}),
    ...(environmentConfig.sms ? { sms: environmentConfig.sms } : {}),
    ...(environmentConfig.sso ? { sso: environmentConfig.sso } : {}),
    totp: environmentConfig.totp,
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
