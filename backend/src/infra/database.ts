import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { Sequelize } from 'sequelize';

import { resolveApplicationPath } from '../core/files';
import { logger } from '../core/logger';

type DatabaseSyncMode = 'off' | 'alter' | 'force';
type DatabaseDialect = 'postgres' | 'mysql' | 'sqlite';
export type DatabaseConfig =
  | {
      connectTimeoutMs: number;
      dialect: Exclude<DatabaseDialect, 'sqlite'>;
      pool: DatabasePoolConfig;
      ssl: boolean;
      url: string;
    }
  | {
      dialect: 'sqlite';
      storage: string;
    };

interface DatabasePoolConfig {
  acquire: number;
  idle: number;
  max: number;
  min: number;
}

export function createSequelize(config: DatabaseConfig) {
  const logging = (message: string) => logger.debug(message);

  if (config.dialect === 'sqlite') {
    return new Sequelize({
      dialect: config.dialect,
      storage: normalizeSqliteStorage(config.storage),
      logging,
    });
  }

  return new Sequelize(config.url, {
    dialect: config.dialect,
    dialectOptions: getDialectOptions(config),
    logging,
    pool: config.pool,
  });
}

function getDialectOptions(config: Extract<DatabaseConfig, { dialect: Exclude<DatabaseDialect, 'sqlite'> }>) {
  const timeoutOptions =
    config.dialect === 'postgres'
      ? { connectionTimeoutMillis: config.connectTimeoutMs }
      : { connectTimeout: config.connectTimeoutMs };

  if (!config.ssl) {
    return timeoutOptions;
  }

  return {
    ...timeoutOptions,
    ssl:
      config.dialect === 'postgres'
        ? {
            rejectUnauthorized: true,
            require: true,
          }
        : {},
  };
}

function normalizeSqliteStorage(storage: string) {
  if (storage === ':memory:') {
    return storage;
  }

  if (storage.startsWith('file:')) {
    throw new Error('SQLite URI storage paths are not supported.');
  }

  const storagePath = resolveApplicationPath(storage, 'DATABASE_STORAGE');

  mkdirSync(dirname(storagePath), { recursive: true });

  return storagePath;
}

export async function connectDatabase(sequelize: Sequelize, syncMode: DatabaseSyncMode) {
  await sequelize.authenticate();

  if (syncMode === 'alter') {
    await sequelize.sync({ alter: true });
  } else if (syncMode === 'force') {
    await sequelize.sync({ force: true });
  }

  logger.info(`Database connected. dialect=${sequelize.getDialect()} sync=${syncMode}`);
}
