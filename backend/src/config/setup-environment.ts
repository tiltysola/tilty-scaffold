import { randomBytes, randomUUID } from 'crypto';
import { constants } from 'fs';
import { access, rename, stat, unlink, writeFile } from 'fs/promises';
import { z } from 'zod';

import {
  SetupBoolean,
  setupBooleanValues,
  SetupCacheStore,
  setupCacheStoreValues,
  SetupDatabaseDialect,
  setupDatabaseDialectValues,
  SetupEmailVerificationService,
  SetupEnvironmentStep,
  type SetupEnvironmentStepValue,
  setupEnvironmentStepValues,
  SetupFileStorageDriver,
  setupFileStorageDriverValues,
  SetupLogTarget,
  SetupNodeEnv,
  setupNodeEnvValues,
  SetupSmsVerificationService,
} from '@tilty/shared/setup';

import { AppError } from '../core/errors';
import { parseSeparatedValues } from '../core/strings';
import { defaultSetupEnvironment } from './defaults';
import {
  getConfigFilePath,
  getEnvValidationMessage,
  hasConfigFile,
  isSetupLocked,
  loadConfigFileSource,
  loadEnv,
} from './env';

interface EnvironmentValidationOptions {
  relaxedSms?: boolean;
}
interface ConfigFileWriteOptions {
  allowLocked?: boolean;
  generator?: string;
}
interface ConditionalRequiredEnvironmentFields {
  isEnabled: (environment: SetupEnvironment) => boolean;
  keys: readonly (keyof SetupEnvironment)[];
}

export type SetupEnvironment = z.infer<typeof setupEnvSchema>;
type SetupStepId = SetupEnvironmentStepValue;

export const setupEnvSchema = z
  .object({
    NODE_ENV: z.string().trim().max(32),
    SERVER_HOST: z.string().trim().max(255),
    SERVER_PORT: z.string().trim().max(16),
    APP_DOMAIN: z.string().trim().max(1024),
    APP_CORS_ORIGINS: z.string().trim().max(2048),
    APP_CSP_RESOURCE_ORIGINS: z.string().trim().max(16384),
    SERVER_TRUST_PROXY: z.string().trim().max(16),
    SERVER_MULTI_INSTANCE_ENABLED: z.string().trim().max(16),
    DATABASE_DIALECT: z.string().trim().max(16),
    DATABASE_STORAGE: z.string().trim().max(1024),
    DATABASE_URL: z.string().trim().max(2048),
    DATABASE_SSL: z.string().trim().max(16),
    DATABASE_CONNECT_TIMEOUT_MS: z.string().trim().max(16),
    DATABASE_POOL_MAX: z.string().trim().max(16),
    DATABASE_POOL_MIN: z.string().trim().max(16),
    DATABASE_POOL_ACQUIRE_MS: z.string().trim().max(16),
    DATABASE_POOL_IDLE_MS: z.string().trim().max(16),
    CACHE_STORE: z.string().trim().max(16),
    CACHE_REDIS_URL: z.string().trim().max(1024),
    CACHE_REDIS_REQUEST_TIMEOUT_MS: z.string().trim().max(16),
    FILE_STORAGE_DRIVER: z.string().trim().max(16),
    FILE_UPLOAD_MAX_BYTES: z.string().trim().max(16),
    FILE_PUBLIC_BASE_URL: z.string().trim().max(1024),
    FILE_LOCAL_ROOT: z.string().trim().max(1024),
    FILE_OSS_ACCESS_KEY_ID: z.string().trim().max(512),
    FILE_OSS_ACCESS_KEY_SECRET: z.string().trim().max(512),
    FILE_OSS_BUCKET: z.string().trim().max(256),
    FILE_OSS_ENDPOINT: z.string().trim().max(512),
    FILE_OSS_REGION: z.string().trim().max(128),
    FILE_OSS_PUBLIC_BASE_URL: z.string().trim().max(1024),
    SCHEDULER_ENABLED: z.string().trim().max(16),
    SCHEDULER_LOCK_TTL_MS: z.string().trim().max(16),
    AUTH_TOKEN_SECRET: z.string().trim().max(256),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.string().trim().max(16),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.string().trim().max(16),
    AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS: z.string().trim().max(16),
    AUTH_VERIFICATION_MAX_ATTEMPTS: z.string().trim().max(16),
    AUTH_VERIFICATION_SUDO_TTL_SECONDS: z.string().trim().max(16),
    AUTH_PASSKEY_RP_NAME: z.string().trim().max(128),
    AUTH_PASSKEY_REGISTRATION_TTL_SECONDS: z.string().trim().max(16),
    AUTH_PASSKEY_OPERATION_TIMEOUT_MS: z.string().trim().max(16),
    AUTH_TOTP_ISSUER: z.string().trim().max(128),
    AUTH_TOTP_SETUP_TTL_SECONDS: z.string().trim().max(16),
    AUTH_ACCESS_TOKEN_COOKIE_NAME: z.string().trim().max(128),
    AUTH_REFRESH_TOKEN_COOKIE_NAME: z.string().trim().max(128),
    AUTH_COOKIE_SAME_SITE: z.string().trim().max(16),
    AUTH_COOKIE_SECURE: z.string().trim().max(16),
    AUTH_RATE_LIMIT_WINDOW_MS: z.string().trim().max(16),
    AUTH_RATE_LIMIT_MAX: z.string().trim().max(16),
    GLOBAL_RATE_LIMIT_WINDOW_MS: z.string().trim().max(16),
    GLOBAL_RATE_LIMIT_MAX: z.string().trim().max(16),
    LOG_REQUEST_ENABLED: z.string().trim().max(16),
    LOG_TARGETS: z.string().trim().max(128),
    LOG_PENDING_WRITE_MAX: z.string().trim().max(16),
    LOG_WRITE_TIMEOUT_MS: z.string().trim().max(16),
    LOG_LOCAL_PATH: z.string().trim().max(1024),
    LOG_SLS_ENDPOINT: z.string().trim().max(512),
    LOG_SLS_PROJECT: z.string().trim().max(256),
    LOG_SLS_LOGSTORE: z.string().trim().max(256),
    LOG_SLS_ACCESS_KEY_ID: z.string().trim().max(512),
    LOG_SLS_ACCESS_KEY_SECRET: z.string().trim().max(512),
    LOG_SLS_TOPIC: z.string().trim().max(128),
    LOG_SLS_SOURCE: z.string().trim().max(128),
    EMAIL_VERIFICATION_SERVICE: z.string().trim().max(16),
    EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: z.string().trim().max(16),
    EMAIL_VERIFICATION_CODE_COOLDOWN_MS: z.string().trim().max(16),
    EMAIL_SMTP_PROFILES: z.string().trim().max(16384),
    SMS_VERIFICATION_SERVICE: z.string().trim().max(16),
    SMS_VERIFICATION_CODE_EXPIRES_IN_MS: z.string().trim().max(16),
    SMS_VERIFICATION_CODE_COOLDOWN_MS: z.string().trim().max(16),
    SMS_ALICLOUD_PROFILES: z.string().trim().max(8192),
    SSO_ENABLED: z.string().trim().max(16),
    SSO_PROFILES: z.string().trim().max(32768),
  })
  .strict();

