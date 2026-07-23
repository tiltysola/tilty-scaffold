import { randomUUID } from 'crypto';
import { open, readFile, unlink } from 'fs/promises';
import { hostname } from 'os';
import { Op, type Transaction } from 'sequelize';
import { z } from 'zod';

import { SystemRole } from '@tilty/shared/access-control';
import { SetupEmailVerificationService, SetupLogTarget, SetupSmsVerificationService } from '@tilty/shared/setup';
import { createPasswordFormSchema, displayNameSchema, emailSchema, usernameSchema } from '@tilty/shared/validation';

import { getConfigFilePath, isSetupLocked, loadEnv } from '../../config/env';
import {
  assertConfigFileWritable,
  assertValidDatabaseEnvironment,
  assertValidEmailEnvironment,
  assertValidEnvironment,
  assertValidLoggingEnvironment,
  assertValidSetupStepEnvironment,
  assertValidSmsEnvironment,
  assertValidSsoEnvironment,
  getSetupEnvironmentDefaults,
  parseLogTargets,
  resolveConfiguredSetupSecrets,
  type SetupEnvironment,
  setupEnvironmentInputSchema,
  setupEnvironmentValidationInputSchema,
  setupEnvSchema,
  toCacheConfig,
  toDatabaseConfig,
  toFileStorageConfig,
  writeConfigFile,
} from '../../config/setup-environment';
import { AppError } from '../../core/errors';
import { createCacheStore } from '../../infra/cache';
import { createSequelize } from '../../infra/database';
import { createFileStorage } from '../../infra/file-storage';
import { createMigrator } from '../../infra/migrator';
import { initAccessControlModels } from '../access-control/access-control.model';
import { AccessControlService } from '../access-control/access-control.service';
import { hashPassword } from '../auth/auth.crypto';
import { SmtpEmailSender } from '../auth/auth.email';
import { checkAliyunSmsProfiles } from '../auth/auth.sms';
import { testSsoDiscovery } from '../auth/auth.sso';
import { initUserModel } from '../users/user.model';
import { assertSafeSetupNetworkTargets } from './setup-network';

type SetupMode = 'locked' | 'setup';
interface SetupServiceOptions {
  onCompleted?: () => Promise<void> | void;
}
type SetupCompletionLock = {
  fileHandle: Awaited<ReturnType<typeof open>>;
  lockFilePath: string;
  owner: string;
};
type SetupCompleteInput = z.infer<typeof setupCompleteSchema>;

const administratorSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
  email: emailSchema,
});

const setupCompleteSchema = z.object({
  administrator: administratorSchema.optional(),
  environment: setupEnvSchema,
});
let setupCompletionInProgress = false;

export class SetupService {
  constructor(
    private readonly mode: SetupMode,
    private readonly options: SetupServiceOptions = {},
  ) {}

  getDefaults() {
    this.assertSetupAvailable();

    return getSetupEnvironmentDefaults();
  }

  validate(input: unknown) {
    this.assertSetupAvailable();

    const parsed = resolveSetupCompleteInput(input);

    assertValidEnvironment(parsed.environment);

    return {
      valid: true,
    } as const;
  }

  validateEnvironment(input: unknown) {
    this.assertSetupAvailable();

    const parsed = setupEnvironmentValidationInputSchema.parse(input);
    const environment = resolveConfiguredSetupSecrets(parsed.environment);
    const { stepId } = parsed;

    if (stepId) {
      assertValidSetupStepEnvironment(environment, stepId);
    } else {
      assertValidEnvironment(environment);
    }

    return {
      valid: true,
    } as const;
  }

