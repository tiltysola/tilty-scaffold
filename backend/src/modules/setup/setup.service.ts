import { randomBytes, randomUUID } from 'crypto';
import { open, rename, unlink, writeFile } from 'fs/promises';
import { z } from 'zod';

import { SystemRole } from '@tilty/shared/access-control';
import { hasMatchingPasswordConfirmation } from '@tilty/shared/validation';

import {
  getEnvFilePath,
  getEnvValidationMessage,
  hasEnvFile,
  isSetupLocked,
  loadEnv,
  loadEnvFileSource,
} from '../../config/env';
import { AppError } from '../../core/errors';
import { createCacheStore } from '../../infra/cache';
import { createSequelize } from '../../infra/database';
import { createFileStorage } from '../../infra/file-storage';
import { createMigrator } from '../../infra/migrator';
import { initAccessControlModels } from '../access-control/access-control.model';
import { AccessControlService } from '../access-control/access-control.service';
import { hashPassword } from '../auth/auth.crypto';
import { SmtpEmailSender } from '../auth/auth.email';
import { testSsoDiscovery } from '../auth/auth.sso';
import { initUserModel } from '../users/user.model';

type SetupMode = 'locked' | 'setup';
type SetupCompletionLock = {
  fileHandle: Awaited<ReturnType<typeof open>>;
  lockFilePath: string;
};

const setupLockedMessage = 'Setup is locked because SETUP_LOCKED is true.';

const setupEnvSchema = z
  .object({
    AUTH_ACCESS_TOKEN_COOKIE_NAME: z.string().trim().max(128),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.string().trim().max(16),
    AUTH_COOKIE_SAME_SITE: z.string().trim().max(16),
    AUTH_COOKIE_SECURE: z.string().trim().max(16),
    AUTH_RATE_LIMIT_MAX: z.string().trim().max(16),
    AUTH_RATE_LIMIT_WINDOW_MS: z.string().trim().max(16),
    AUTH_REFRESH_TOKEN_COOKIE_NAME: z.string().trim().max(128),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.string().trim().max(16),
    AUTH_TOKEN_SECRET: z.string().trim().max(256),
    CACHE_REDIS_REQUEST_TIMEOUT_MS: z.string().trim().max(16),
    CACHE_REDIS_URL: z.string().trim().max(1024),
    CACHE_STORE: z.string().trim().max(16),
    CORS_ORIGINS: z.string().trim().max(2048),
    DATABASE_CONNECT_TIMEOUT_MS: z.string().trim().max(16),
    DATABASE_DIALECT: z.string().trim().max(16),
    DATABASE_POOL_ACQUIRE_MS: z.string().trim().max(16),
    DATABASE_POOL_IDLE_MS: z.string().trim().max(16),
    DATABASE_POOL_MAX: z.string().trim().max(16),
    DATABASE_POOL_MIN: z.string().trim().max(16),
    DATABASE_SSL: z.string().trim().max(16),
    DATABASE_STORAGE: z.string().trim().max(1024),
    DATABASE_SYNC: z.string().trim().max(16),
    DATABASE_URL: z.string().trim().max(2048),
    EMAIL_VERIFICATION_CODE_COOLDOWN_MS: z.string().trim().max(16),
    EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: z.string().trim().max(16),
    EMAIL_VERIFICATION_SERVICE: z.string().trim().max(16),
    FILE_LOCAL_ROOT: z.string().trim().max(1024),
    FILE_OSS_ACCESS_KEY_ID: z.string().trim().max(512),
    FILE_OSS_ACCESS_KEY_SECRET: z.string().trim().max(512),
    FILE_OSS_BUCKET: z.string().trim().max(256),
    FILE_OSS_ENDPOINT: z.string().trim().max(512),
    FILE_OSS_PUBLIC_BASE_URL: z.string().trim().max(1024),
    FILE_OSS_REGION: z.string().trim().max(128),
    FILE_PUBLIC_BASE_URL: z.string().trim().max(1024),
    FILE_STORAGE_DRIVER: z.string().trim().max(16),
    FILE_UPLOAD_MAX_BYTES: z.string().trim().max(16),
    GLOBAL_RATE_LIMIT_MAX: z.string().trim().max(16),
    GLOBAL_RATE_LIMIT_WINDOW_MS: z.string().trim().max(16),
    LOG_LOCAL_PATH: z.string().trim().max(1024),
    LOG_PENDING_WRITE_MAX: z.string().trim().max(16),
    LOG_REQUEST_ENABLED: z.string().trim().max(16),
    LOG_SLS_ACCESS_KEY_ID: z.string().trim().max(512),
    LOG_SLS_ACCESS_KEY_SECRET: z.string().trim().max(512),
    LOG_SLS_ENDPOINT: z.string().trim().max(512),
    LOG_SLS_LOGSTORE: z.string().trim().max(256),
    LOG_SLS_PROJECT: z.string().trim().max(256),
    LOG_SLS_SOURCE: z.string().trim().max(128),
    LOG_SLS_TOPIC: z.string().trim().max(128),
    LOG_TARGETS: z.string().trim().max(128),
    LOG_WRITE_TIMEOUT_MS: z.string().trim().max(16),
    MULTI_INSTANCE_ENABLED: z.string().trim().max(16),
    NODE_ENV: z.string().trim().max(32),
    SCHEDULER_ENABLED: z.string().trim().max(16),
    SCHEDULER_LOCK_TTL_MS: z.string().trim().max(16),
    SERVER_HOST: z.string().trim().max(255),
    SERVER_PORT: z.string().trim().max(16),
    SMTP_FROM: z.string().trim().max(512),
    SMTP_HOST: z.string().trim().max(512),
    SMTP_PASSWORD: z.string().trim().max(512),
    SMTP_PORT: z.string().trim().max(16),
    SMTP_REQUEST_TIMEOUT_MS: z.string().trim().max(16),
    SMTP_SECURE: z.string().trim().max(16),
    SMTP_STARTTLS: z.string().trim().max(16),
    SMTP_USERNAME: z.string().trim().max(512),
    SSO_CLIENT_ID: z.string().trim().max(512),
    SSO_CLIENT_SECRET: z.string().trim().max(512),
    SSO_ENABLED: z.string().trim().max(16),
    SSO_FRONTEND_CALLBACK_URL: z.string().trim().max(1024),
    SSO_ISSUER_URL: z.string().trim().max(1024),
    SSO_REDIRECT_URI: z.string().trim().max(1024),
    SSO_REQUEST_TIMEOUT_MS: z.string().trim().max(16),
    SSO_SCOPES: z.string().trim().max(256),
    TRUST_PROXY: z.string().trim().max(16),
  })
  .strict();

const administratorSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/)
      .transform((username) => username.toLowerCase()),
    displayName: z.string().trim().min(2).max(64),
    email: z
      .string()
      .trim()
      .max(255)
      .pipe(z.email())
      .transform((email) => email.toLowerCase()),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine(hasMatchingPasswordConfirmation, {
    message: 'Password confirmation does not match.',
    path: ['confirmPassword'],
  });

const setupCompleteSchema = z.object({
  administrator: administratorSchema.optional(),
  environment: setupEnvSchema,
});
const setupEnvironmentInputSchema = z.object({
  environment: setupEnvSchema,
});
const setupDatabaseDialectSchema = z.enum(['mysql', 'postgres', 'sqlite']);
const setupCacheStoreSchema = z.enum(['memory', 'redis']);
const setupFileStorageDriverSchema = z.enum(['local', 'oss']);

export type SetupEnvironment = z.infer<typeof setupEnvSchema>;
type SetupCompleteInput = z.infer<typeof setupCompleteSchema>;

let setupCompletionInProgress = false;

export class SetupService {
  constructor(private readonly mode: SetupMode) {}

  getDefaults() {
    this.assertSetupAvailable();

    return {
      environment: getDefaultSetupEnvironment(),
      environmentFileLoaded: hasEnvFile(),
    };
  }

  validate(input: unknown) {
    this.assertSetupAvailable();

    const parsed = setupCompleteSchema.parse(input);

    assertValidEnvironment(parsed.environment);

    return {
      valid: true,
    } as const;
  }

  validateEnvironment(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);

    assertValidEnvironment(environment);

