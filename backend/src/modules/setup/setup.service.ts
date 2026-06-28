import { randomUUID } from 'crypto';
import { open, unlink } from 'fs/promises';
import { z } from 'zod';

import { SystemRole } from '@tilty/shared/access-control';
import { hasMatchingPasswordConfirmation } from '@tilty/shared/validation';

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
  setupEnvironmentInputSchema,
  setupEnvironmentValidationInputSchema,
  setupEnvSchema,
  setupLockedMessage,
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

type SetupMode = 'locked' | 'setup';
type SetupCompletionLock = {
  fileHandle: Awaited<ReturnType<typeof open>>;
  lockFilePath: string;
};
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
type SetupCompleteInput = z.infer<typeof setupCompleteSchema>;
let setupCompletionInProgress = false;

export class SetupService {
  constructor(private readonly mode: SetupMode) {}

  getDefaults() {
    this.assertSetupAvailable();

    return getSetupEnvironmentDefaults();
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

    const { environment, stepId } = setupEnvironmentValidationInputSchema.parse(input);

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

    const { environment } = setupEnvironmentInputSchema.parse(input);
    assertValidDatabaseEnvironment(environment);

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
    const envSource = assertValidLoggingEnvironment(environment);
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
    const environmentConfig = loadEnv(assertValidEmailEnvironment(environment));

    if (environment.EMAIL_VERIFICATION_SERVICE.trim() !== 'smtp') {
      return {
        connected: true,
        service: 'off',
      } as const;
    }

    try {
      await Promise.all(environmentConfig.email!.smtpProfiles.map((profile) => new SmtpEmailSender(profile).check()));

      return {
        connected: true,
        service: 'smtp',
      } as const;
    } catch (error) {
      throw new AppError('SETUP_SMTP_CONNECTION_FAILED', getConnectionErrorMessage(error), 400);
    }
  }

  async testSms(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);
    const environmentConfig = loadEnv(assertValidSmsEnvironment(environment));

    if (!environmentConfig.sms) {
      return {
        connected: true,
        service: 'off',
      } as const;
    }

    try {
      await checkAliyunSmsProfiles(environmentConfig.sms.aliyunProfiles);

      return {
        connected: true,
        service: 'aliyun',
        profileCountryCodes: environmentConfig.sms.aliyunProfiles.map((profile) => profile.phoneCountryCode),
      } as const;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('SETUP_SMS_CONNECTION_FAILED', getConnectionErrorMessage(error), 400);
    }
  }

  async testSso(input: unknown) {
    this.assertSetupAvailable();

    const { environment } = setupEnvironmentInputSchema.parse(input);
    const environmentConfig = loadEnv(assertValidSsoEnvironment(environment));

    if (!environmentConfig.sso) {
      return {
        connected: true,
        enabled: false,
      } as const;
    }

    try {
      const result = await testSsoDiscovery(environmentConfig.sso);

      return {
        connected: true,
        enabled: true,
        providerIds: result.providerIds,
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
      await assertConfigFileWritable(setupEnvironmentSource);

      const administratorCreated = await provisionDatabase(setupEnvironmentSource, setupRequest.administrator);
      await writeConfigFile(setupEnvironmentSource);

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

function getConnectionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Connection test could not be completed.';
}

async function acquireSetupCompletionLock(): Promise<SetupCompletionLock> {
  const setupCompletionLockFilePath = `${getConfigFilePath()}.setup.lock`;
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