export const setupEnvironmentInputSchema = z.object({
  environment: setupEnvSchema,
});
const setupStepIdSchema = z.enum(setupEnvironmentStepValues);
export const setupEnvironmentValidationInputSchema = setupEnvironmentInputSchema.extend({
  stepId: setupStepIdSchema.optional(),
});
const setupDatabaseDialectSchema = z.enum(setupDatabaseDialectValues);
const setupCacheStoreSchema = z.enum(setupCacheStoreValues);
const setupFileStorageDriverSchema = z.enum(setupFileStorageDriverValues);

export const setupEnvironmentKeys = setupEnvSchema.keyof().options;

const profileEnvironmentKeySet = new Set<keyof SetupEnvironment>([
  'EMAIL_SMTP_PROFILES',
  'SMS_ALICLOUD_PROFILES',
  'SSO_PROFILES',
]);
const emptyOptionalConfigKeySet = new Set<keyof SetupEnvironment>([
  'CACHE_REDIS_URL',
  'DATABASE_URL',
  'FILE_OSS_ACCESS_KEY_ID',
  'FILE_OSS_ACCESS_KEY_SECRET',
  'FILE_OSS_BUCKET',
  'FILE_OSS_ENDPOINT',
  'FILE_OSS_REGION',
  'FILE_OSS_PUBLIC_BASE_URL',
  'LOG_SLS_ENDPOINT',
  'LOG_SLS_PROJECT',
  'LOG_SLS_LOGSTORE',
  'LOG_SLS_ACCESS_KEY_ID',
  'LOG_SLS_ACCESS_KEY_SECRET',
]);
const setupValidationAuthTokenSecret = 'setup-validation-auth-token-secret-minimum-32-characters';
const runtimeEnvironmentKeys = [
  'NODE_ENV',
  'SERVER_HOST',
  'SERVER_PORT',
  'APP_DOMAIN',
  'APP_CORS_ORIGINS',
  'APP_CSP_RESOURCE_ORIGINS',
  'SERVER_TRUST_PROXY',
  'SERVER_MULTI_INSTANCE_ENABLED',
] as const satisfies Array<keyof SetupEnvironment>;
const schedulerEnvironmentKeys = ['SCHEDULER_ENABLED', 'SCHEDULER_LOCK_TTL_MS'] as const satisfies Array<
  keyof SetupEnvironment
>;
const databaseEnvironmentKeys = [
  'DATABASE_DIALECT',
  'DATABASE_STORAGE',
  'DATABASE_URL',
  'DATABASE_SSL',
  'DATABASE_CONNECT_TIMEOUT_MS',
  'DATABASE_POOL_MAX',
  'DATABASE_POOL_MIN',
  'DATABASE_POOL_ACQUIRE_MS',
  'DATABASE_POOL_IDLE_MS',
] as const satisfies Array<keyof SetupEnvironment>;
const securityEnvironmentKeys = [
  'AUTH_TOKEN_SECRET',
  'AUTH_ACCESS_TOKEN_TTL_SECONDS',
  'AUTH_REFRESH_TOKEN_TTL_SECONDS',
  'AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS',
  'AUTH_VERIFICATION_MAX_ATTEMPTS',
  'AUTH_VERIFICATION_SUDO_TTL_SECONDS',
  'AUTH_PASSKEY_RP_NAME',
  'AUTH_PASSKEY_REGISTRATION_TTL_SECONDS',
  'AUTH_PASSKEY_OPERATION_TIMEOUT_MS',
  'AUTH_TOTP_ISSUER',
  'AUTH_TOTP_SETUP_TTL_SECONDS',
  'AUTH_ACCESS_TOKEN_COOKIE_NAME',
  'AUTH_REFRESH_TOKEN_COOKIE_NAME',
  'AUTH_COOKIE_SAME_SITE',
  'AUTH_COOKIE_SECURE',
  'AUTH_RATE_LIMIT_WINDOW_MS',
  'AUTH_RATE_LIMIT_MAX',
  'GLOBAL_RATE_LIMIT_WINDOW_MS',
  'GLOBAL_RATE_LIMIT_MAX',
] as const satisfies Array<keyof SetupEnvironment>;
const fileStorageEnvironmentKeys = [
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
] as const satisfies Array<keyof SetupEnvironment>;
const loggingEnvironmentKeys = [
  'LOG_REQUEST_ENABLED',
  'LOG_TARGETS',
  'LOG_PENDING_WRITE_MAX',
  'LOG_WRITE_TIMEOUT_MS',
  'LOG_LOCAL_PATH',
  'LOG_SLS_ENDPOINT',
  'LOG_SLS_PROJECT',
  'LOG_SLS_LOGSTORE',
  'LOG_SLS_ACCESS_KEY_ID',
  'LOG_SLS_ACCESS_KEY_SECRET',
  'LOG_SLS_TOPIC',
  'LOG_SLS_SOURCE',
] as const satisfies Array<keyof SetupEnvironment>;
const emailEnvironmentKeys = [
  'EMAIL_VERIFICATION_SERVICE',
  'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS',
  'EMAIL_VERIFICATION_CODE_COOLDOWN_MS',
  'EMAIL_SMTP_PROFILES',
] as const satisfies Array<keyof SetupEnvironment>;
const smsEnvironmentKeys = [
  'SMS_VERIFICATION_SERVICE',
  'SMS_VERIFICATION_CODE_EXPIRES_IN_MS',
  'SMS_VERIFICATION_CODE_COOLDOWN_MS',
  'SMS_ALICLOUD_PROFILES',
] as const satisfies Array<keyof SetupEnvironment>;
const ssoEnvironmentKeys = ['SSO_ENABLED', 'SSO_PROFILES'] as const satisfies Array<keyof SetupEnvironment>;