  async testDatabase(input: unknown) {
    this.assertSetupAvailable();

    const environment = resolveSetupEnvironmentInput(input);
    assertValidDatabaseEnvironment(environment);
    assertSafeSetupNetworkTargets(environment, 'database');

    const sequelize = createSequelize(toDatabaseConfig(environment));

    try {
      await sequelize.authenticate();
      const databaseState = await inspectExistingDatabase(sequelize);

      return {
        connected: true,
        hasExistingAdministrator: databaseState.hasExistingAdministrator,
        hasExistingUsers: databaseState.hasExistingUsers,
      } as const;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('SETUP_DATABASE_CONNECTION_FAILED', 'error.SETUP_DATABASE_CONNECTION_FAILED', 400, {
        reason: getConnectionErrorReason(error),
      });
    } finally {
      await sequelize.close();
    }
  }

  async testCache(input: unknown) {
    this.assertSetupAvailable();

    const environment = resolveSetupEnvironmentInput(input);
    assertSafeSetupNetworkTargets(environment, 'cache');
    const cacheConfig = toCacheConfig(environment);
    const cache = createCacheStore(cacheConfig);

    try {
      await cache.check();

      return {
        connected: true,
        store: cacheConfig.store,
      } as const;
    } catch (error) {
      throw new AppError('SETUP_CACHE_CONNECTION_FAILED', 'error.SETUP_CACHE_CONNECTION_FAILED', 400, {
        reason: getConnectionErrorReason(error),
      });
    } finally {
      await cache.close();
    }
  }

  async testFileStorage(input: unknown) {
    this.assertSetupAvailable();

    const environment = resolveSetupEnvironmentInput(input);
    assertSafeSetupNetworkTargets(environment, 'file-storage');
    const config = toFileStorageConfig(environment);
    const storage = createFileStorage(config);
    const key = `setup-tests/${randomUUID()}.txt`;

    let deleted = false;
    let saved = false;

    try {
      await storage.save({
        content: Buffer.from('setup file storage test\n', 'utf8'),
        contentType: 'text/plain',
        key,
      });
      saved = true;
      await storage.delete(key);
      deleted = true;

      return {
        connected: true,
        driver: config.driver,
      } as const;
    } catch (error) {
      throw new AppError('SETUP_FILE_STORAGE_CONNECTION_FAILED', 'error.SETUP_FILE_STORAGE_CONNECTION_FAILED', 400, {
        reason: getConnectionErrorReason(error),
      });
    } finally {
      if (saved && !deleted) {
        await storage.delete(key).catch(() => undefined);
      }
    }
  }

  async testLogging(input: unknown) {
    this.assertSetupAvailable();

    const environment = resolveSetupEnvironmentInput(input);
    const envSource = assertValidLoggingEnvironment(environment);
    assertSafeSetupNetworkTargets(environment, 'logging');
    const logTargets = parseLogTargets(environment.LOG_TARGETS);

    if (!logTargets.includes(SetupLogTarget.Sls)) {
      return {
        connected: true,
        target: logTargets.includes(SetupLogTarget.Local) ? SetupLogTarget.Local : SetupLogTarget.Console,
      } as const;
    }

    try {
      const [openApiModule, slsModule] = await Promise.all([
        import('@alicloud/openapi-core'),
        import('@alicloud/sls20201230'),
      ]);
      const { $OpenApiUtil } = openApiModule;
      const { default: SlsClient } = slsModule as unknown as typeof import('@alicloud/sls20201230/dist/client');
      const client = new SlsClient(
        new $OpenApiUtil.Config({
          accessKeyId: envSource.LOG_SLS_ACCESS_KEY_ID!,
          accessKeySecret: envSource.LOG_SLS_ACCESS_KEY_SECRET!,
          connectTimeout: Number(envSource.LOG_WRITE_TIMEOUT_MS),
          endpoint: envSource.LOG_SLS_ENDPOINT!,
          readTimeout: Number(envSource.LOG_WRITE_TIMEOUT_MS),
        }),
      );

      await client.getLogStore(envSource.LOG_SLS_PROJECT!, envSource.LOG_SLS_LOGSTORE!);

      return {
        connected: true,
        target: SetupLogTarget.Sls,
      } as const;
    } catch (error) {
      throw new AppError('SETUP_SLS_CONNECTION_FAILED', 'error.SETUP_SLS_CONNECTION_FAILED', 400, {
        reason: getConnectionErrorReason(error),
      });
    }
  }

