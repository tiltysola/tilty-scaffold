import { chmod, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { hostname, tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemRole } from '@tilty/shared/access-control';
import { configuredSecretPlaceholder } from '@tilty/shared/setup';

import { initModels } from '../src/composition/models';
import { loadConfigFileSource, loadEnv } from '../src/config/env';
import { resolveRuntimePath } from '../src/core/files';
import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { SmtpEmailSender } from '../src/modules/auth/auth.email';
import { SetupService } from '../src/modules/setup/setup.service';

const openApiMock = vi.hoisted(() => ({
  doRPCRequest: vi.fn(),
}));

vi.mock('@alicloud/openapi-core', () => ({
  default: class OpenApiClient {
    doRPCRequest = openApiMock.doRPCRequest;
  },
  $OpenApiUtil: {
    Config: class Config {
      constructor(input: Record<string, unknown>) {
        Object.assign(this, input);
      }
    },
    OpenApiRequest: class OpenApiRequest {
      constructor(input: Record<string, unknown>) {
        Object.assign(this, input);
      }
    },
  },
}));

describe('setup service', () => {
  let originalCwd: string;
  let temporaryRoot: string;

  beforeEach(async () => {
    openApiMock.doRPCRequest.mockReset();
    originalCwd = process.cwd();
    temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-setup-'));
    process.chdir(temporaryRoot);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await rm(temporaryRoot, { force: true, recursive: true });
  });

  it('generates defaults when no configuration file exists', () => {
    const service = new SetupService('setup');
    const defaults = service.getDefaults();

    expect(defaults.environmentFileLoaded).toBe(false);
    expect(defaults.environment.APP_DOMAIN).toBe('http://localhost:8011');
    expect(defaults.environment.DATABASE_DIALECT).toBe('sqlite');
    expect(defaults.environment.CACHE_REDIS_URL).toBe('redis://localhost:6379/0');
    expect(defaults.environment.EMAIL_SMTP_PROFILES).toBe('[]');
    expect(defaults.environment.SMS_VERIFICATION_SERVICE).toBe('off');
    expect(defaults.environment.AUTH_TOKEN_SECRET).toBe(configuredSecretPlaceholder);
  });

  it('loads existing configuration values when the setup lock is missing', async () => {
    await writeFile(
      'config.toml',
      [
        'NODE_ENV = "production"',
        'AUTH_TOKEN_SECRET = "existing-auth-token-secret-minimum-32-characters"',
        'DATABASE_URL = "postgres://user:database-password@db.example.com/app"',
        'DATABASE_STORAGE = "./data/existing-config.sqlite"',
        '',
      ].join('\n'),
      'utf8',
    );

    const service = new SetupService('setup');
    const defaults = service.getDefaults();

    expect(defaults.environmentFileLoaded).toBe(true);
    expect(defaults.environment.NODE_ENV).toBe('production');
    expect(defaults.environment.AUTH_TOKEN_SECRET).toBe(configuredSecretPlaceholder);
    expect(defaults.environment.DATABASE_URL).toBe(configuredSecretPlaceholder);
    expect(defaults.environment.DATABASE_STORAGE).toBe('./data/existing-config.sqlite');
    expect(defaults.environment.CACHE_STORE).toBe('memory');
    expect('SETUP_LOCKED' in defaults.environment).toBe(false);
  });

  it('loads existing configuration values when the setup lock is false', async () => {
    await writeFile('config.toml', 'SETUP_LOCKED = false\nDATABASE_STORAGE = "./data/unlocked.sqlite"\n', 'utf8');

    const service = new SetupService('setup');

    const defaults = service.getDefaults();

    expect(defaults.environmentFileLoaded).toBe(true);
    expect(defaults.environment.DATABASE_STORAGE).toBe('./data/unlocked.sqlite');
  });

  it('redacts and server-resolves nested provider secrets', async () => {
    await writeFile(
      'config.toml',
      [
        'SETUP_LOCKED = false',
        'AUTH_TOKEN_SECRET = "existing-auth-token-secret-minimum-32-characters"',
        'EMAIL_VERIFICATION_SERVICE = "smtp"',
        '[[EMAIL_SMTP_PROFILES]]',
        'from = "Tilty <noreply@example.com>"',
        'host = "smtp.example.com"',
        'password = "existing-smtp-password"',
        'port = 465',
        'secure = true',
        'startTls = false',
        'timeoutMs = 10000',
        'username = "smtp-user"',
        '',
      ].join('\n'),
      'utf8',
    );
    const service = new SetupService('setup');
    const defaults = service.getDefaults();
    const profiles = JSON.parse(defaults.environment.EMAIL_SMTP_PROFILES) as Array<Record<string, unknown>>;
    const checkSpy = vi.spyOn(SmtpEmailSender.prototype, 'check').mockResolvedValue(undefined);

    expect(profiles[0]?.password).toBe(configuredSecretPlaceholder);
    expect(defaults.environment.EMAIL_SMTP_PROFILES).not.toContain('existing-smtp-password');
    await expect(service.testEmail({ environment: defaults.environment })).resolves.toMatchObject({ connected: true });
    expect(checkSpy).toHaveBeenCalledOnce();
  });

  it('locks setup when the setup lock is true', async () => {
    await writeFile('config.toml', 'SETUP_LOCKED = true\nNODE_ENV = "development"\n', 'utf8');

    const service = new SetupService('setup');

    expect(getThrownError(() => service.getDefaults())).toMatchObject({
      code: 'SETUP_LOCKED',
      status: 403,
    });
  });

  it('writes configuration, migrates the database, and creates the root administrator', async () => {
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

    const configFile = await readFile('config.toml', 'utf8');

    expect(configFile).toContain('# Setup lock state.');
    expect(configFile).toContain('SETUP_LOCKED = true');
    expect(configFile).toContain('# SQLite database file path.');
    expect(configFile).toContain('DATABASE_STORAGE = "./data/setup.sqlite"');
    await expect(readFile('config.toml.setup.lock', 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(getThrownError(() => service.getDefaults())).toMatchObject({
      code: 'SETUP_LOCKED',
      status: 403,
    });

    const sequelize = createSequelize({ dialect: 'sqlite', storage: './data/setup.sqlite' });
    const models = initModels(sequelize);

    try {
      await expect(models.user.count()).resolves.toBe(1);
    } finally {
      await sequelize.close();
    }
  });

  it('writes profile arrays as TOML tables that reload as backend configuration', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/profile-config.sqlite',
      EMAIL_VERIFICATION_SERVICE: 'smtp',
      EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: '300000',
      EMAIL_VERIFICATION_CODE_COOLDOWN_MS: '30000',
      EMAIL_SMTP_PROFILES: JSON.stringify([
        {
          from: 'Tilty <noreply@example.com>',
          host: 'smtp.example.com',
          password: 'smtp-password',
          port: 465,
          secure: true,
          startTls: false,
          timeoutMs: 10_000,
          username: 'smtp-user',
        },
      ]),
      SMS_VERIFICATION_SERVICE: 'aliyun',
      SMS_VERIFICATION_CODE_EXPIRES_IN_MS: '300000',
      SMS_VERIFICATION_CODE_COOLDOWN_MS: '30000',
      SMS_ALICLOUD_PROFILES: JSON.stringify([
        {
          phoneCountryCode: '+86',
          apiVersion: '2017-05-25',
          operation: 'SendSms',
          regionId: 'cn-hangzhou',
          endpoint: 'dysmsapi.aliyuncs.com',
          accessKeyId: 'sms-access-key-id',
          accessKeySecret: 'sms-access-key-secret',
          signName: 'Tilty',
          templateCode: 'SMS_100000001',
        },
      ]),
      SCHEDULER_ENABLED: 'false',
      SSO_ENABLED: 'true',
      SSO_PROFILES: JSON.stringify([
        {
          id: 'corporate',
          name: 'Corporate',
          protocol: 'oidc',
          loginEnabled: true,
          bindingEnabled: true,
          clientId: 'sso-client-id',
          clientSecret: 'sso-client-secret',
          frontendCallbackUrl: 'http://localhost:8011/auth/sso/callback',
          redirectUri: 'http://localhost:3000/api/auth/sso/callback',
          requestTimeoutMs: 10_000,
          scopes: ['openid', 'email', 'profile'],
          issuerUrl: 'https://idp.example.com',
        },
      ]),
    };

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
    ).resolves.toMatchObject({
      completed: true,
    });

    const configFile = await readFile('config.toml', 'utf8');

    expect(configFile).toContain('[[EMAIL_SMTP_PROFILES]]');
    expect(configFile).toContain('[[SMS_ALICLOUD_PROFILES]]');
    expect(configFile).toContain('[[SSO_PROFILES]]');
    expect(configFile).toContain('# SMTP profile table array.');
    expect(configFile).toContain('# Aliyun SMS profile table array.');
    expect(configFile).toContain('# SSO provider profile table array.');
    expect(configFile).not.toContain(String.raw`EMAIL_SMTP_PROFILES = "[{\"`);

    const loadedEnvironment = loadEnv(loadConfigFileSource());

    expect(loadedEnvironment.email?.smtpProfiles).toHaveLength(1);
    expect(loadedEnvironment.sms?.aliyunProfiles).toHaveLength(1);
    expect(loadedEnvironment.sso?.profiles).toHaveLength(1);
  });

  it('creates a root administrator when available users exist without a root assignment', async () => {
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
      hasExistingAdministrator: false,
      hasExistingUsers: true,
    });
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
    ).resolves.toEqual({
      administratorCreated: true,
      completed: true,
      restartRequired: true,
    });

    await expect(readFile('config.toml', 'utf8')).resolves.toContain('SETUP_LOCKED = true');
    await expect(readFile('config.toml', 'utf8')).resolves.toContain(
      'DATABASE_STORAGE = "./data/existing-users.sqlite"',
    );

    const verificationSequelize = createSequelize({ dialect: 'sqlite', storage: './data/existing-users.sqlite' });
    const verificationModels = initModels(verificationSequelize);

    try {
      await expect(verificationModels.user.count()).resolves.toBe(2);
      await expect(verificationModels.user.findOne({ where: { email: 'existing@example.com' } })).resolves.toBeTruthy();
    } finally {
      await verificationSequelize.close();
    }
  });

  it('retains an existing available root administrator', async () => {
    const sequelize = createSequelize({ dialect: 'sqlite', storage: './data/existing-root.sqlite' });
    const models = initModels(sequelize);
    const accessControl = new AccessControlService(models);

    try {
      await createMigrator(sequelize).up();
      await accessControl.syncSystemAccessControl();
      const root = await models.user.create({
        username: 'existing_root',
        displayName: 'Existing Root',
        email: 'root@example.com',
      });

      await accessControl.assignSystemRoleToUser(root.id, SystemRole.Root);
    } finally {
      await sequelize.close();
    }

    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/existing-root.sqlite',
      SCHEDULER_ENABLED: 'false',
    };

    await expect(service.testDatabase({ environment })).resolves.toEqual({
      connected: true,
      hasExistingAdministrator: true,
      hasExistingUsers: true,
    });
    await expect(service.complete({ environment })).resolves.toEqual({
      administratorCreated: false,
      completed: true,
      restartRequired: true,
    });
  });

  it('rejects setup completion when another process holds the setup lock', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/locked.sqlite',
      SCHEDULER_ENABLED: 'false',
    };

    await writeFile('config.toml.setup.lock', 'another process\n', 'utf8');

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
    await expect(readFile('config.toml', 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers a stale setup lock owned by a stopped local process', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/stale-lock.sqlite',
      SCHEDULER_ENABLED: 'false',
    };

    await writeFile(
      'config.toml.setup.lock',
      `${JSON.stringify({ host: hostname(), owner: 'stale-owner', pid: Number.MAX_SAFE_INTEGER, startedAt: new Date().toISOString() })}\n`,
      'utf8',
    );

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
    ).resolves.toMatchObject({ completed: true });
  });

  it('checks configuration file writability before mutating the database during setup completion', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/preflight.sqlite',
      SCHEDULER_ENABLED: 'false',
    };

    await writeFile('config.toml', 'SETUP_LOCKED = false\n', 'utf8');
    await chmod('config.toml', 0o400);

    try {
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
        code: 'SETUP_CONFIG_WRITE_FAILED',
        status: 500,
      });
      await expect(readFile(resolveRuntimePath('./data/preflight.sqlite', 'DATABASE_STORAGE'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await chmod('config.toml', 0o600).catch(() => undefined);
    }
  });

  it('verifies sqlite database and memory cache connectivity', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/connectivity.sqlite',
    };

    await expect(service.testDatabase({ environment })).resolves.toEqual({
      connected: true,
      hasExistingAdministrator: false,
      hasExistingUsers: false,
    });
    await expect(service.testCache({ environment })).resolves.toEqual({
      connected: true,
      store: 'memory',
    });
  });

  it('rejects invalid database configuration during setup database testing', async () => {
    const service = new SetupService('setup');
    const baseEnvironment = service.getDefaults().environment;

    await expect(
      service.testDatabase({
        environment: {
          ...baseEnvironment,
          DATABASE_DIALECT: 'postgres',
          DATABASE_URL: 'postgres://app:password@localhost:5432/tilty',
          DATABASE_POOL_MAX: '1',
          DATABASE_POOL_MIN: '2',
        },
      }),
    ).rejects.toMatchObject({
      code: 'SETUP_ENV_INVALID',
      status: 400,
    });
    await expect(
      service.testDatabase({
        environment: {
          ...baseEnvironment,
          SERVER_MULTI_INSTANCE_ENABLED: 'true',
        },
      }),
    ).rejects.toMatchObject({
      code: 'SETUP_ENV_INVALID',
      status: 400,
    });
  });

  it('rejects metadata service targets during setup connection testing', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_DIALECT: 'postgres',
      DATABASE_URL: 'postgres://app:password@169.254.169.254:5432/app',
    };

    await expect(service.testDatabase({ environment })).rejects.toMatchObject({
      code: 'SETUP_NETWORK_TARGET_FORBIDDEN',
      details: {
        field: 'DATABASE_URL',
      },
      status: 400,
    });

    await expect(
      service.testDatabase({
        environment: {
          ...environment,
          DATABASE_URL: 'postgres://app:password@[::ffff:169.254.169.254]:5432/app',
        },
      }),
    ).rejects.toMatchObject({
      code: 'SETUP_NETWORK_TARGET_FORBIDDEN',
      status: 400,
    });
  });

  it('rejects nonempty databases without a compatible scaffold schema', async () => {
    const sequelize = createSequelize({ dialect: 'sqlite', storage: './data/foreign.sqlite' });

    try {
      await sequelize.query('CREATE TABLE foreign_records (id INTEGER PRIMARY KEY)');
    } finally {
      await sequelize.close();
    }

    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      DATABASE_STORAGE: './data/foreign.sqlite',
    };

    await expect(service.testDatabase({ environment })).rejects.toMatchObject({
      code: 'SETUP_DATABASE_INCOMPATIBLE',
      status: 400,
    });
  });

  it('verifies local file storage and non-network setup integrations', async () => {
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
    await expect(service.testSms({ environment })).resolves.toEqual({
      connected: true,
      service: 'off',
    });
    await expect(service.testSso({ environment })).resolves.toEqual({
      connected: true,
      enabled: false,
    });
  });

  it('verifies SMTP email credentials during setup testing', async () => {
    const service = new SetupService('setup');
    const checkSpy = vi.spyOn(SmtpEmailSender.prototype, 'check').mockResolvedValue(undefined);
    const environment = {
      ...service.getDefaults().environment,
      EMAIL_VERIFICATION_SERVICE: 'smtp',
      EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: '300000',
      EMAIL_VERIFICATION_CODE_COOLDOWN_MS: '30000',
      EMAIL_SMTP_PROFILES: JSON.stringify([
        {
          from: 'Tilty <noreply@example.com>',
          host: 'smtp.example.com',
          port: 465,
          secure: true,
          startTls: false,
          timeoutMs: 10_000,
        },
      ]),
    };

    await expect(service.testEmail({ environment })).resolves.toEqual({
      connected: true,
      service: 'smtp',
    });
    expect(checkSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects SMTP email credential failures during setup testing', async () => {
    const service = new SetupService('setup');
    vi.spyOn(SmtpEmailSender.prototype, 'check').mockRejectedValue(
      new Error('SMTP authentication failed for smtp://smtp-user:smtp-password@smtp.example.com.'),
    );
    const environment = {
      ...service.getDefaults().environment,
      EMAIL_VERIFICATION_SERVICE: 'smtp',
      EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: '300000',
      EMAIL_VERIFICATION_CODE_COOLDOWN_MS: '30000',
      EMAIL_SMTP_PROFILES: JSON.stringify([
        {
          from: 'Tilty <noreply@example.com>',
          host: 'smtp.example.com',
          password: 'smtp-password',
          port: 465,
          secure: true,
          startTls: false,
          timeoutMs: 10_000,
          username: 'smtp-user',
        },
      ]),
    };

    await expect(service.testEmail({ environment })).rejects.toMatchObject({
      code: 'SETUP_SMTP_CONNECTION_FAILED',
      details: {
        reason: 'authentication',
      },
      status: 400,
    });
  });

  it('verifies Aliyun SMS credentials without sending a message', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      SMS_VERIFICATION_SERVICE: 'aliyun',
      SMS_ALICLOUD_PROFILES: JSON.stringify([
        {
          phoneCountryCode: '+86',
          apiVersion: '2017-05-25',
          operation: 'SendSms',
          regionId: 'cn-hangzhou',
          endpoint: 'dysmsapi.aliyuncs.com',
          accessKeyId: 'test-access-key-id',
          accessKeySecret: 'test-access-key-secret',
          signName: 'Tilty',
          templateCode: 'SMS_100000001',
        },
      ]),
    };

    openApiMock.doRPCRequest.mockRejectedValue(
      Object.assign(new Error('The mobile number is invalid.'), {
        code: 'isv.MOBILE_NUMBER_ILLEGAL',
      }),
    );

    await expect(service.testSms({ environment })).resolves.toEqual({
      connected: true,
      service: 'aliyun',
      profileCountryCodes: ['+86'],
    });
    expect(openApiMock.doRPCRequest).toHaveBeenCalledWith(
      'SendSms',
      '2017-05-25',
      'https',
      'POST',
      'AK',
      'json',
      expect.objectContaining({
        query: expect.objectContaining({
          PhoneNumbers: '000',
          SignName: 'Tilty',
          TemplateCode: 'SMS_100000001',
        }),
      }),
      expect.objectContaining({
        connectTimeout: 10_000,
        readTimeout: 10_000,
      }),
    );
  });

  it('rejects Aliyun SMS credential failures during setup testing', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      SMS_VERIFICATION_SERVICE: 'aliyun',
      SMS_ALICLOUD_PROFILES: JSON.stringify([
        {
          phoneCountryCode: '+86',
          apiVersion: '2017-05-25',
          operation: 'SendSms',
          regionId: 'cn-hangzhou',
          endpoint: 'dysmsapi.aliyuncs.com',
          accessKeyId: 'invalid-access-key-id',
          accessKeySecret: 'invalid-access-key-secret',
          signName: 'Tilty',
          templateCode: 'SMS_100000001',
        },
      ]),
    };

    openApiMock.doRPCRequest.mockRejectedValue(
      Object.assign(new Error('The access key ID is invalid.'), {
        code: 'InvalidAccessKeyId',
      }),
    );

    await expect(service.testSms({ environment })).rejects.toMatchObject({
      code: 'SETUP_SMS_CONNECTION_FAILED',
      status: 400,
    });
  });

  it('rejects empty fields that are active for the selected setup options', () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      APP_CORS_ORIGINS: '',
    };

    expect(getThrownError(() => service.validateEnvironment({ environment }))).toMatchObject({
      code: 'SETUP_ENV_REQUIRED',
      details: {
        missing: ['APP_CORS_ORIGINS'],
      },
      status: 400,
    });
  });

  it('rejects empty or invalid CSP resource origin configuration', () => {
    const service = new SetupService('setup');
    const defaults = service.getDefaults().environment;

    expect(
      getThrownError(() =>
        service.validateEnvironment({
          environment: { ...defaults, APP_CSP_RESOURCE_ORIGINS: '' },
        }),
      ),
    ).toMatchObject({
      code: 'SETUP_ENV_REQUIRED',
      details: { missing: ['APP_CSP_RESOURCE_ORIGINS'] },
      status: 400,
    });
    expect(
      getThrownError(() =>
        service.validateEnvironment({
          environment: { ...defaults, APP_CSP_RESOURCE_ORIGINS: 'https://cdn.example.com/assets' },
          stepId: 'runtime',
        }),
      ),
    ).toMatchObject({
      code: 'SETUP_ENV_INVALID',
      details: { field: 'APP_CSP_RESOURCE_ORIGINS' },
      status: 400,
    });
  });

  it('validates only the selected setup step before completion', async () => {
    const service = new SetupService('setup');
    const environment = {
      ...service.getDefaults().environment,
      SMS_VERIFICATION_SERVICE: 'aliyun',
      SMS_ALICLOUD_PROFILES: '[]',
    };
    const futureStepEnvironment = {
      ...environment,
      SSO_ENABLED: 'true',
    };

    expect(service.validateEnvironment({ environment: futureStepEnvironment, stepId: 'runtime' })).toEqual({
      valid: true,
    });
    await expect(service.testSms({ environment })).rejects.toMatchObject({
      code: 'SETUP_ENV_INVALID',
      status: 400,
    });
    expect(
      getThrownError(() =>
        service.validate({
          administrator: {
            username: 'root_user',
            displayName: 'Root User',
            email: 'root@example.com',
            password: 'password123',
            confirmPassword: 'password123',
          },
          environment,
        }),
      ),
    ).toMatchObject({
      code: 'SETUP_ENV_INVALID',
      details: {
        reason: expect.stringContaining('SMS_ALICLOUD_PROFILES'),
      },
      status: 400,
    });
  });
});

function getThrownError(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error('Expected action to throw.');
}