const envGroups = [
  {
    name: 'Runtime',
    keys: [
      'NODE_ENV',
      'SERVER_HOST',
      'SERVER_PORT',
      'APP_DOMAIN',
      'APP_CORS_ORIGINS',
      'APP_CSP_RESOURCE_ORIGINS',
      'SERVER_TRUST_PROXY',
      'SERVER_MULTI_INSTANCE_ENABLED',
    ],
  },
  {
    name: 'Database',
    keys: [
      'DATABASE_DIALECT',
      'DATABASE_STORAGE',
      'DATABASE_URL',
      'DATABASE_SSL',
      'DATABASE_CONNECT_TIMEOUT_MS',
      'DATABASE_POOL_MAX',
      'DATABASE_POOL_MIN',
      'DATABASE_POOL_ACQUIRE_MS',
      'DATABASE_POOL_IDLE_MS',
    ],
  },
  {
    name: 'Cache',
    keys: ['CACHE_STORE', 'CACHE_REDIS_URL', 'CACHE_REDIS_REQUEST_TIMEOUT_MS'],
  },
  {
    name: 'File Storage',
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
    name: 'Scheduler',
    keys: ['SCHEDULER_ENABLED', 'SCHEDULER_LOCK_TTL_MS'],
  },
  {
    name: 'Security',
    keys: [
      'AUTH_TOKEN_SECRET',
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
      'AUTH_REFRESH_TOKEN_TTL_SECONDS',
      'AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS',
      'AUTH_VERIFICATION_MAX_ATTEMPTS',
      'AUTH_VERIFICATION_SUDO_TTL_SECONDS',
      'AUTH_PASSKEY_RP_NAME',
      'AUTH_PASSKEY_REGISTRATION_TTL_SECONDS',
      'AUTH_PASSKEY_OPERATION_TIMEOUT_MS',
      'AUTH_TOTP_ISSUER',
      'AUTH_TOTP_SETUP_TTL_SECONDS',
      'AUTH_ACCESS_TOKEN_COOKIE_NAME',
      'AUTH_REFRESH_TOKEN_COOKIE_NAME',
      'AUTH_COOKIE_SAME_SITE',
      'AUTH_COOKIE_SECURE',
      'AUTH_RATE_LIMIT_WINDOW_MS',
      'AUTH_RATE_LIMIT_MAX',
      'GLOBAL_RATE_LIMIT_WINDOW_MS',
      'GLOBAL_RATE_LIMIT_MAX',
    ],
  },
  {
    name: 'Logging',
    keys: [
      'LOG_REQUEST_ENABLED',
      'LOG_TARGETS',
      'LOG_PENDING_WRITE_MAX',
      'LOG_WRITE_TIMEOUT_MS',
      'LOG_LOCAL_PATH',
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
    name: 'Email',
    keys: [
      'EMAIL_VERIFICATION_SERVICE',
      'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS',
      'EMAIL_VERIFICATION_CODE_COOLDOWN_MS',
      'EMAIL_SMTP_PROFILES',
    ],
  },
  {
    name: 'SMS',
    keys: [
      'SMS_VERIFICATION_SERVICE',
      'SMS_VERIFICATION_CODE_EXPIRES_IN_MS',
      'SMS_VERIFICATION_CODE_COOLDOWN_MS',
      'SMS_ALICLOUD_PROFILES',
    ],
  },
  {
    name: 'SSO',
    keys: ['SSO_ENABLED', 'SSO_PROFILES'],
  },
] satisfies Array<{ name: string; keys: Array<keyof SetupEnvironment> }>;

const setupConfigComments: Partial<Record<keyof SetupEnvironment, string[]>> = {
  NODE_ENV: ['Runtime mode. Options: development, test, production.'],
  SERVER_HOST: ['HTTP server bind host. Use 0.0.0.0 for all interfaces or 127.0.0.1 for local-only access.'],
  SERVER_PORT: ['HTTP server bind port.'],
  APP_DOMAIN: ['Primary public application origin, including protocol. Used for default CORS and callback URLs.'],
  APP_CORS_ORIGINS: ['Comma-separated browser CORS origin allowlist. Production must not include *.'],
  APP_CSP_RESOURCE_ORIGINS: [
    'Comma- or newline-separated external resource origins allowed by browser CSP.',
    'Use * to allow every network origin. Script, form, frame, and object restrictions are not configurable.',
  ],
  SERVER_TRUST_PROXY: ['Whether Koa trusts reverse proxy headers. Enable only behind a trusted reverse proxy.'],
  SERVER_MULTI_INSTANCE_ENABLED: [
    'Whether multiple backend instances may run at the same time.',
    'true requires Redis cache, MySQL or PostgreSQL, and OSS file storage.',
  ],
  DATABASE_DIALECT: ['Database driver used by Sequelize. Options: sqlite, mysql, postgres.'],
  DATABASE_STORAGE: [
    'SQLite database file path. Used only when DATABASE_DIALECT is sqlite.',
    'Relative paths resolve from the project root.',
  ],
  DATABASE_URL: ['MySQL or PostgreSQL connection URL. Required when DATABASE_DIALECT is mysql or postgres.'],
  DATABASE_SSL: ['Whether database SSL should be enabled for MySQL or PostgreSQL.'],
  DATABASE_CONNECT_TIMEOUT_MS: ['Database connection timeout in milliseconds.'],
  DATABASE_POOL_MAX: ['Maximum database connection pool size per backend instance.'],
  DATABASE_POOL_MIN: ['Minimum database connection pool size per backend instance.'],
  DATABASE_POOL_ACQUIRE_MS: ['Maximum time to acquire a database connection from the pool, in milliseconds.'],
  DATABASE_POOL_IDLE_MS: ['Maximum idle time before a pooled database connection is released, in milliseconds.'],
  CACHE_STORE: ['Cache backend for transient state. Options: memory, redis. Use redis for multi-instance deployments.'],
  CACHE_REDIS_URL: ['Redis connection URL for cache storage. Required only when CACHE_STORE is redis.'],
  CACHE_REDIS_REQUEST_TIMEOUT_MS: ['Redis connection and command timeout in milliseconds.'],
  FILE_STORAGE_DRIVER: ['Uploaded file storage backend. Options: local, oss. Use oss for multi-instance deployments.'],
  FILE_UPLOAD_MAX_BYTES: ['Maximum accepted profile image upload size in bytes.'],
  FILE_PUBLIC_BASE_URL: ['Public URL base returned for local uploaded files. May be a backend-relative path or URL.'],
  FILE_LOCAL_ROOT: ['Local uploaded file storage directory. Relative paths resolve from the project root.'],
  FILE_OSS_ACCESS_KEY_ID: ['Aliyun OSS access key ID. Required only when FILE_STORAGE_DRIVER is oss.'],
  FILE_OSS_ACCESS_KEY_SECRET: ['Aliyun OSS access key secret. Required only when FILE_STORAGE_DRIVER is oss.'],
  FILE_OSS_BUCKET: ['Aliyun OSS bucket name. Required only when FILE_STORAGE_DRIVER is oss.'],
  FILE_OSS_ENDPOINT: ['Aliyun OSS endpoint for the bucket. Required only when FILE_STORAGE_DRIVER is oss.'],
  FILE_OSS_REGION: ['Aliyun OSS region for request signing. Required only when FILE_STORAGE_DRIVER is oss.'],
  FILE_OSS_PUBLIC_BASE_URL: ['Public URL base returned for OSS uploaded files. Optional CDN or custom domain.'],
  SCHEDULER_ENABLED: ['Whether scheduled jobs should be registered and started.'],
  SCHEDULER_LOCK_TTL_MS: ['Redis lock TTL for scheduled jobs in multi-instance deployments, in milliseconds.'],
  AUTH_TOKEN_SECRET: ['Secret used to sign authentication tokens. Must be at least 32 characters.'],
  AUTH_ACCESS_TOKEN_TTL_SECONDS: ['Access token lifetime in seconds.'],
  AUTH_REFRESH_TOKEN_TTL_SECONDS: ['Refresh token lifetime in seconds. Must be greater than access token lifetime.'],
  AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS: ['MFA challenge lifetime in seconds.'],
  AUTH_VERIFICATION_MAX_ATTEMPTS: ['Maximum failed MFA challenge attempts before the challenge is invalidated.'],
  AUTH_VERIFICATION_SUDO_TTL_SECONDS: [
    'Elevated authorization lifetime after a successful sensitive-action challenge.',
  ],
  AUTH_PASSKEY_RP_NAME: ['Human-readable passkey relying party name shown by browsers and authenticators.'],
  AUTH_PASSKEY_REGISTRATION_TTL_SECONDS: ['Passkey registration token lifetime in seconds.'],
  AUTH_PASSKEY_OPERATION_TIMEOUT_MS: ['WebAuthn browser operation timeout in milliseconds.'],
  AUTH_TOTP_ISSUER: ['Authenticator app issuer name shown in TOTP applications.'],
  AUTH_TOTP_SETUP_TTL_SECONDS: ['Authenticator app setup token lifetime in seconds.'],
  AUTH_ACCESS_TOKEN_COOKIE_NAME: ['HttpOnly cookie name for the access token.'],
  AUTH_REFRESH_TOKEN_COOKIE_NAME: [
    'HttpOnly cookie name for the refresh token. Must differ from the access cookie name.',
  ],
  AUTH_COOKIE_SAME_SITE: ['Authentication cookie SameSite policy. Options: lax, strict, none.'],
  AUTH_COOKIE_SECURE: ['Authentication cookie Secure policy. Production requires true. Options: auto, true, false.'],
  AUTH_RATE_LIMIT_WINDOW_MS: ['Rate limit window for authentication-sensitive routes, in milliseconds.'],
  AUTH_RATE_LIMIT_MAX: ['Maximum requests allowed per authentication rate limit window.'],
  GLOBAL_RATE_LIMIT_WINDOW_MS: ['Global per-IP rate limit window in milliseconds.'],
  GLOBAL_RATE_LIMIT_MAX: ['Maximum requests allowed per IP in the global rate limit window.'],
  LOG_REQUEST_ENABLED: ['Whether request access logs are written.'],
  LOG_TARGETS: ['Comma-separated log output targets. Options: console, local, sls.'],
  LOG_PENDING_WRITE_MAX: ['Maximum number of pending asynchronous log sink writes.'],
  LOG_WRITE_TIMEOUT_MS: ['Maximum time to wait for an asynchronous log sink write, in milliseconds.'],
  LOG_LOCAL_PATH: [
    'Local JSONL log file path. Used only when LOG_TARGETS includes local.',
    'Relative paths resolve from the project root.',
  ],
  LOG_SLS_ENDPOINT: ['Aliyun Simple Log Service endpoint. Required only when LOG_TARGETS includes sls.'],
  LOG_SLS_PROJECT: ['Aliyun Simple Log Service project. Required only when LOG_TARGETS includes sls.'],
  LOG_SLS_LOGSTORE: ['Aliyun Simple Log Service logstore. Required only when LOG_TARGETS includes sls.'],
  LOG_SLS_ACCESS_KEY_ID: ['Aliyun Simple Log Service access key ID. Required only when LOG_TARGETS includes sls.'],
  LOG_SLS_ACCESS_KEY_SECRET: [
    'Aliyun Simple Log Service access key secret. Required only when LOG_TARGETS includes sls.',
  ],
  LOG_SLS_TOPIC: ['Aliyun Simple Log Service topic label. Used only when LOG_TARGETS includes sls.'],
  LOG_SLS_SOURCE: ['Aliyun Simple Log Service source label. Used only when LOG_TARGETS includes sls.'],
  EMAIL_VERIFICATION_SERVICE: ['Email verification delivery service. Options: off, smtp.'],
  EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: ['Email verification code lifetime in milliseconds.'],
  EMAIL_VERIFICATION_CODE_COOLDOWN_MS: [
    'Minimum time between verification code sends for the same email and purpose, in milliseconds.',
  ],
  EMAIL_SMTP_PROFILES: [
    'SMTP profile table array. Required only when EMAIL_VERIFICATION_SERVICE is smtp.',
    'Each profile requires from, host, port, secure, startTls, and timeoutMs.',
    'username and password are optional and must be configured together when used.',
  ],
  SMS_VERIFICATION_SERVICE: ['SMS verification delivery service. Options: off, aliyun.'],
  SMS_VERIFICATION_CODE_EXPIRES_IN_MS: ['SMS verification code lifetime in milliseconds.'],
  SMS_VERIFICATION_CODE_COOLDOWN_MS: [
    'Minimum time between verification code sends for the same phone number and purpose, in milliseconds.',
  ],
  SMS_ALICLOUD_PROFILES: [
    'Aliyun SMS profile table array. Required only when SMS_VERIFICATION_SERVICE is aliyun.',
    'Configure one profile per supported phone country code: +86, +852, and +853.',
  ],
  SSO_ENABLED: ['Whether single sign-on login and binding are enabled.'],
  SSO_PROFILES: [
    'SSO provider profile table array. Required only when SSO_ENABLED is true.',
    'Configure one profile for each OAuth 2.0 or OpenID Connect provider.',
    'Profile IDs must be unique and are used for account binding.',
  ],
};

export function getSetupEnvironmentDefaults() {
  return {
    environment: getDefaultSetupEnvironment(),
    environmentFileLoaded: hasConfigFile(),
  };
}

export async function updateSetupEnvironmentConfig(input: unknown) {
  const { environment } = setupEnvironmentInputSchema.parse(input);
  const setupEnvironmentSource = assertValidEnvironment(environment);

  await writeConfigFile(setupEnvironmentSource, {
    allowLocked: true,
    generator: 'system settings page',
  });

  return {
    restartRequired: true,
    updated: true,
  } as const;
}

export function assertValidEnvironment(environment: SetupEnvironment, options: EnvironmentValidationOptions = {}) {
  assertRequiredEnvironment(environment, options);

  const environmentSource = toEnvironmentSource(environment, options);
  const validationMessage = getEnvValidationMessage(environmentSource);

  if (validationMessage) {
    throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, { reason: validationMessage });
  }

  return environmentSource;
}

