import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { QueryTypes, Sequelize } from 'sequelize';
import { type ModelIndexesOptions } from 'sequelize/types/model';

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

type ModelTableName = string | { tableName: string };

interface SqliteAlterBackupTable {
  baseTableName: string;
  backupTableName: string;
  reason: string;
}

interface SqliteForeignKeyViolation {
  fkid: number;
  parent: string;
  rowid: number | null;
  table: string;
}

interface SqlitePragmaForeignKeysRow {
  foreign_keys: number;
}

interface SqliteSchemaTableRow {
  name: string;
}

interface SqliteTableCountRow {
  count: number;
}

interface ExistingIndex {
  fields?: Array<{
    attribute?: string;
    name?: string;
  }>;
  name?: string;
  unique?: boolean;
}

const sqliteAlterBackupSuffix = '_backup';

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
    await syncDatabaseAlter(sequelize);
  } else if (syncMode === 'force') {
    await sequelize.sync({ force: true });
  }

  logger.info(`Database connected. dialect=${sequelize.getDialect()} sync=${syncMode}`);
}

async function syncDatabaseAlter(sequelize: Sequelize) {
  if (sequelize.getDialect() !== 'sqlite') {
    await sequelize.sync({ alter: true });
    return;
  }

  await cleanupSqliteAlterBackupTables(sequelize);
  await removeSqliteAlterConflictingIndexes(sequelize);

  const foreignKeysEnabled = await getSqliteForeignKeysEnabled(sequelize);

  await sequelize.query('PRAGMA foreign_keys = OFF');

  try {
    await sequelize.sync({ alter: true });
  } finally {
    await sequelize.query(`PRAGMA foreign_keys = ${foreignKeysEnabled ? 'ON' : 'OFF'}`);
  }

  await cleanupSqliteAlterBackupTables(sequelize);
  await assertSqliteForeignKeyIntegrity(sequelize);
  await reconcileDeclaredIndexes(sequelize);
  await assertSqliteForeignKeyIntegrity(sequelize);
}

async function getSqliteForeignKeysEnabled(sequelize: Sequelize) {
  const rows = await sequelize.query<SqlitePragmaForeignKeysRow>('PRAGMA foreign_keys', {
    type: QueryTypes.SELECT,
  });
  const [row] = rows;

  return row?.foreign_keys === 1;
}

async function assertSqliteForeignKeyIntegrity(sequelize: Sequelize) {
  const violations = await sequelize.query<SqliteForeignKeyViolation>('PRAGMA foreign_key_check', {
    type: QueryTypes.SELECT,
  });

  if (violations.length === 0) {
    return;
  }

  const formattedViolations = violations
    .map((violation) => `${violation.table} rowid=${violation.rowid ?? 'null'} parent=${violation.parent}`)
    .join('; ');

  throw new Error(`SQLite foreign key violations after database alter sync: ${formattedViolations}`);
}

async function cleanupSqliteAlterBackupTables(sequelize: Sequelize) {
  const backupTables = await listSqliteAlterBackupTables(sequelize);
  const unsafeTables: SqliteAlterBackupTable[] = [];

  for (const backupTableName of backupTables) {
    const baseTableName = backupTableName.slice(0, -sqliteAlterBackupSuffix.length);
    const safetyCheck = await getSqliteAlterBackupSafety(sequelize, baseTableName, backupTableName);

    if (safetyCheck.safe) {
      await sequelize.query(`DROP TABLE ${quoteSqliteIdentifier(backupTableName)}`);
      logger.info(`Removed stale SQLite alter backup table ${backupTableName}.`);
      continue;
    }

    unsafeTables.push({
      backupTableName,
      baseTableName,
      reason: safetyCheck.reason,
    });
  }

  if (unsafeTables.length === 0) {
    return;
  }

  const formattedTables = unsafeTables
    .map((table) => `${table.backupTableName} for ${table.baseTableName}: ${table.reason}`)
    .join('; ');

  throw new Error(`Unsafe SQLite alter backup table(s) remain: ${formattedTables}`);
}

async function listSqliteAlterBackupTables(sequelize: Sequelize) {
  const modelTableNames = getModelTableNames(sequelize);
  const rows = await sequelize.query<SqliteSchemaTableRow>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%\\_backup' ESCAPE '\\' ORDER BY name",
    {
      type: QueryTypes.SELECT,
    },
  );

  return rows
    .map((row) => row.name)
    .filter((tableName) => modelTableNames.has(tableName.slice(0, -sqliteAlterBackupSuffix.length)));
}

