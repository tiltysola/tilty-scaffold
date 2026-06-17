import { mkdirSync } from 'fs';
import { dirname } from 'path';

import { Sequelize } from 'sequelize';

import { resolveApplicationPath } from '../core/files';
import { logger } from '../core/logger';

export type DatabaseSyncMode = 'off' | 'alter' | 'force';
export type DatabaseDialect = 'postgres' | 'mysql' | 'sqlite';
export type DatabaseConfig =
  | {
      dialect: Exclude<DatabaseDialect, 'sqlite'>;
      url: string;
    }
  | {
      dialect: 'sqlite';
      storage: string;
    };

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
    logging,
  });
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