function toEnvironmentSource(
  environment: SetupEnvironment,
  options: EnvironmentValidationOptions = {},
): NodeJS.ProcessEnv {
  const environmentSource: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(environment)) {
    const normalized = value.trim();

    if (normalized) {
      environmentSource[key] = normalized;
    }
  }

  if (options.relaxedSms && environmentSource.SMS_VERIFICATION_SERVICE === SetupSmsVerificationService.Aliyun) {
    environmentSource.SMS_VERIFICATION_SERVICE = SetupSmsVerificationService.Off;
  }

  return environmentSource;
}

export function assertValidSetupStepEnvironment(environment: SetupEnvironment, stepId: SetupStepId) {
  if (stepId === SetupEnvironmentStep.Administrator) {
    return;
  }

  if (stepId === SetupEnvironmentStep.Runtime) {
    assertValidRuntimeEnvironment(environment);
    return;
  }

  if (stepId === SetupEnvironmentStep.Scheduler) {
    assertValidEnvironmentFields(environment, schedulerEnvironmentKeys, schedulerEnvironmentKeys);
    return;
  }

  assertValidEnvironmentFields(environment, securityEnvironmentKeys, securityEnvironmentKeys);
}

function assertValidRuntimeEnvironment(environment: SetupEnvironment) {
  assertRequiredFields(environment, runtimeEnvironmentKeys);
  assertHttpOrigin(environment.APP_DOMAIN, 'APP_DOMAIN');
  assertCspResourceOrigins(environment.APP_CSP_RESOURCE_ORIGINS);
  assertAllowedValue(environment.NODE_ENV, 'NODE_ENV', setupNodeEnvValues);
  assertAllowedValue(environment.SERVER_TRUST_PROXY, 'SERVER_TRUST_PROXY', setupBooleanValues);
  assertAllowedValue(environment.SERVER_MULTI_INSTANCE_ENABLED, 'SERVER_MULTI_INSTANCE_ENABLED', setupBooleanValues);
  parsePositiveInteger(environment.SERVER_PORT, 'SERVER_PORT');
}

