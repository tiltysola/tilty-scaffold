import { describe, expect, it } from 'vitest';

import { connectDatabase, createSequelize } from '../src/infra/database';

describe('database configuration', () => {
  it('rejects sqlite storage paths outside the runtime root directory', () => {
    expect(() => createSequelize({ dialect: 'sqlite', storage: '../database.sqlite' })).toThrow(
      'DATABASE_STORAGE must resolve inside the runtime root directory.',
    );
    expect(() => createSequelize({ dialect: 'sqlite', storage: 'file:../database.sqlite' })).toThrow(
      'SQLite URI storage paths are not supported.',
    );
  });

  it('connects without model synchronization', async () => {
    const sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });

    try {
      await expect(connectDatabase(sequelize)).resolves.toBeUndefined();
      await expect(sequelize.getQueryInterface().showAllTables()).resolves.toEqual([]);
    } finally {
      await sequelize.close();
    }
  });
});