  async testEmail(input: unknown) {
    this.assertSetupAvailable();

    const { environment, environmentConfig } = loadValidatedSetupEnvironment(input, assertValidEmailEnvironment);
    assertSafeSetupNetworkTargets(environment, 'email');

    if (environment.EMAIL_VERIFICATION_SERVICE.trim() !== SetupEmailVerificationService.Smtp) {
      return {
        connected: true,
        service: SetupEmailVerificationService.Off,
      } as const;
    }

    return runSetupConnectionTest('SETUP_SMTP_CONNECTION_FAILED', 'error.SETUP_SMTP_CONNECTION_FAILED', async () => {
      await Promise.all(environmentConfig.email!.smtpProfiles.map((profile) => new SmtpEmailSender(profile).check()));

      return {
        connected: true,
        service: SetupEmailVerificationService.Smtp,
      } as const;
    });
  }

  async testSms(input: unknown) {
    this.assertSetupAvailable();

    const { environment, environmentConfig } = loadValidatedSetupEnvironment(input, assertValidSmsEnvironment);
    assertSafeSetupNetworkTargets(environment, 'sms');

    if (!environmentConfig.sms) {
      return {
        connected: true,
        service: SetupSmsVerificationService.Off,
      } as const;
    }

    const smsConfig = environmentConfig.sms;

    return runSetupConnectionTest('SETUP_SMS_CONNECTION_FAILED', 'error.SETUP_SMS_CONNECTION_FAILED', async () => {
      await checkAliyunSmsProfiles(smsConfig.aliyunProfiles);

      return {
        connected: true,
        service: SetupSmsVerificationService.Aliyun,
        profileCountryCodes: smsConfig.aliyunProfiles.map((profile) => profile.phoneCountryCode),
      } as const;
    });
  }

  async testSso(input: unknown) {
    this.assertSetupAvailable();

    const { environment, environmentConfig } = loadValidatedSetupEnvironment(input, assertValidSsoEnvironment);
    assertSafeSetupNetworkTargets(environment, 'sso');

    if (!environmentConfig.sso) {
      return {
        connected: true,
        enabled: false,
      } as const;
    }

    const ssoConfig = environmentConfig.sso;

    return runSetupConnectionTest('SETUP_SSO_CONNECTION_FAILED', 'error.SETUP_SSO_CONNECTION_FAILED', async () => {
      const result = await testSsoDiscovery(ssoConfig);

      return {
        connected: true,
        enabled: true,
        providerIds: result.providerIds,
      } as const;
    });
  }

  async complete(input: unknown) {
    this.assertSetupAvailable();

    if (setupCompletionInProgress) {
      throw new AppError('SETUP_IN_PROGRESS', 'error.SETUP_IN_PROGRESS', 409);
    }

    setupCompletionInProgress = true;
    let setupCompletionLock: SetupCompletionLock | undefined;

    try {
      const setupRequest = resolveSetupCompleteInput(input);
      const setupEnvironmentSource = assertValidEnvironment(setupRequest.environment);

      setupCompletionLock = await acquireSetupCompletionLock();
      this.assertSetupAvailable();
      await assertConfigFileWritable(setupEnvironmentSource);

      const administratorCreated = await provisionDatabase(setupEnvironmentSource, setupRequest.administrator);
      await writeConfigFile(setupEnvironmentSource);
      await this.options.onCompleted?.();

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
      throw new AppError('SETUP_LOCKED', 'error.SETUP_LOCKED', 403);
    }
  }
}

function loadValidatedSetupEnvironment(
  input: unknown,
  validateEnvironment: (environment: SetupEnvironment) => NodeJS.ProcessEnv,
) {
  const environment = resolveSetupEnvironmentInput(input);

  return {
    environment,
    environmentConfig: loadEnv(validateEnvironment(environment)),
  };
}

