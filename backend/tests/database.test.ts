import { describe, expect, it } from 'vitest';

import { createSequelize } from '../src/infra/database';

describe('database configuration', () => {
  it('rejects sqlite storage paths outside the application directory', () => {
    expect(() => createSequelize({ dialect: 'sqlite', storage: '../database.sqlite' })).toThrow(
      'DATABASE_STORAGE must resolve inside the application directory.',
    );
    expect(() => createSequelize({ dialect: 'sqlite', storage: 'file:../database.sqlite' })).toThrow(
      'SQLite URI storage paths are not supported.',
    );
  });
});