    return {
      valid: true,
    } as const;
  }

  async testDatabase(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);
    const sequelize = createSequelize(toDatabaseConfig(environment));

    try {
      await sequelize.authenticate();
      const hasExistingUsers = await hasAvailableUsers(sequelize);

      return {
        connected: true,
        hasExistingUsers,
      } as const;
    } catch (error) {
      throw new AppError('SETUP_DATABASE_CONNECTION_FAILED', getConnectionErrorMessage(error), 400);
    } finally {
      await sequelize.close();
    }
  }

  async testCache(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);
    const cacheConfig = toCacheConfig(environment);
    const cache = createCacheStore(cacheConfig);

    try {
      await cache.check();

      return {
        connected: true,
        store: cacheConfig.store,
      } as const;
    } catch (error) {
      throw new AppError('SETUP_CACHE_CONNECTION_FAILED', getConnectionErrorMessage(error), 400);
    } finally {
      await cache.close();
    }
  }

  async testFileStorage(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);
    const config = toFileStorageConfig(environment);
    const storage = createFileStorage(config);
    const key = `setup-tests/${randomUUID()}.txt`;

    try {
      await storage.save({
        content: Buffer.from('setup file storage test\n', 'utf8'),
        contentType: 'text/plain',
        key,
      });
      await storage.delete(key);

      return {
        connected: true,
        driver: config.driver,
      } as const;
    } catch (error) {
      throw new AppError('SETUP_FILE_STORAGE_CONNECTION_FAILED', getConnectionErrorMessage(error), 400);
    }
  }

  async testLogging(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);
    const envSource = assertValidEnvironment(environment);
    const logTargets = parseLogTargets(environment.LOG_TARGETS);

    if (!logTargets.includes('sls')) {
      return {
        connected: true,
        target: logTargets.includes('local') ? 'local' : 'console',
      } as const;
    }

    try {
      const [openApiModule, slsModule] = await Promise.all([
        import('@alicloud/openapi-core'),
        import('@alicloud/sls20201230'),
      ]);
      const { $OpenApiUtil } = openApiModule;
      const {
        default: SlsClient,
        LogContent,
        LogGroup,
        LogItem,
        PutLogsRequest,
      } = slsModule as unknown as typeof import('@alicloud/sls20201230/dist/client');
      const client = new SlsClient(
        new $OpenApiUtil.Config({
          accessKeyId: envSource.LOG_SLS_ACCESS_KEY_ID!,
          accessKeySecret: envSource.LOG_SLS_ACCESS_KEY_SECRET!,
          endpoint: envSource.LOG_SLS_ENDPOINT!,
        }),
      );

      await client.putLogs(
        envSource.LOG_SLS_PROJECT!,
        envSource.LOG_SLS_LOGSTORE!,
        new PutLogsRequest({
          body: new LogGroup({
            logItems: [
              new LogItem({
                contents: [
                  new LogContent({ key: 'message', value: 'setup SLS connectivity test' }),
                  new LogContent({ key: 'source', value: envSource.LOG_SLS_SOURCE ?? 'backend' }),
                ],
                time: Math.floor(Date.now() / 1000),
              }),
            ],
            source: envSource.LOG_SLS_SOURCE ?? 'backend',
            topic: envSource.LOG_SLS_TOPIC ?? 'tilty-scaffold',
          }),
        }),
      );

      return {
        connected: true,
        target: 'sls',
      } as const;
    } catch (error) {
      throw new AppError('SETUP_SLS_CONNECTION_FAILED', getConnectionErrorMessage(error), 400);
    }
  }

  async testEmail(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);
    const envSource = assertValidEnvironment(environment);

    if (environment.EMAIL_VERIFICATION_SERVICE.trim() !== 'smtp') {
      return {
        connected: true,
        service: 'off',
      } as const;
    }

    try {
      await new SmtpEmailSender({
        from: envSource.SMTP_FROM!,
        host: envSource.SMTP_HOST!,
        port: Number(envSource.SMTP_PORT),
        secure: envSource.SMTP_SECURE === 'true',
        startTls: envSource.SMTP_STARTTLS === 'true',
        timeoutMs: Number(envSource.SMTP_REQUEST_TIMEOUT_MS),
        ...(envSource.SMTP_USERNAME
          ? {
              password: envSource.SMTP_PASSWORD!,
              username: envSource.SMTP_USERNAME,
            }
          : {}),
      }).check();

      return {
        connected: true,
        service: 'smtp',
      } as const;
    } catch (error) {
      throw new AppError('SETUP_SMTP_CONNECTION_FAILED', getConnectionErrorMessage(error), 400);
    }
  }

  async testSso(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);
    const environmentConfig = loadEnv(assertValidEnvironment(environment));

    if (!environmentConfig.sso) {
      return {
        connected: true,
        enabled: false,
      } as const;
    }

    try {
      await testSsoDiscovery(environmentConfig.sso);

      return {
        connected: true,
        enabled: true,
      } as const;
    } catch (error) {
      throw new AppError('SETUP_SSO_CONNECTION_FAILED', getConnectionErrorMessage(error), 400);
    }
  }

  async complete(input: unknown) {
    this.assertSetupAvailable();

    if (setupCompletionInProgress) {
      throw new AppError('SETUP_IN_PROGRESS', 'Setup is already running.', 409);
    }

    setupCompletionInProgress = true;
    let setupCompletionLock: SetupCompletionLock | undefined;

    try {
      const setupRequest = setupCompleteSchema.parse(input);
      const setupEnvironmentSource = assertValidEnvironment(setupRequest.environment);

      setupCompletionLock = await acquireSetupCompletionLock();
      this.assertSetupAvailable();

      const administratorCreated = await provisionDatabase(setupEnvironmentSource, setupRequest.administrator);
      await writeEnvironmentFile(setupEnvironmentSource);

      return {
        administratorCreated,
        completed: true,
        restartRequired: true,
      } as const;
    } finally {
      setupCompletionInProgress = false;
      if (setupCompletionLock) {
        await releaseSetupCompletionLock(setupCompletionLock);
      }
    }
  }

  private assertSetupAvailable() {
    if (this.mode === 'locked' || isSetupLocked()) {
      throw new AppError('SETUP_LOCKED', setupLockedMessage, 403);
    }
  }
}