export function assertValidDatabaseEnvironment(environment: SetupEnvironment) {
  const dialect = setupDatabaseDialectSchema.parse(environment.DATABASE_DIALECT.trim());
  const requiredFields: Array<keyof SetupEnvironment> =
    dialect === SetupDatabaseDialect.Sqlite
      ? ['DATABASE_DIALECT', 'DATABASE_STORAGE']
      : [
          'DATABASE_DIALECT',
          'DATABASE_URL',
          'DATABASE_SSL',
          'DATABASE_CONNECT_TIMEOUT_MS',
          'DATABASE_POOL_MAX',
          'DATABASE_POOL_MIN',
          'DATABASE_POOL_ACQUIRE_MS',
          'DATABASE_POOL_IDLE_MS',
        ];

  assertValidEnvironmentFields(environment, databaseEnvironmentKeys, requiredFields);

  if (
    environment.SERVER_MULTI_INSTANCE_ENABLED.trim() === SetupBoolean.True &&
    dialect === SetupDatabaseDialect.Sqlite
  ) {
    throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, {
      reason: 'DATABASE_DIALECT must be mysql or postgres when SERVER_MULTI_INSTANCE_ENABLED is true.',
    });
  }
}

export function assertValidFileStorageEnvironment(environment: SetupEnvironment) {
  const driver = setupFileStorageDriverSchema.parse(environment.FILE_STORAGE_DRIVER.trim());
  const requiredFields: Array<keyof SetupEnvironment> =
    driver === SetupFileStorageDriver.Local
      ? ['FILE_STORAGE_DRIVER', 'FILE_UPLOAD_MAX_BYTES', 'FILE_PUBLIC_BASE_URL', 'FILE_LOCAL_ROOT']
      : [
          'FILE_STORAGE_DRIVER',
          'FILE_UPLOAD_MAX_BYTES',
          'FILE_OSS_ACCESS_KEY_ID',
          'FILE_OSS_ACCESS_KEY_SECRET',
          'FILE_OSS_BUCKET',
          'FILE_OSS_ENDPOINT',
          'FILE_OSS_REGION',
        ];

  return assertValidEnvironmentFields(environment, fileStorageEnvironmentKeys, requiredFields);
}

