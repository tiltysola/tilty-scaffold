import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createSequelize } from '../src/infra/database';
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

  it('reports setup requirement and generates defaults when no environment file exists', () => {
    const service = new SetupService('setup');
    const status = service.getStatus();
    const defaults = service.getDefaults();

    expect(status).toMatchObject({
      locked: false,
      required: true,
    });
    expect(defaults.environment.DATABASE_DIALECT).toBe('sqlite');
    expect(defaults.environment.CACHE_REDIS_URL).toBe('redis://localhost:6379/0');
    expect(defaults.environment.AUTH_TOKEN_SECRET).toHaveLength(64);
  });

  it('locks setup when the environment file exists', async () => {
    await writeFile('.env', 'NODE_ENV=development\n', 'utf8');

    const service = new SetupService('setup');

    expect(service.getStatus()).toMatchObject({
      locked: true,
      required: false,
    });
    expect(() => service.getDefaults()).toThrow('Setup is locked');
  });

  it('writes environment, migrates the database, and creates the root administrator', async () => {
    const service = new SetupService('setup');
    const environment = service.getDefaults().environment;

    await expect(
      service.complete({
        administrator: {
          confirmPassword: 'password123',
          email: 'root@example.com',
          password: 'password123',
          username: 'Root User',
        },
        environment: {
          ...environment,
          DATABASE_STORAGE: './data/setup.sqlite',
          SCHEDULER_ENABLED: 'false',
        },
      }),
    ).resolves.toEqual({
      completed: true,
      restartRequired: true,
    });

    await expect(readFile('.env', 'utf8')).resolves.toContain('DATABASE_STORAGE=./data/setup.sqlite');
    expect(service.getStatus()).toMatchObject({
      locked: true,
      required: false,
    });

    const sequelize = createSequelize({ dialect: 'sqlite', storage: './data/setup.sqlite' });
    const models = initModels(sequelize);

    try {
      await expect(models.user.count()).resolves.toBe(1);
    } finally {
      await sequelize.close();
    }
  });

  it('tests sqlite database and memory cache connectivity', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/connectivity.sqlite',
    };

    await expect(service.testDatabase({ environment })).resolves.toEqual({
      connected: true,
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