async function provisionDatabase(
  setupEnvironmentSource: NodeJS.ProcessEnv,
  administratorInput: SetupCompleteInput['administrator'],
) {
  const environmentConfig = loadEnv(setupEnvironmentSource);
  const sequelize = createSequelize(environmentConfig.database);
  const models = {
    ...initAccessControlModels(sequelize),
    user: initUserModel(sequelize),
  };
  const accessControl = new AccessControlService(models);

  try {
    await sequelize.authenticate();
    await createMigrator(sequelize).up();
    await accessControl.syncSystemAccessControl();

    const existingUsers = await models.user.count({
      where: {
        available: true,
      },
    });

    if (existingUsers > 0) {
      return false;
    }

    const administrator = administratorSchema.parse(administratorInput);
    const credentials = await hashPassword(administrator.password);
    const user = await models.user.create({
      username: administrator.username,
      displayName: administrator.displayName,
      email: administrator.email,
      ...credentials,
    });

    await accessControl.assignSystemRoleToUser(user.id, SystemRole.Root);
    return true;
  } finally {
    await sequelize.close();
  }
}

async function hasAvailableUsers(sequelize: ReturnType<typeof createSequelize>) {
  const tableNames = await sequelize.getQueryInterface().showAllTables();
  const usersTableExists = tableNames.some((tableName) => normalizeTableName(tableName) === 'users');

  if (!usersTableExists) {
    return false;
  }

  const userModel = initUserModel(sequelize);

  return (
    (await userModel.count({
      where: {
        available: true,
      },
    })) > 0
  );
}

function normalizeTableName(tableName: unknown) {
  if (typeof tableName === 'string') {
    return tableName.toLowerCase();
  }

  if (tableName && typeof tableName === 'object') {
    if ('tableName' in tableName && typeof tableName.tableName === 'string') {
      return tableName.tableName.toLowerCase();
    }

    if ('name' in tableName && typeof tableName.name === 'string') {
      return tableName.name.toLowerCase();
    }
  }

  return '';
}

function assertValidEnvironment(environment: SetupEnvironment) {
  assertRequiredEnvironment(environment);

  const environmentSource = toEnvironmentSource(environment);
  const validationMessage = getEnvValidationMessage(environmentSource);

  if (validationMessage) {
    throw new AppError('SETUP_ENV_INVALID', validationMessage, 400);
  }

  return environmentSource;
}

function toEnvironmentSource(environment: SetupEnvironment): NodeJS.ProcessEnv {
  const environmentSource: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(environment)) {
    const normalized = value.trim();

    if (normalized) {
      environmentSource[key] = normalized;
    }
  }

  return environmentSource;
}

function toDatabaseConfig(environment: SetupEnvironment) {
  const dialect = setupDatabaseDialectSchema.parse(environment.DATABASE_DIALECT.trim());

  if (dialect === 'sqlite') {
    assertRequiredFields(environment, ['DATABASE_STORAGE']);

    return {
      dialect,
      storage: environment.DATABASE_STORAGE.trim(),
    };
  }

  assertRequiredFields(environment, [
    'DATABASE_URL',
    'DATABASE_CONNECT_TIMEOUT_MS',
    'DATABASE_POOL_ACQUIRE_MS',
    'DATABASE_POOL_IDLE_MS',
    'DATABASE_POOL_MAX',
    'DATABASE_POOL_MIN',
    'DATABASE_SSL',
  ]);

  return {
    connectTimeoutMs: parsePositiveInteger(environment.DATABASE_CONNECT_TIMEOUT_MS, 'DATABASE_CONNECT_TIMEOUT_MS'),
    dialect,
    pool: {
      acquire: parsePositiveInteger(environment.DATABASE_POOL_ACQUIRE_MS, 'DATABASE_POOL_ACQUIRE_MS'),
      idle: parsePositiveInteger(environment.DATABASE_POOL_IDLE_MS, 'DATABASE_POOL_IDLE_MS'),
      max: parsePositiveInteger(environment.DATABASE_POOL_MAX, 'DATABASE_POOL_MAX'),
      min: parseNonNegativeInteger(environment.DATABASE_POOL_MIN, 'DATABASE_POOL_MIN'),
    },
    ssl: environment.DATABASE_SSL.trim() === 'true',
    url: environment.DATABASE_URL.trim(),
  };
}