export function assertValidLoggingEnvironment(environment: SetupEnvironment) {
  const requiredFields: Array<keyof SetupEnvironment> = [
    'LOG_REQUEST_ENABLED',
    'LOG_TARGETS',
    'LOG_PENDING_WRITE_MAX',
    'LOG_WRITE_TIMEOUT_MS',
  ];
  const logTargets = parseLogTargets(environment.LOG_TARGETS);

  if (logTargets.includes(SetupLogTarget.Local)) {
    requiredFields.push('LOG_LOCAL_PATH');
  }

  if (logTargets.includes(SetupLogTarget.Sls)) {
    requiredFields.push(
      'LOG_SLS_ENDPOINT',
      'LOG_SLS_PROJECT',
      'LOG_SLS_LOGSTORE',
      'LOG_SLS_ACCESS_KEY_ID',
      'LOG_SLS_ACCESS_KEY_SECRET',
      'LOG_SLS_TOPIC',
      'LOG_SLS_SOURCE',
    );
  }

  return assertValidEnvironmentFields(environment, loggingEnvironmentKeys, requiredFields);
}

export function assertValidEmailEnvironment(environment: SetupEnvironment) {
  return assertValidConditionalEnvironmentFields(
    environment,
    emailEnvironmentKeys,
    ['EMAIL_VERIFICATION_SERVICE'],
    [
      {
        isEnabled: (currentEnvironment) =>
          currentEnvironment.EMAIL_VERIFICATION_SERVICE.trim() === SetupEmailVerificationService.Smtp,
        keys: ['EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS', 'EMAIL_VERIFICATION_CODE_COOLDOWN_MS', 'EMAIL_SMTP_PROFILES'],
      },
    ],
  );
}

export function assertValidSmsEnvironment(environment: SetupEnvironment) {
  return assertValidConditionalEnvironmentFields(
    environment,
    smsEnvironmentKeys,
    ['SMS_VERIFICATION_SERVICE'],
    [
      {
        isEnabled: (currentEnvironment) =>
          currentEnvironment.SMS_VERIFICATION_SERVICE.trim() === SetupSmsVerificationService.Aliyun,
        keys: ['SMS_VERIFICATION_CODE_EXPIRES_IN_MS', 'SMS_VERIFICATION_CODE_COOLDOWN_MS', 'SMS_ALICLOUD_PROFILES'],
      },
    ],
  );
}

export function assertValidSsoEnvironment(environment: SetupEnvironment) {
  return assertValidConditionalEnvironmentFields(
    environment,
    ssoEnvironmentKeys,
    ['SSO_ENABLED'],
    [
      {
        isEnabled: (currentEnvironment) => currentEnvironment.SSO_ENABLED.trim() === SetupBoolean.True,
        keys: ['SSO_PROFILES'],
      },
    ],
  );
}

function assertValidConditionalEnvironmentFields(
  environment: SetupEnvironment,
  keys: readonly (keyof SetupEnvironment)[],
  baseRequiredKeys: readonly (keyof SetupEnvironment)[],
  conditionalRequiredFields: readonly ConditionalRequiredEnvironmentFields[],
) {
  const requiredKeys = [...baseRequiredKeys];

  for (const conditionalFields of conditionalRequiredFields) {
    if (conditionalFields.isEnabled(environment)) {
      requiredKeys.push(...conditionalFields.keys);
    }
  }

  return assertValidEnvironmentFields(environment, keys, requiredKeys);
}

function assertValidEnvironmentFields(
  environment: SetupEnvironment,
  keys: readonly (keyof SetupEnvironment)[],
  requiredKeys: readonly (keyof SetupEnvironment)[],
) {
  assertRequiredFields(environment, requiredKeys);

  const environmentSource = toStepEnvironmentSource(environment, keys);
  const validationMessage = getEnvValidationMessage(environmentSource);

  if (validationMessage) {
    throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, { reason: validationMessage });
  }

  return environmentSource;
}

function toStepEnvironmentSource(environment: SetupEnvironment, keys: readonly (keyof SetupEnvironment)[]) {
  const stepEnvironment: SetupEnvironment = {
    ...defaultSetupEnvironment,
    AUTH_TOKEN_SECRET: setupValidationAuthTokenSecret,
    DATABASE_STORAGE: ':memory:',
    SERVER_MULTI_INSTANCE_ENABLED: SetupBoolean.False,
    NODE_ENV: SetupNodeEnv.Development,
  };

  for (const key of keys) {
    stepEnvironment[key] = environment[key];
  }

  return toEnvironmentSource(stepEnvironment);
}

