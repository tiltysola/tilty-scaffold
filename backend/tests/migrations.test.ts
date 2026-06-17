import { describe, expect, it } from 'vitest';

import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';

describe('database migrations', () => {
  it('rejects sqlite storage paths outside the application directory', () => {
    expect(() => createSequelize({ dialect: 'sqlite', storage: '../database.sqlite' })).toThrow(
      'DATABASE_STORAGE must resolve inside the application directory.',
    );
    expect(() => createSequelize({ dialect: 'sqlite', storage: 'file:../database.sqlite' })).toThrow(
      'SQLite URI storage paths are not supported.',
    );
  });

  it('applies and rolls back migrations', async () => {
    const sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    const migrator = createMigrator(sequelize);

    try {
      const applied = await migrator.up();
      const users = await sequelize.getQueryInterface().describeTable('users');
      const indexes = await sequelize.getQueryInterface().showIndex('users');

      expect(applied.map((migration) => migration.name)).toEqual(['0001-initial']);
      expect(users.email).toBeDefined();
      expect(users.ssoSubject).toBeDefined();
      expect(indexes.some((index) => index.name === 'users_available_created_at')).toBe(true);
      expect(indexes.some((index) => index.name === 'users_sso_subject')).toBe(true);

      const reverted = await migrator.down();

      expect(reverted.map((migration) => migration.name)).toEqual(['0001-initial']);
      await expect(sequelize.getQueryInterface().describeTable('users')).rejects.toThrow();
    } finally {
      await sequelize.close();
    }
  });
});