function toCacheConfig(environment: SetupEnvironment) {
  const store = setupCacheStoreSchema.parse(environment.CACHE_STORE.trim());

  if (store === 'memory') {
    return {
      store,
    } as const;
  }

  assertRequiredFields(environment, ['CACHE_REDIS_REQUEST_TIMEOUT_MS', 'CACHE_REDIS_URL']);

  return {
    store,
    timeoutMs: parsePositiveInteger(environment.CACHE_REDIS_REQUEST_TIMEOUT_MS, 'CACHE_REDIS_REQUEST_TIMEOUT_MS'),
    url: environment.CACHE_REDIS_URL.trim(),
  } as const;
}

function toFileStorageConfig(environment: SetupEnvironment) {
  const driver = setupFileStorageDriverSchema.parse(environment.FILE_STORAGE_DRIVER.trim());

  if (driver === 'local') {
    assertRequiredFields(environment, ['FILE_LOCAL_ROOT', 'FILE_PUBLIC_BASE_URL', 'FILE_UPLOAD_MAX_BYTES']);

    return {
      driver,
      publicBaseUrl: environment.FILE_PUBLIC_BASE_URL.trim(),
      root: environment.FILE_LOCAL_ROOT.trim(),
    } as const;
  }

  assertRequiredFields(environment, [
    'FILE_OSS_ACCESS_KEY_ID',
    'FILE_OSS_ACCESS_KEY_SECRET',
    'FILE_OSS_BUCKET',
    'FILE_OSS_ENDPOINT',
    'FILE_UPLOAD_MAX_BYTES',
    'FILE_OSS_REGION',
  ]);

  const environmentConfig = loadEnv(assertValidEnvironment(environment));

  if (environmentConfig.fileStorage.driver !== 'oss') {
    throw new AppError('SETUP_ENV_INVALID', 'OSS file storage configuration is invalid.', 400);
  }

  return environmentConfig.fileStorage;
}

function parseLogTargets(value: string) {
  return value
    .split(',')
    .map((target) => target.trim())
    .filter(Boolean);
}

function assertRequiredEnvironment(environment: SetupEnvironment) {
  assertRequiredFields(environment, [
    'AUTH_ACCESS_TOKEN_COOKIE_NAME',
    'AUTH_ACCESS_TOKEN_TTL_SECONDS',
    'AUTH_COOKIE_SAME_SITE',
    'AUTH_COOKIE_SECURE',
    'AUTH_RATE_LIMIT_MAX',
    'AUTH_RATE_LIMIT_WINDOW_MS',
    'AUTH_REFRESH_TOKEN_COOKIE_NAME',
    'AUTH_REFRESH_TOKEN_TTL_SECONDS',
    'AUTH_TOKEN_SECRET',
    'CACHE_STORE',
    'CORS_ORIGINS',
    'DATABASE_DIALECT',
    'DATABASE_SYNC',
    'EMAIL_VERIFICATION_SERVICE',
    'FILE_STORAGE_DRIVER',
    'FILE_UPLOAD_MAX_BYTES',
    'GLOBAL_RATE_LIMIT_MAX',
    'GLOBAL_RATE_LIMIT_WINDOW_MS',
    'LOG_PENDING_WRITE_MAX',
    'LOG_REQUEST_ENABLED',
    'LOG_TARGETS',
    'LOG_WRITE_TIMEOUT_MS',
    'MULTI_INSTANCE_ENABLED',
    'NODE_ENV',
    'SCHEDULER_ENABLED',
    'SCHEDULER_LOCK_TTL_MS',
    'SERVER_HOST',
    'SERVER_PORT',
    'SSO_ENABLED',
    'TRUST_PROXY',
  ]);

  if (environment.DATABASE_DIALECT.trim() === 'sqlite') {
    assertRequiredFields(environment, ['DATABASE_STORAGE']);
  } else {
    assertRequiredFields(environment, [
      'DATABASE_CONNECT_TIMEOUT_MS',
      'DATABASE_POOL_ACQUIRE_MS',
      'DATABASE_POOL_IDLE_MS',
      'DATABASE_POOL_MAX',
      'DATABASE_POOL_MIN',
      'DATABASE_SSL',
      'DATABASE_URL',
    ]);
  }

  if (environment.CACHE_STORE.trim() === 'redis') {
    assertRequiredFields(environment, ['CACHE_REDIS_REQUEST_TIMEOUT_MS', 'CACHE_REDIS_URL']);
  }

  if (environment.FILE_STORAGE_DRIVER.trim() === 'local') {
    assertRequiredFields(environment, ['FILE_LOCAL_ROOT', 'FILE_PUBLIC_BASE_URL']);
  } else {
    assertRequiredFields(environment, [
      'FILE_OSS_ACCESS_KEY_ID',
      'FILE_OSS_ACCESS_KEY_SECRET',
      'FILE_OSS_BUCKET',
      'FILE_OSS_ENDPOINT',
      'FILE_OSS_REGION',
    ]);
  }

  const logTargets = parseLogTargets(environment.LOG_TARGETS);

  if (logTargets.includes('local')) {
    assertRequiredFields(environment, ['LOG_LOCAL_PATH']);
  }

  if (logTargets.includes('sls')) {
    assertRequiredFields(environment, [
      'LOG_SLS_ACCESS_KEY_ID',
      'LOG_SLS_ACCESS_KEY_SECRET',
      'LOG_SLS_ENDPOINT',
      'LOG_SLS_LOGSTORE',
      'LOG_SLS_PROJECT',
      'LOG_SLS_SOURCE',
      'LOG_SLS_TOPIC',
    ]);
  }

  if (environment.EMAIL_VERIFICATION_SERVICE.trim() === 'smtp') {
    assertRequiredFields(environment, [
      'EMAIL_VERIFICATION_CODE_COOLDOWN_MS',
      'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS',
      'SMTP_FROM',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_REQUEST_TIMEOUT_MS',
      'SMTP_SECURE',
      'SMTP_STARTTLS',
    ]);
  }

  if (environment.SSO_ENABLED.trim() === 'true') {
    assertRequiredFields(environment, [
      'SSO_CLIENT_ID',
      'SSO_CLIENT_SECRET',
      'SSO_FRONTEND_CALLBACK_URL',
      'SSO_ISSUER_URL',
      'SSO_REDIRECT_URI',
      'SSO_REQUEST_TIMEOUT_MS',
      'SSO_SCOPES',
    ]);
  }
}