async function runSetupConnectionTest<T>(errorCode: string, errorMessageId: string, check: () => Promise<T>) {
  try {
    return await check();
  } catch (error) {
    throw new AppError(errorCode, errorMessageId, 400, {
      reason: getConnectionErrorReason(error),
    });
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
    await inspectExistingDatabase(sequelize);
    await createMigrator(sequelize).up();
    await accessControl.syncSystemAccessControl();
    await sequelize.authenticate();

    if (sequelize.getDialect() === 'sqlite') {
      return await ensureRootAdministrator(models, administratorInput);
    }

    return await sequelize.transaction((transaction) =>
      ensureRootAdministrator(models, administratorInput, transaction),
    );
  } finally {
    await sequelize.close();
  }
}

async function ensureRootAdministrator(
  models: ReturnType<typeof initAccessControlModels> & { user: ReturnType<typeof initUserModel> },
  administratorInput: SetupCompleteInput['administrator'],
  transaction?: Transaction,
) {
  const rootRole = await models.role.findOne({
    ...(transaction ? { lock: transaction.LOCK.UPDATE, transaction } : {}),
    where: {
      available: true,
      key: SystemRole.Root,
    },
  });

  if (!rootRole) {
    throw new AppError('ROLE_NOT_FOUND', 'error.ROLE_NOT_FOUND', 500);
  }

  if (await hasAvailableRootAdministrator(models, rootRole.id, transaction)) {
    return false;
  }

  const administrator = administratorSchema.parse(administratorInput);
  const credentials = await hashPassword(administrator.password);
  const user = await models.user.create(
    {
      username: administrator.username,
      displayName: administrator.displayName,
      email: administrator.email,
      ...credentials,
    },
    transaction ? { transaction } : undefined,
  );

  await models.userRole.create(
    {
      userId: user.id,
      roleId: rootRole.id,
    },
    transaction ? { transaction } : undefined,
  );
  return true;
}

async function inspectExistingDatabase(sequelize: ReturnType<typeof createSequelize>) {
  const tableNames = new Set(
    (await sequelize.getQueryInterface().showAllTables()).map(normalizeTableName).filter(Boolean),
  );

  if (tableNames.size === 0) {
    return {
      hasExistingAdministrator: false,
      hasExistingUsers: false,
    };
  }

  const requiredScaffoldTables = ['roles', 'sequelize_meta', 'user_roles', 'users'];

  if (requiredScaffoldTables.some((tableName) => !tableNames.has(tableName))) {
    throw new AppError('SETUP_DATABASE_INCOMPATIBLE', 'error.SETUP_DATABASE_INCOMPATIBLE', 400);
  }

  const models = {
    ...initAccessControlModels(sequelize),
    user: initUserModel(sequelize),
  };
  const hasExistingUsers =
    (await models.user.count({
      where: {
        available: true,
      },
    })) > 0;
  const rootRole = await models.role.findOne({
    where: {
      available: true,
      key: SystemRole.Root,
    },
  });

  return {
    hasExistingAdministrator: rootRole ? await hasAvailableRootAdministrator(models, rootRole.id) : false,
    hasExistingUsers,
  };
}

