import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { initModels } from '../src/modules';
import { SetupService } from '../src/modules/setup/setup.service';

describe('setup service', () => {
  let originalCwd: string;
  let temporaryRoot: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-setup-'));
    process.chdir(temporaryRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(temporaryRoot, { force: true, recursive: true });
  });

  it('generates defaults when no environment file exists', () => {
    const service = new SetupService('setup');
    const defaults = service.getDefaults();

    expect(defaults.environmentFileLoaded).toBe(false);
    expect(defaults.environment.DATABASE_DIALECT).toBe('sqlite');
    expect(defaults.environment.CACHE_REDIS_URL).toBe('redis://localhost:6379/0');
    expect(defaults.environment.AUTH_TOKEN_SECRET).toHaveLength(64);
  });

  it('loads existing environment values when the setup lock is missing', async () => {
    await writeFile(
      '.env',
      [
        'NODE_ENV=production',
        'AUTH_TOKEN_SECRET=existing-auth-token-secret-minimum-32-characters',
        'DATABASE_STORAGE=./data/existing-env.sqlite',
        '',
      ].join('\n'),
      'utf8',
    );

    const service = new SetupService('setup');
    const defaults = service.getDefaults();

    expect(defaults.environmentFileLoaded).toBe(true);
    expect(defaults.environment.NODE_ENV).toBe('production');
    expect(defaults.environment.AUTH_TOKEN_SECRET).toBe('existing-auth-token-secret-minimum-32-characters');
    expect(defaults.environment.DATABASE_STORAGE).toBe('./data/existing-env.sqlite');
    expect(defaults.environment.CACHE_STORE).toBe('memory');
    expect('SETUP_LOCKED' in defaults.environment).toBe(false);
  });

  it('loads existing environment values when the setup lock is false', async () => {
    await writeFile('.env', 'SETUP_LOCKED=false\nDATABASE_STORAGE=./data/unlocked.sqlite\n', 'utf8');

    const service = new SetupService('setup');

    const defaults = service.getDefaults();

    expect(defaults.environmentFileLoaded).toBe(true);
    expect(defaults.environment.DATABASE_STORAGE).toBe('./data/unlocked.sqlite');
  });

  it('locks setup when the setup lock is true', async () => {
    await writeFile('.env', 'SETUP_LOCKED=true\nNODE_ENV=development\n', 'utf8');

    const service = new SetupService('setup');

    expect(() => service.getDefaults()).toThrow('Setup is locked');
  });

  it('writes environment, migrates the database, and creates the root administrator', async () => {
    const service = new SetupService('setup');
    const environment = service.getDefaults().environment;

    await expect(
      service.complete({
        administrator: {
          username: 'root_user',
          displayName: 'Root User',
          email: 'root@example.com',
          password: 'password123',
          confirmPassword: 'password123',
        },
        environment: {
          ...environment,
          DATABASE_STORAGE: './data/setup.sqlite',
          SCHEDULER_ENABLED: 'false',
        },
      }),
    ).resolves.toEqual({
      administratorCreated: true,
      completed: true,
      restartRequired: true,
    });

    await expect(readFile('.env', 'utf8')).resolves.toContain('SETUP_LOCKED=true');
    await expect(readFile('.env', 'utf8')).resolves.toContain('DATABASE_STORAGE=./data/setup.sqlite');
    await expect(readFile('.env.setup.lock', 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(() => service.getDefaults()).toThrow('Setup is locked');

    const sequelize = createSequelize({ dialect: 'sqlite', storage: './data/setup.sqlite' });
    const models = initModels(sequelize);

    try {
      await expect(models.user.count()).resolves.toBe(1);
    } finally {
      await sequelize.close();
    }
  });

  it('writes environment and skips administrator creation when available users already exist', async () => {
    const sequelize = createSequelize({ dialect: 'sqlite', storage: './data/existing-users.sqlite' });
    const models = initModels(sequelize);

    try {
      await createMigrator(sequelize).up();
      await models.user.create({
        username: 'existing_user',
        displayName: 'Existing User',
        email: 'existing@example.com',
      });
    } finally {
      await sequelize.close();
    }

    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/existing-users.sqlite',
      SCHEDULER_ENABLED: 'false',
    };

    await expect(service.testDatabase({ environment })).resolves.toEqual({
      connected: true,
      hasExistingUsers: true,
    });
    await expect(
      service.complete({
        environment,
      }),
    ).resolves.toEqual({
      administratorCreated: false,
      completed: true,
      restartRequired: true,
    });

    await expect(readFile('.env', 'utf8')).resolves.toContain('SETUP_LOCKED=true');
    await expect(readFile('.env', 'utf8')).resolves.toContain('DATABASE_STORAGE=./data/existing-users.sqlite');

    const verificationSequelize = createSequelize({ dialect: 'sqlite', storage: './data/existing-users.sqlite' });
    const verificationModels = initModels(verificationSequelize);

    try {
      await expect(verificationModels.user.count()).resolves.toBe(1);
      await expect(verificationModels.user.findOne({ where: { email: 'existing@example.com' } })).resolves.toBeTruthy();
    } finally {
      await verificationSequelize.close();
    }
  });

  it('rejects setup completion when another process holds the setup lock', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/locked.sqlite',
      SCHEDULER_ENABLED: 'false',
    };

    await writeFile('.env.setup.lock', 'another process\n', 'utf8');

    await expect(
      service.complete({
        administrator: {
          username: 'root_user',
          displayName: 'Root User',
          email: 'root@example.com',
          password: 'password123',
          confirmPassword: 'password123',
        },
        environment,
      }),
    ).rejects.toMatchObject({
      code: 'SETUP_IN_PROGRESS',
      status: 409,
    });
    await expect(readFile('.env', 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('tests sqlite database and memory cache connectivity', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/connectivity.sqlite',
    };

    await expect(service.testDatabase({ environment })).resolves.toEqual({
      connected: true,
      hasExistingUsers: false,
    });
    await expect(service.testCache({ environment })).resolves.toEqual({
      connected: true,
      store: 'memory',
    });
  });

  it('tests local file storage and non-network setup integrations', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      FILE_LOCAL_ROOT: './data/uploads',
    };

    await expect(service.testFileStorage({ environment })).resolves.toEqual({
      connected: true,
      driver: 'local',
    });
    await expect(service.testLogging({ environment })).resolves.toEqual({
      connected: true,
      target: 'console',
    });
    await expect(service.testEmail({ environment })).resolves.toEqual({
      connected: true,
      service: 'off',
    });
    await expect(service.testSso({ environment })).resolves.toEqual({
      connected: true,
      enabled: false,
    });
  });

  it('rejects empty fields that are active for the selected setup options', () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      CORS_ORIGINS: '',
    };

    expect(() => service.validateEnvironment({ environment })).toThrow('CORS_ORIGINS');
  });
});