function assertAllowedValue(value: string, label: string, allowedValues: readonly string[]) {
  const normalized = value.trim();

  if (!allowedValues.includes(normalized)) {
    throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, { allowedValues, field: label });
  }
}

function assertHttpOrigin(value: string, label: string) {
  try {
    const url = new URL(value.trim());

    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    ) {
      return;
    }
  } catch {
    // Normalize all parsing failures to the setup validation error below.
  }

  throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, { field: label });
}

function assertCspResourceOrigins(value: string) {
  for (const source of parseSeparatedValues(value, /[,\n]/)) {
    if (source !== '*') {
      assertHttpOrigin(source, 'APP_CSP_RESOURCE_ORIGINS');
    }
  }
}

export function toDatabaseConfig(environment: SetupEnvironment) {
  const dialect = setupDatabaseDialectSchema.parse(environment.DATABASE_DIALECT.trim());

  if (dialect === SetupDatabaseDialect.Sqlite) {
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
    ssl: environment.DATABASE_SSL.trim() === SetupBoolean.True,
    url: environment.DATABASE_URL.trim(),
  };
}

export function toCacheConfig(environment: SetupEnvironment) {
  const store = setupCacheStoreSchema.parse(environment.CACHE_STORE.trim());

  if (store === SetupCacheStore.Memory) {
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

export function toFileStorageConfig(environment: SetupEnvironment) {
  const driver = setupFileStorageDriverSchema.parse(environment.FILE_STORAGE_DRIVER.trim());
  const environmentConfig = loadEnv(assertValidFileStorageEnvironment(environment));

  if (driver === SetupFileStorageDriver.Local) {
    return environmentConfig.fileStorage;
  }

  if (environmentConfig.fileStorage.driver !== SetupFileStorageDriver.Oss) {
    throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400);
  }

  return environmentConfig.fileStorage;
}

export function parseLogTargets(value: string) {
  return parseSeparatedValues(value, ',');
}

function assertRequiredEnvironment(environment: SetupEnvironment, options: EnvironmentValidationOptions = {}) {
  assertRequiredFields(environment, [
    'NODE_ENV',
    'SERVER_HOST',
    'SERVER_PORT',
    'APP_DOMAIN',
    'APP_CORS_ORIGINS',
    'APP_CSP_RESOURCE_ORIGINS',
    'SERVER_TRUST_PROXY',
    'SERVER_MULTI_INSTANCE_ENABLED',
    'DATABASE_DIALECT',
    'CACHE_STORE',
    'FILE_STORAGE_DRIVER',
    'FILE_UPLOAD_MAX_BYTES',
    'SCHEDULER_ENABLED',
    'SCHEDULER_LOCK_TTL_MS',
    'AUTH_TOKEN_SECRET',
    'AUTH_ACCESS_TOKEN_TTL_SECONDS',
    'AUTH_REFRESH_TOKEN_TTL_SECONDS',
    'AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS',
    'AUTH_VERIFICATION_MAX_ATTEMPTS',
    'AUTH_VERIFICATION_SUDO_TTL_SECONDS',
    'AUTH_PASSKEY_RP_NAME',
    'AUTH_PASSKEY_REGISTRATION_TTL_SECONDS',
    'AUTH_PASSKEY_OPERATION_TIMEOUT_MS',
    'AUTH_TOTP_ISSUER',
    'AUTH_TOTP_SETUP_TTL_SECONDS',
    'AUTH_ACCESS_TOKEN_COOKIE_NAME',
    'AUTH_REFRESH_TOKEN_COOKIE_NAME',
    'AUTH_COOKIE_SAME_SITE',
    'AUTH_COOKIE_SECURE',
    'AUTH_RATE_LIMIT_WINDOW_MS',
    'AUTH_RATE_LIMIT_MAX',
    'GLOBAL_RATE_LIMIT_WINDOW_MS',
    'GLOBAL_RATE_LIMIT_MAX',
    'LOG_REQUEST_ENABLED',
    'LOG_TARGETS',
    'LOG_PENDING_WRITE_MAX',
    'LOG_WRITE_TIMEOUT_MS',
    'EMAIL_VERIFICATION_SERVICE',
    'SMS_VERIFICATION_SERVICE',
    'SSO_ENABLED',
  ]);

  if (environment.DATABASE_DIALECT.trim() === SetupDatabaseDialect.Sqlite) {
    assertRequiredFields(environment, ['DATABASE_STORAGE']);
  } else {
    assertRequiredFields(environment, [
      'DATABASE_URL',
      'DATABASE_SSL',
      'DATABASE_CONNECT_TIMEOUT_MS',
      'DATABASE_POOL_MAX',
      'DATABASE_POOL_MIN',
      'DATABASE_POOL_ACQUIRE_MS',
      'DATABASE_POOL_IDLE_MS',
    ]);
  }

  if (environment.CACHE_STORE.trim() === SetupCacheStore.Redis) {
    assertRequiredFields(environment, ['CACHE_REDIS_REQUEST_TIMEOUT_MS', 'CACHE_REDIS_URL']);
  }

  if (environment.FILE_STORAGE_DRIVER.trim() === SetupFileStorageDriver.Local) {
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

  if (logTargets.includes(SetupLogTarget.Local)) {
    assertRequiredFields(environment, ['LOG_LOCAL_PATH']);
  }

  if (logTargets.includes(SetupLogTarget.Sls)) {
    assertRequiredFields(environment, [
      'LOG_SLS_ENDPOINT',
      'LOG_SLS_PROJECT',
      'LOG_SLS_LOGSTORE',
      'LOG_SLS_ACCESS_KEY_ID',
      'LOG_SLS_ACCESS_KEY_SECRET',
      'LOG_SLS_TOPIC',
      'LOG_SLS_SOURCE',
    ]);
  }

  if (environment.EMAIL_VERIFICATION_SERVICE.trim() === SetupEmailVerificationService.Smtp) {
    assertRequiredFields(environment, [
      'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS',
      'EMAIL_VERIFICATION_CODE_COOLDOWN_MS',
      'EMAIL_SMTP_PROFILES',
    ]);
  }

  if (!options.relaxedSms && environment.SMS_VERIFICATION_SERVICE.trim() === SetupSmsVerificationService.Aliyun) {
    assertRequiredFields(environment, [
      'SMS_VERIFICATION_CODE_EXPIRES_IN_MS',
      'SMS_VERIFICATION_CODE_COOLDOWN_MS',
      'SMS_ALICLOUD_PROFILES',
    ]);
  }

  if (environment.SSO_ENABLED.trim() === SetupBoolean.True) {
    assertRequiredFields(environment, ['SSO_PROFILES']);
  }
}

function assertRequiredFields(environment: SetupEnvironment, keys: readonly (keyof SetupEnvironment)[]) {
  const missing = keys.filter((key) => !environment[key].trim());

  if (missing.length > 0) {
    throw new AppError('SETUP_ENV_REQUIRED', 'error.SETUP_ENV_REQUIRED', 400, { missing });
  }
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value.trim());

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, { field: label });
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, label: string) {
  const parsed = Number(value.trim());

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, { field: label });
  }

  return parsed;
}