async function hasAvailableRootAdministrator(
  models: ReturnType<typeof initAccessControlModels> & { user: ReturnType<typeof initUserModel> },
  rootRoleId: string,
  transaction?: Transaction,
) {
  const assignments = await models.userRole.findAll({
    ...(transaction ? { transaction } : {}),
    where: {
      roleId: rootRoleId,
    },
  });
  const userIds = assignments.map((assignment) => assignment.userId);

  if (userIds.length === 0) {
    return false;
  }

  return (
    (await models.user.count({
      ...(transaction ? { transaction } : {}),
      where: {
        available: true,
        id: {
          [Op.in]: userIds,
        },
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

function getConnectionErrorReason(error: unknown) {
  const code = getErrorCode(error).toLowerCase();
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (code.includes('timeout') || message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }

  if (
    code.includes('auth') ||
    code.includes('access') ||
    message.includes('authentication') ||
    message.includes('credential') ||
    message.includes('password')
  ) {
    return 'authentication';
  }

  if (code.includes('cert') || code.includes('ssl') || code.includes('tls') || message.includes('certificate')) {
    return 'tls';
  }

  if (code.includes('refused') || code.includes('notfound') || message.includes('refused')) {
    return 'unreachable';
  }

  return 'rejected';
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return '';
  }

  const code = error.code;

  return typeof code === 'string' ? code : '';
}

function resolveSetupEnvironmentInput(input: unknown) {
  const { environment } = setupEnvironmentInputSchema.parse(input);

  return resolveConfiguredSetupSecrets(environment);
}

function resolveSetupCompleteInput(input: unknown) {
  const parsed = setupCompleteSchema.parse(input);

  return {
    ...parsed,
    environment: resolveConfiguredSetupSecrets(parsed.environment),
  };
}

async function acquireSetupCompletionLock(retryAfterStaleLock = true): Promise<SetupCompletionLock> {
  const setupCompletionLockFilePath = `${getConfigFilePath()}.setup.lock`;
  let setupCompletionLockFileHandle: Awaited<ReturnType<typeof open>> | undefined;
  const owner = randomUUID();

  try {
    setupCompletionLockFileHandle = await open(setupCompletionLockFilePath, 'wx', 0o600);
    await setupCompletionLockFileHandle.writeFile(
      `${JSON.stringify({ host: hostname(), owner, pid: process.pid, startedAt: new Date().toISOString() })}\n`,
      'utf8',
    );
    await setupCompletionLockFileHandle.sync();

    return {
      fileHandle: setupCompletionLockFileHandle,
      lockFilePath: setupCompletionLockFilePath,
      owner,
    };
  } catch (error) {
    if (setupCompletionLockFileHandle) {
      await setupCompletionLockFileHandle.close().catch(() => undefined);
      await unlink(setupCompletionLockFilePath).catch(() => undefined);
    }

    if ((error as NodeJS.ErrnoException).code === 'EEXIST' && retryAfterStaleLock) {
      if (await removeStaleSetupLock(setupCompletionLockFilePath)) {
        return acquireSetupCompletionLock(false);
      }
    }

    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new AppError('SETUP_IN_PROGRESS', 'error.SETUP_IN_PROGRESS', 409);
    }

    throw error;
  }
}

async function releaseSetupCompletionLock(lock: SetupCompletionLock) {
  await lock.fileHandle.close().catch(() => undefined);

  try {
    const record = parseSetupLockRecord(await readFile(lock.lockFilePath, 'utf8'));

    if (record?.owner === lock.owner) {
      await unlink(lock.lockFilePath);
    }
  } catch {
    // A missing or replaced lock file is already released from this owner's perspective.
  }
}

async function removeStaleSetupLock(lockFilePath: string) {
  try {
    const record = parseSetupLockRecord(await readFile(lockFilePath, 'utf8'));

    if (!record || !isSetupLockStale(record)) {
      return false;
    }

    await unlink(lockFilePath);
    return true;
  } catch {
    return false;
  }
}

function parseSetupLockRecord(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    if (
      typeof parsed.host === 'string' &&
      typeof parsed.owner === 'string' &&
      typeof parsed.pid === 'number' &&
      typeof parsed.startedAt === 'string'
    ) {
      return {
        host: parsed.host,
        owner: parsed.owner,
        pid: parsed.pid,
        startedAt: parsed.startedAt,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isSetupLockStale(record: NonNullable<ReturnType<typeof parseSetupLockRecord>>) {
  if (record.host === hostname()) {
    return !isProcessRunning(record.pid);
  }

  const startedAt = Date.parse(record.startedAt);

  return Number.isFinite(startedAt) && Date.now() - startedAt > 2 * 60 * 60_000;
}

function isProcessRunning(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}