function assertRequiredFields(environment: SetupEnvironment, keys: Array<keyof SetupEnvironment>) {
  const missing = keys.filter((key) => !environment[key].trim());

  if (missing.length > 0) {
    throw new AppError('SETUP_ENV_REQUIRED', `Required setup field(s) are empty: ${missing.join(', ')}.`, 400);
  }
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value.trim());

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError('SETUP_ENV_INVALID', `${label} must be a positive integer.`, 400);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, label: string) {
  const parsed = Number(value.trim());

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AppError('SETUP_ENV_INVALID', `${label} must be a non-negative integer.`, 400);
  }

  return parsed;
}

function getConnectionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Connection test could not be completed.';
}

async function acquireSetupCompletionLock(): Promise<SetupCompletionLock> {
  const setupCompletionLockFilePath = `${getEnvFilePath()}.setup.lock`;
  let setupCompletionLockFileHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    setupCompletionLockFileHandle = await open(setupCompletionLockFilePath, 'wx', 0o600);
    await setupCompletionLockFileHandle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`, 'utf8');

    return {
      fileHandle: setupCompletionLockFileHandle,
      lockFilePath: setupCompletionLockFilePath,
    };
  } catch (error) {
    if (setupCompletionLockFileHandle) {
      await setupCompletionLockFileHandle.close().catch(() => undefined);
      await unlink(setupCompletionLockFilePath).catch(() => undefined);
    }

    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new AppError('SETUP_IN_PROGRESS', 'Setup is already running.', 409);
    }

    throw error;
  }
}

async function releaseSetupCompletionLock(lock: SetupCompletionLock) {
  await lock.fileHandle.close().catch(() => undefined);
  await unlink(lock.lockFilePath).catch(() => undefined);
}

async function writeEnvironmentFile(setupEnvironmentSource: NodeJS.ProcessEnv) {
  if (isSetupLocked()) {
    throw new AppError('SETUP_LOCKED', setupLockedMessage, 403);
  }

  const environmentFilePath = getEnvFilePath();
  const temporaryEnvironmentFilePath = `${environmentFilePath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryEnvironmentFilePath, renderEnvironmentFile(setupEnvironmentSource), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    if (isSetupLocked()) {
      throw new AppError('SETUP_LOCKED', setupLockedMessage, 403);
    }
    await rename(temporaryEnvironmentFilePath, environmentFilePath);
  } catch (error) {
    await unlink(temporaryEnvironmentFilePath).catch(() => undefined);
    throw error;
  }
}

function renderEnvironmentFile(setupEnvironmentSource: NodeJS.ProcessEnv) {
  const environmentFileLines = [
    '# Generated by the setup process.',
    '# Do not commit this file.',
    '',
    '# Setup',
    'SETUP_LOCKED=true',
    '',
  ];

  for (const environmentGroup of envGroups) {
    environmentFileLines.push(`# ${environmentGroup.name}`);

    for (const environmentKey of environmentGroup.keys) {
      const environmentValue = setupEnvironmentSource[environmentKey];

      if (environmentValue !== undefined) {
        environmentFileLines.push(`${environmentKey}=${formatEnvValue(environmentValue)}`);
      }
    }

    environmentFileLines.push('');
  }

  return `${environmentFileLines.join('\n').trimEnd()}\n`;
}