export async function assertConfigFileWritable(setupEnvironmentSource: NodeJS.ProcessEnv) {
  const configFilePath = getConfigFilePath();
  const temporaryConfigFilePath = getTemporaryConfigFilePath(configFilePath);

  try {
    if (hasConfigFile()) {
      const configFileStats = await stat(configFilePath);

      if (!configFileStats.isFile()) {
        throw new AppError('SETUP_CONFIG_WRITE_FAILED', 'error.SETUP_CONFIG_WRITE_FAILED', 500);
      }

      await access(configFilePath, constants.W_OK);
    }

    await writeFile(temporaryConfigFilePath, renderConfigFile(setupEnvironmentSource), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('SETUP_CONFIG_WRITE_FAILED', 'error.SETUP_CONFIG_WRITE_FAILED', 500);
  } finally {
    await unlink(temporaryConfigFilePath).catch(() => undefined);
  }
}

export async function writeConfigFile(setupEnvironmentSource: NodeJS.ProcessEnv, options: ConfigFileWriteOptions = {}) {
  if (!options.allowLocked && isSetupLocked()) {
    throw new AppError('SETUP_LOCKED', 'error.SETUP_LOCKED', 403);
  }

  const configFilePath = getConfigFilePath();
  const temporaryConfigFilePath = getTemporaryConfigFilePath(configFilePath);

  try {
    await writeFile(temporaryConfigFilePath, renderConfigFile(setupEnvironmentSource, options.generator), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    if (!options.allowLocked && isSetupLocked()) {
      throw new AppError('SETUP_LOCKED', 'error.SETUP_LOCKED', 403);
    }
    await rename(temporaryConfigFilePath, configFilePath);
  } catch (error) {
    await unlink(temporaryConfigFilePath).catch(() => undefined);
    throw error;
  }
}

function getTemporaryConfigFilePath(configFilePath: string) {
  return `${configFilePath}.${process.pid}.${randomUUID()}.tmp`;
}

function renderConfigFile(setupEnvironmentSource: NodeJS.ProcessEnv, generator = 'setup process') {
  const configFileLines = [
    `# Generated by the ${generator}.`,
    '# Do not commit this file.',
    '',
    '# Setup',
    '# Setup lock state.',
    '# Missing or false enables setup; true locks setup.',
    'SETUP_LOCKED = true',
    '',
  ];
  const profileEntries: Array<[keyof SetupEnvironment, string]> = [];

  for (const environmentGroup of envGroups) {
    configFileLines.push(`# ${environmentGroup.name}`);

    for (const environmentKey of environmentGroup.keys) {
      const environmentValue = setupEnvironmentSource[environmentKey];

      if (environmentValue !== undefined) {
        if (profileEnvironmentKeySet.has(environmentKey)) {
          profileEntries.push([environmentKey, environmentValue]);
        } else if (emptyOptionalConfigKeySet.has(environmentKey) && environmentValue.trim() === '') {
          continue;
        } else {
          pushConfigCommentLines(configFileLines, environmentKey);
          configFileLines.push(`${environmentKey} = ${formatTomlValue(environmentValue)}`);
        }
      }
    }

    configFileLines.push('');
  }

  const renderedProfiles = renderProfileTables(profileEntries);

  if (renderedProfiles.length > 0) {
    configFileLines.push('# Profile Arrays', ...renderedProfiles, '');
  }

  return `${configFileLines.join('\n').trimEnd()}\n`;
}

function renderProfileTables(profileEntries: Array<[keyof SetupEnvironment, string]>) {
  const lines: string[] = [];

  for (const [environmentKey, environmentValue] of profileEntries) {
    const profiles = parseProfileEnvironmentValue(environmentKey, environmentValue);

    if (profiles.length > 0) {
      pushConfigCommentLines(lines, environmentKey);
    }

    for (const profile of profiles) {
      lines.push(`[[${environmentKey}]]`);

      for (const [key, value] of Object.entries(profile)) {
        lines.push(`${key} = ${formatTomlValue(value)}`);
      }

      lines.push('');
    }
  }

  return lines;
}

function pushConfigCommentLines(lines: string[], environmentKey: keyof SetupEnvironment) {
  const comments = setupConfigComments[environmentKey];

  if (comments) {
    lines.push(...comments.map((comment) => `# ${comment}`));
  }
}

function parseProfileEnvironmentValue(environmentKey: keyof SetupEnvironment, value: string) {
  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed.filter((profile): profile is Record<string, unknown> =>
        Boolean(profile && typeof profile === 'object'),
      );
    }
  } catch {
    throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, { field: environmentKey });
  }

  throw new AppError('SETUP_ENV_INVALID', 'error.SETUP_ENV_INVALID', 400, { field: environmentKey });
}

function formatTomlValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(formatTomlValue).join(', ')}]`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value === undefined || value === null) {
    return '""';
  }

  return JSON.stringify(String(value));
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
  const environmentFileSource = loadConfigFileSource();
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
