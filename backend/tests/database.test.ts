import { existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import { DataTypes, Model, type Sequelize } from 'sequelize';
import { describe, expect, it } from 'vitest';

import { connectDatabase, createSequelize } from '../src/infra/database';
import { initUserModel } from '../src/modules/users/user.model';

describe('database configuration', () => {
  it('rejects sqlite storage paths outside the application directory', () => {
    expect(() => createSequelize({ dialect: 'sqlite', storage: '../database.sqlite' })).toThrow(
      'DATABASE_STORAGE must resolve inside the application directory.',
    );
    expect(() => createSequelize({ dialect: 'sqlite', storage: 'file:../database.sqlite' })).toThrow(
      'SQLite URI storage paths are not supported.',
    );
  });

  it('keeps sqlite alter sync usable when child tables reference a rebuilt parent table', async () => {
    const storage = `./data/test-sqlite-alter-${process.pid}-${Date.now()}.sqlite`;
    let sequelize: Sequelize | undefined;

    try {
      sequelize = createSequelize({ dialect: 'sqlite', storage });
      initSqliteAlterModels(sequelize, { nameAllowsNull: false });
      await connectDatabase(sequelize, 'force');
      await sequelize.models.SqliteAlterParent.create({
        id: 'parent-1',
        name: 'Parent',
      });
      await sequelize.models.SqliteAlterChild.create({
        id: 'child-1',
        parentId: 'parent-1',
      });
      await sequelize.close();

      sequelize = createSequelize({ dialect: 'sqlite', storage });
      initSqliteAlterModels(sequelize, { nameAllowsNull: true });
      await expect(connectDatabase(sequelize, 'alter')).resolves.toBeUndefined();

      await expect(sequelize.models.SqliteAlterParent.count()).resolves.toBe(1);
      await expect(sequelize.models.SqliteAlterChild.count()).resolves.toBe(1);
    } finally {
      await sequelize?.close().catch(() => undefined);
      const databasePath = resolve(process.cwd(), storage);

      if (existsSync(databasePath)) {
        rmSync(databasePath);
      }
    }
  });

  it('recreates user unique indexes during sqlite alter sync', async () => {
    const storage = `./data/test-sqlite-user-indexes-${process.pid}-${Date.now()}.sqlite`;
    let sequelize: Sequelize | undefined;

    try {
      sequelize = createSequelize({ dialect: 'sqlite', storage });
      initUserModel(sequelize);
      await connectDatabase(sequelize, 'force');
      await sequelize.query('DROP INDEX users_username');
      await sequelize.query('DROP INDEX users_email');
      await sequelize.query('DROP INDEX users_phone_number');

      await connectDatabase(sequelize, 'alter');

      const indexes = await sequelize.getQueryInterface().showIndex('users');

      expect(indexes.some((index) => index.name === 'users_username' && index.unique)).toBe(true);
      expect(indexes.some((index) => index.name === 'users_email' && index.unique)).toBe(true);
      expect(indexes.some((index) => index.name === 'users_phone_number' && index.unique)).toBe(true);
    } finally {
      await sequelize?.close().catch(() => undefined);
      const databasePath = resolve(process.cwd(), storage);

      if (existsSync(databasePath)) {
        rmSync(databasePath);
      }
    }
  });

  it('recreates declared indexes that exist with an incompatible definition during sqlite alter sync', async () => {
    const storage = `./data/test-sqlite-index-reconcile-${process.pid}-${Date.now()}.sqlite`;
    let sequelize: Sequelize | undefined;

    try {
      sequelize = createSequelize({ dialect: 'sqlite', storage });
      initUserModel(sequelize);
      await connectDatabase(sequelize, 'force');
      await sequelize.query('DROP INDEX users_email');
      await sequelize.query('CREATE INDEX users_email ON users (username)');

      await connectDatabase(sequelize, 'alter');

      const indexes = await sequelize.getQueryInterface().showIndex('users');

      expect(indexes.some((index) => index.name === 'users_email' && index.unique)).toBe(true);
    } finally {
      await sequelize?.close().catch(() => undefined);
      const databasePath = resolve(process.cwd(), storage);

      if (existsSync(databasePath)) {
        rmSync(databasePath);
      }
    }
  });

  it('removes safe stale sqlite alter backup tables before alter sync', async () => {
    const storage = `./data/test-sqlite-backup-cleanup-${process.pid}-${Date.now()}.sqlite`;
    let sequelize: Sequelize | undefined;

    try {
      sequelize = createSequelize({ dialect: 'sqlite', storage });
      initSqliteAlterModels(sequelize, { nameAllowsNull: false });
      await connectDatabase(sequelize, 'force');
      await sequelize.models.SqliteAlterParent.create({
        id: 'parent-1',
        name: 'Parent',
      });
      await sequelize.query('CREATE TABLE test_alter_parents_backup AS SELECT * FROM test_alter_parents');

      await connectDatabase(sequelize, 'alter');

      const tables = await sequelize.getQueryInterface().showAllTables();

      expect(tables).not.toContain('test_alter_parents_backup');
    } finally {
      await sequelize?.close().catch(() => undefined);
      const databasePath = resolve(process.cwd(), storage);

      if (existsSync(databasePath)) {
        rmSync(databasePath);
      }
    }
  });

  it('rejects unsafe sqlite alter backup tables instead of deleting divergent data', async () => {
    const storage = `./data/test-sqlite-backup-unsafe-${process.pid}-${Date.now()}.sqlite`;
    let sequelize: Sequelize | undefined;

    try {
      sequelize = createSequelize({ dialect: 'sqlite', storage });
      initSqliteAlterModels(sequelize, { nameAllowsNull: false });
      await connectDatabase(sequelize, 'force');
      await sequelize.models.SqliteAlterParent.create({
        id: 'parent-1',
        name: 'Parent',
      });
      await sequelize.query('CREATE TABLE test_alter_parents_backup AS SELECT * FROM test_alter_parents');
      await sequelize.query("UPDATE test_alter_parents_backup SET name = 'Divergent'");

      await expect(connectDatabase(sequelize, 'alter')).rejects.toThrow('Unsafe SQLite alter backup table');
    } finally {
      await sequelize?.close().catch(() => undefined);
      const databasePath = resolve(process.cwd(), storage);

      if (existsSync(databasePath)) {
        rmSync(databasePath);
      }
    }
  });

  it('leaves non-model backup tables untouched during sqlite alter sync', async () => {
    const storage = `./data/test-sqlite-manual-backup-${process.pid}-${Date.now()}.sqlite`;
    let sequelize: Sequelize | undefined;

    try {
      sequelize = createSequelize({ dialect: 'sqlite', storage });
      initSqliteAlterModels(sequelize, { nameAllowsNull: false });
      await connectDatabase(sequelize, 'force');
      await sequelize.query('CREATE TABLE manual_backup (id TEXT PRIMARY KEY)');

      await connectDatabase(sequelize, 'alter');

      const tables = await sequelize.getQueryInterface().showAllTables();

      expect(tables).toContain('manual_backup');
    } finally {
      await sequelize?.close().catch(() => undefined);
      const databasePath = resolve(process.cwd(), storage);

      if (existsSync(databasePath)) {
        rmSync(databasePath);
      }
    }
  });
});

function initSqliteAlterModels(sequelize: Sequelize, options: { nameAllowsNull: boolean }) {
  class SqliteAlterParent extends Model {}
  class SqliteAlterChild extends Model {}

  SqliteAlterParent.init(
    {
      id: {
        type: DataTypes.STRING(64),
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(64),
        allowNull: options.nameAllowsNull,
      },
    },
    {
      sequelize,
      tableName: 'test_alter_parents',
      modelName: 'SqliteAlterParent',
    },
  );

  SqliteAlterChild.init(
    {
      id: {
        type: DataTypes.STRING(64),
        primaryKey: true,
        allowNull: false,
      },
      parentId: {
        type: DataTypes.STRING(64),
        allowNull: false,
        references: {
          model: 'test_alter_parents',
          key: 'id',
        },
      },
    },
    {
      sequelize,
      tableName: 'test_alter_children',
      modelName: 'SqliteAlterChild',
    },
  );
}