async function getSqliteAlterBackupSafety(sequelize: Sequelize, baseTableName: string, backupTableName: string) {
  if (!(await tableExists(sequelize, baseTableName))) {
    return {
      reason: 'base table is missing',
      safe: false,
    } as const;
  }

  try {
    const backupExceptBase = await countSqliteRowsExcept(sequelize, backupTableName, baseTableName);

    if (backupExceptBase === 0) {
      return {
        safe: true,
      } as const;
    }
  } catch {
    return {
      reason: 'backup table schema differs from the base table',
      safe: false,
    } as const;
  }

  return {
    reason: 'backup table contents differ from the base table',
    safe: false,
  } as const;
}

async function tableExists(sequelize: Sequelize, tableName: string) {
  const rows = await sequelize.query<SqliteSchemaTableRow>(
    'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
    {
      replacements: ['table', tableName],
      type: QueryTypes.SELECT,
    },
  );

  return rows.length > 0;
}

async function countSqliteRowsExcept(sequelize: Sequelize, sourceTableName: string, targetTableName: string) {
  const rows = await sequelize.query<SqliteTableCountRow>(
    [
      'SELECT COUNT(*) AS count FROM (',
      `SELECT * FROM ${quoteSqliteIdentifier(sourceTableName)}`,
      'EXCEPT',
      `SELECT * FROM ${quoteSqliteIdentifier(targetTableName)}`,
      ')',
    ].join(' '),
    {
      type: QueryTypes.SELECT,
    },
  );
  const [row] = rows;

  return row?.count ?? 0;
}

async function removeSqliteAlterConflictingIndexes(sequelize: Sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  for (const model of Object.values(sequelize.models)) {
    const tableName = getTableNameString(model.getTableName());

    if (!(await tableExists(sequelize, tableName))) {
      continue;
    }

    let existingIndexes = (await queryInterface.showIndex(tableName)) as ExistingIndex[];

    for (const declaredIndex of model.options.indexes ?? []) {
      const indexName = declaredIndex.name;
      const declaredFields = getDeclaredIndexFields(declaredIndex);

      if (!indexName || !declaredIndex.unique || declaredFields.length < 2) {
        continue;
      }

      if (!existingIndexes.some((index) => index.name === indexName)) {
        continue;
      }

      await queryInterface.removeIndex(tableName, indexName);
      existingIndexes = existingIndexes.filter((index) => index.name !== indexName);
      logger.info(`Temporarily removed SQLite composite unique index ${indexName} before alter sync.`);
    }
  }
}

async function reconcileDeclaredIndexes(sequelize: Sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  for (const model of Object.values(sequelize.models)) {
    const tableName = model.getTableName();
    const declaredIndexes = model.options.indexes ?? [];

    if (declaredIndexes.length === 0) {
      continue;
    }

    let existingIndexes = (await queryInterface.showIndex(tableName)) as ExistingIndex[];

    for (const declaredIndex of declaredIndexes) {
      const indexName = declaredIndex.name;
      const declaredFields = getDeclaredIndexFields(declaredIndex);

      if (!indexName || declaredFields.length === 0) {
        continue;
      }

      const existingIndex = existingIndexes.find((index) => index.name === indexName);

      if (existingIndex && indexMatchesDeclaration(existingIndex, declaredIndex)) {
        continue;
      }

      if (existingIndex) {
        await queryInterface.removeIndex(tableName, indexName);
      }

      await queryInterface.addIndex(tableName, normalizeIndexDeclaration(declaredIndex));
      existingIndexes = (await queryInterface.showIndex(tableName)) as ExistingIndex[];
      logger.info(`Reconciled database index ${indexName}.`);
    }
  }
}

function indexMatchesDeclaration(existingIndex: ExistingIndex, declaredIndex: ModelIndexesOptions) {
  const existingFields = getExistingIndexFields(existingIndex);
  const declaredFields = getDeclaredIndexFields(declaredIndex);

  return Boolean(existingIndex.unique) === Boolean(declaredIndex.unique) && arraysEqual(existingFields, declaredFields);
}

function getExistingIndexFields(index: ExistingIndex) {
  return (index.fields ?? [])
    .map((field) => field.attribute ?? field.name)
    .filter((field): field is string => Boolean(field));
}

function getDeclaredIndexFields(index: ModelIndexesOptions) {
  return (index.fields ?? []).flatMap((field) => {
    if (typeof field === 'string') {
      return [field];
    }

    if ('name' in field && typeof field.name === 'string') {
      return [field.name];
    }

    return [];
  });
}

function normalizeIndexDeclaration(index: ModelIndexesOptions) {
  return {
    ...index,
    fields: [...(index.fields ?? [])],
  };
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function quoteSqliteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function getModelTableNames(sequelize: Sequelize) {
  return new Set(Object.values(sequelize.models).map((model) => getTableNameString(model.getTableName())));
}

function getTableNameString(tableName: ModelTableName) {
  return typeof tableName === 'string' ? tableName : tableName.tableName;
}