function formatEnvValue(value: string) {
  if (/^[A-Za-z0-9_./:@,+-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function getDefaultSetupEnvironment() {
  const setupEnvironment: SetupEnvironment = {
    ...defaultSetupEnvironment,
    ...getExistingSetupEnvironment(),
  };

  if (!setupEnvironment.AUTH_TOKEN_SECRET.trim()) {
    setupEnvironment.AUTH_TOKEN_SECRET = generateSecret();
  }

  return setupEnvironment;
}

function getExistingSetupEnvironment() {
  const environmentFileSource = loadEnvFileSource();
  const existingSetupEnvironment: Partial<SetupEnvironment> = {};

  for (const environmentKey of Object.keys(defaultSetupEnvironment) as Array<keyof SetupEnvironment>) {
    const environmentValue = environmentFileSource[environmentKey];

    if (environmentValue !== undefined) {
      existingSetupEnvironment[environmentKey] = environmentValue;
    }
  }

  return existingSetupEnvironment;
}

function generateSecret() {
  return randomBytes(48).toString('base64url');
}

const defaultSetupEnvironment = {
  AUTH_ACCESS_TOKEN_COOKIE_NAME: 'tilty_scaffold_access_token',
  AUTH_ACCESS_TOKEN_TTL_SECONDS: '900',
  AUTH_COOKIE_SAME_SITE: 'lax',
  AUTH_COOKIE_SECURE: 'auto',
  AUTH_RATE_LIMIT_MAX: '10',
  AUTH_RATE_LIMIT_WINDOW_MS: '60000',
  AUTH_REFRESH_TOKEN_COOKIE_NAME: 'tilty_scaffold_refresh_token',
  AUTH_REFRESH_TOKEN_TTL_SECONDS: '2592000',
  AUTH_TOKEN_SECRET: '',
  CACHE_REDIS_REQUEST_TIMEOUT_MS: '10000',
  CACHE_REDIS_URL: 'redis://localhost:6379/0',
  CACHE_STORE: 'memory',
  CORS_ORIGINS: 'http://localhost:8011',
  DATABASE_CONNECT_TIMEOUT_MS: '10000',
  DATABASE_DIALECT: 'sqlite',
  DATABASE_POOL_ACQUIRE_MS: '30000',
  DATABASE_POOL_IDLE_MS: '10000',
  DATABASE_POOL_MAX: '10',
  DATABASE_POOL_MIN: '0',
  DATABASE_SSL: 'false',
  DATABASE_STORAGE: './data/database.sqlite',
  DATABASE_SYNC: 'off',
  DATABASE_URL: '',
  EMAIL_VERIFICATION_CODE_COOLDOWN_MS: '60000',
  EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: '600000',
  EMAIL_VERIFICATION_SERVICE: 'off',
  FILE_LOCAL_ROOT: './data/uploads',
  FILE_OSS_ACCESS_KEY_ID: '',
  FILE_OSS_ACCESS_KEY_SECRET: '',
  FILE_OSS_BUCKET: '',
  FILE_OSS_ENDPOINT: '',
  FILE_OSS_PUBLIC_BASE_URL: '',
  FILE_OSS_REGION: '',
  FILE_PUBLIC_BASE_URL: '/uploads',
  FILE_STORAGE_DRIVER: 'local',
  FILE_UPLOAD_MAX_BYTES: '2097152',
  GLOBAL_RATE_LIMIT_MAX: '1000',
  GLOBAL_RATE_LIMIT_WINDOW_MS: '60000',
  LOG_LOCAL_PATH: './logs/backend.log',
  LOG_PENDING_WRITE_MAX: '1000',
  LOG_REQUEST_ENABLED: 'true',
  LOG_SLS_ACCESS_KEY_ID: '',
  LOG_SLS_ACCESS_KEY_SECRET: '',
  LOG_SLS_ENDPOINT: '',
  LOG_SLS_LOGSTORE: '',
  LOG_SLS_PROJECT: '',
  LOG_SLS_SOURCE: 'backend',
  LOG_SLS_TOPIC: 'tilty-scaffold',
  LOG_TARGETS: 'console',
  LOG_WRITE_TIMEOUT_MS: '5000',
  MULTI_INSTANCE_ENABLED: 'false',
  NODE_ENV: 'development',
  SCHEDULER_ENABLED: 'true',
  SCHEDULER_LOCK_TTL_MS: '300000',
  SERVER_HOST: '0.0.0.0',
  SERVER_PORT: '3000',
  SMTP_FROM: '',
  SMTP_HOST: '',
  SMTP_PASSWORD: '',
  SMTP_PORT: '465',
  SMTP_REQUEST_TIMEOUT_MS: '10000',
  SMTP_SECURE: 'true',
  SMTP_STARTTLS: 'false',
  SMTP_USERNAME: '',
  SSO_CLIENT_ID: '',
  SSO_CLIENT_SECRET: '',
  SSO_ENABLED: 'false',
  SSO_FRONTEND_CALLBACK_URL: 'http://localhost:8011/login',
  SSO_ISSUER_URL: '',
  SSO_REDIRECT_URI: '',
  SSO_REQUEST_TIMEOUT_MS: '10000',
  SSO_SCOPES: 'openid profile email',
  TRUST_PROXY: 'false',
} satisfies SetupEnvironment;

const envGroups = [
  {
    name: 'Runtime',
    keys: ['NODE_ENV', 'SERVER_HOST', 'SERVER_PORT', 'TRUST_PROXY', 'MULTI_INSTANCE_ENABLED', 'CORS_ORIGINS'],
  },
  {
    name: 'Logging',
    keys: [
      'LOG_REQUEST_ENABLED',
      'LOG_TARGETS',
      'LOG_LOCAL_PATH',
      'LOG_PENDING_WRITE_MAX',
      'LOG_WRITE_TIMEOUT_MS',
      'LOG_SLS_ENDPOINT',
      'LOG_SLS_PROJECT',
      'LOG_SLS_LOGSTORE',
      'LOG_SLS_ACCESS_KEY_ID',
      'LOG_SLS_ACCESS_KEY_SECRET',
      'LOG_SLS_TOPIC',
      'LOG_SLS_SOURCE',
    ],
  },
  {
    name: 'Cache',
    keys: ['CACHE_STORE', 'CACHE_REDIS_URL', 'CACHE_REDIS_REQUEST_TIMEOUT_MS'],
  },
  {
    name: 'Files',
    keys: [
      'FILE_STORAGE_DRIVER',
      'FILE_UPLOAD_MAX_BYTES',
      'FILE_PUBLIC_BASE_URL',
      'FILE_LOCAL_ROOT',
      'FILE_OSS_ACCESS_KEY_ID',
      'FILE_OSS_ACCESS_KEY_SECRET',
      'FILE_OSS_BUCKET',
      'FILE_OSS_ENDPOINT',
      'FILE_OSS_REGION',
      'FILE_OSS_PUBLIC_BASE_URL',
    ],
  },
  {
    name: 'Rate limits',
    keys: ['AUTH_RATE_LIMIT_WINDOW_MS', 'AUTH_RATE_LIMIT_MAX', 'GLOBAL_RATE_LIMIT_WINDOW_MS', 'GLOBAL_RATE_LIMIT_MAX'],
  },
  {
    name: 'Database',
    keys: [
      'DATABASE_DIALECT',
      'DATABASE_STORAGE',
      'DATABASE_URL',
      'DATABASE_CONNECT_TIMEOUT_MS',
      'DATABASE_POOL_MAX',
      'DATABASE_POOL_MIN',
      'DATABASE_POOL_ACQUIRE_MS',
      'DATABASE_POOL_IDLE_MS',
      'DATABASE_SSL',
      'DATABASE_SYNC',
    ],
  },
  {
    name: 'Scheduler',
    keys: ['SCHEDULER_ENABLED', 'SCHEDULER_LOCK_TTL_MS'],
  },
  {
    name: 'Authentication',
    keys: [
      'AUTH_TOKEN_SECRET',
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
      'AUTH_REFRESH_TOKEN_TTL_SECONDS',
      'AUTH_ACCESS_TOKEN_COOKIE_NAME',
      'AUTH_REFRESH_TOKEN_COOKIE_NAME',
      'AUTH_COOKIE_SAME_SITE',
      'AUTH_COOKIE_SECURE',
    ],
  },
  {
    name: 'Email',
    keys: [
      'EMAIL_VERIFICATION_SERVICE',
      'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS',
      'EMAIL_VERIFICATION_CODE_COOLDOWN_MS',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_SECURE',
      'SMTP_STARTTLS',
      'SMTP_FROM',
      'SMTP_USERNAME',
      'SMTP_PASSWORD',
      'SMTP_REQUEST_TIMEOUT_MS',
    ],
  },
  {
    name: 'SSO',
    keys: [
      'SSO_ENABLED',
      'SSO_ISSUER_URL',
      'SSO_CLIENT_ID',
      'SSO_CLIENT_SECRET',
      'SSO_REDIRECT_URI',
      'SSO_FRONTEND_CALLBACK_URL',
      'SSO_SCOPES',
      'SSO_REQUEST_TIMEOUT_MS',
    ],
  },
] satisfies Array<{ name: string; keys: Array<keyof SetupEnvironment> }>;
