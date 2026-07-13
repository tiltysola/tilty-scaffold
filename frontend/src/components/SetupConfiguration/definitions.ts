import {
  CalendarClockIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  DatabaseZapIcon,
  FileTextIcon,
  HardDriveIcon,
  KeyRoundIcon,
  type LucideIcon,
  MailIcon,
  ServerIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UserPlusIcon,
} from 'lucide-react';

import { type SetupAdministrator, type SetupEnvironment } from '@/lib/setup';
import {
  type SetupAuthCookieSameSiteValue,
  setupAuthCookieSameSiteValues,
  type SetupAuthCookieSecureValue,
  setupAuthCookieSecureValues,
  SetupBoolean,
  type SetupBooleanValue,
  setupBooleanValues,
  SetupCacheStore,
  type SetupCacheStoreValue,
  setupCacheStoreValues,
  SetupDatabaseDialect,
  type SetupDatabaseDialectValue,
  setupDatabaseDialectValues,
  SetupEmailVerificationService,
  type SetupEmailVerificationServiceValue,
  setupEmailVerificationServiceValues,
  SetupFileStorageDriver,
  type SetupFileStorageDriverValue,
  setupFileStorageDriverValues,
  SetupLogTarget,
  type SetupLogTargetValue,
  type SetupNodeEnvValue,
  setupNodeEnvValues,
  SetupSmsVerificationService,
  type SetupSmsVerificationServiceValue,
  setupSmsVerificationServiceValues,
} from '@tilty/shared/setup';

type FieldKind = 'password' | 'select' | 'sms-profiles' | 'smtp-profiles' | 'sso-profiles' | 'textarea' | 'text';
type SelectOption = { value: string };

export interface SetupFieldDefinition {
  key: string;
  group?: string;
  kind?: FieldKind;
  options?: SelectOption[];
  visible?: (environment: SetupEnvironment) => boolean;
}

export interface SetupStepDefinition {
  id: string;
  icon: LucideIcon;
  fields?: SetupFieldDefinition[];
}

interface FieldHelp {
  descriptionMessageId?: string;
  placeholder?: string;
  placeholderMessageId?: string;
}

export const administratorDefaults: SetupAdministrator = {
  username: '',
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const booleanOptions = createSelectOptions<SetupBooleanValue>(setupBooleanValues);

const nodeEnvOptions = createSelectOptions<SetupNodeEnvValue>(setupNodeEnvValues);

const databaseDialectOptions = createSelectOptions<SetupDatabaseDialectValue>(setupDatabaseDialectValues);

const cacheStoreOptions = createSelectOptions<SetupCacheStoreValue>(setupCacheStoreValues);

const fileStorageDriverOptions = createSelectOptions<SetupFileStorageDriverValue>(setupFileStorageDriverValues);

const authCookieSameSiteOptions = createSelectOptions<SetupAuthCookieSameSiteValue>(setupAuthCookieSameSiteValues);

const authCookieSecureOptions = createSelectOptions<SetupAuthCookieSecureValue>(setupAuthCookieSecureValues);

const logTargetOptions = [
  { value: SetupLogTarget.Console },
  { value: joinLogTargets([SetupLogTarget.Console, SetupLogTarget.Local]) },
  { value: joinLogTargets([SetupLogTarget.Console, SetupLogTarget.Sls]) },
  { value: joinLogTargets([SetupLogTarget.Console, SetupLogTarget.Local, SetupLogTarget.Sls]) },
  { value: SetupLogTarget.Local },
  { value: SetupLogTarget.Sls },
] satisfies SelectOption[];

const emailVerificationServiceOptions = createSelectOptions<SetupEmailVerificationServiceValue>(
  setupEmailVerificationServiceValues,
);

const smsVerificationServiceOptions = createSelectOptions<SetupSmsVerificationServiceValue>(
  setupSmsVerificationServiceValues,
);

export const setupFieldHelp: Record<string, FieldHelp> = {
  NODE_ENV: {},
  SERVER_HOST: { placeholderMessageId: 'setup.field.SERVER_HOST.placeholder' },
  SERVER_PORT: { placeholderMessageId: 'setup.field.SERVER_PORT.placeholder' },
  APP_DOMAIN: { placeholderMessageId: 'setup.field.APP_DOMAIN.placeholder' },
  APP_CORS_ORIGINS: { placeholderMessageId: 'setup.field.APP_CORS_ORIGINS.placeholder' },
  SERVER_TRUST_PROXY: {},
  SERVER_MULTI_INSTANCE_ENABLED: {},
  DATABASE_DIALECT: {},
  DATABASE_STORAGE: { placeholderMessageId: 'setup.field.DATABASE_STORAGE.placeholder' },
  DATABASE_URL: { placeholderMessageId: 'setup.field.DATABASE_URL.placeholder' },
  DATABASE_SSL: {},
  DATABASE_CONNECT_TIMEOUT_MS: { placeholderMessageId: 'setup.field.DATABASE_CONNECT_TIMEOUT_MS.placeholder' },
  DATABASE_POOL_MAX: { placeholderMessageId: 'setup.field.DATABASE_POOL_MAX.placeholder' },
  DATABASE_POOL_MIN: { placeholderMessageId: 'setup.field.DATABASE_POOL_MIN.placeholder' },
  DATABASE_POOL_ACQUIRE_MS: { placeholderMessageId: 'setup.field.DATABASE_POOL_ACQUIRE_MS.placeholder' },
  DATABASE_POOL_IDLE_MS: { placeholderMessageId: 'setup.field.DATABASE_POOL_IDLE_MS.placeholder' },
  CACHE_STORE: {},
  CACHE_REDIS_URL: { placeholderMessageId: 'setup.field.CACHE_REDIS_URL.placeholder' },
  CACHE_REDIS_REQUEST_TIMEOUT_MS: { placeholderMessageId: 'setup.field.CACHE_REDIS_REQUEST_TIMEOUT_MS.placeholder' },
  FILE_STORAGE_DRIVER: {},
  FILE_UPLOAD_MAX_BYTES: { placeholderMessageId: 'setup.field.FILE_UPLOAD_MAX_BYTES.placeholder' },
  FILE_PUBLIC_BASE_URL: { placeholderMessageId: 'setup.field.FILE_PUBLIC_BASE_URL.placeholder' },
  FILE_LOCAL_ROOT: { placeholderMessageId: 'setup.field.FILE_LOCAL_ROOT.placeholder' },
  FILE_OSS_ACCESS_KEY_ID: { placeholderMessageId: 'setup.field.FILE_OSS_ACCESS_KEY_ID.placeholder' },
  FILE_OSS_ACCESS_KEY_SECRET: { placeholderMessageId: 'setup.field.FILE_OSS_ACCESS_KEY_SECRET.placeholder' },
  FILE_OSS_BUCKET: { placeholderMessageId: 'setup.field.FILE_OSS_BUCKET.placeholder' },
  FILE_OSS_ENDPOINT: { placeholderMessageId: 'setup.field.FILE_OSS_ENDPOINT.placeholder' },
  FILE_OSS_REGION: { placeholderMessageId: 'setup.field.FILE_OSS_REGION.placeholder' },
  FILE_OSS_PUBLIC_BASE_URL: { placeholderMessageId: 'setup.field.FILE_OSS_PUBLIC_BASE_URL.placeholder' },
  SCHEDULER_ENABLED: {},
  SCHEDULER_LOCK_TTL_MS: { placeholderMessageId: 'setup.field.SCHEDULER_LOCK_TTL_MS.placeholder' },
  AUTH_TOKEN_SECRET: { placeholderMessageId: 'setup.field.AUTH_TOKEN_SECRET.placeholder' },
  AUTH_ACCESS_TOKEN_TTL_SECONDS: { placeholderMessageId: 'setup.field.AUTH_ACCESS_TOKEN_TTL_SECONDS.placeholder' },
  AUTH_REFRESH_TOKEN_TTL_SECONDS: { placeholderMessageId: 'setup.field.AUTH_REFRESH_TOKEN_TTL_SECONDS.placeholder' },
  AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS: {
    placeholderMessageId: 'setup.field.AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS.placeholder',
  },
  AUTH_VERIFICATION_MAX_ATTEMPTS: { placeholderMessageId: 'setup.field.AUTH_VERIFICATION_MAX_ATTEMPTS.placeholder' },
  AUTH_VERIFICATION_SUDO_TTL_SECONDS: {
    placeholderMessageId: 'setup.field.AUTH_VERIFICATION_SUDO_TTL_SECONDS.placeholder',
  },
  AUTH_PASSKEY_RP_NAME: { placeholderMessageId: 'setup.field.AUTH_PASSKEY_RP_NAME.placeholder' },
  AUTH_PASSKEY_REGISTRATION_TTL_SECONDS: {
    placeholderMessageId: 'setup.field.AUTH_PASSKEY_REGISTRATION_TTL_SECONDS.placeholder',
  },
  AUTH_PASSKEY_OPERATION_TIMEOUT_MS: {
    placeholderMessageId: 'setup.field.AUTH_PASSKEY_OPERATION_TIMEOUT_MS.placeholder',
  },
  AUTH_TOTP_ISSUER: { placeholderMessageId: 'setup.field.AUTH_TOTP_ISSUER.placeholder' },
  AUTH_TOTP_SETUP_TTL_SECONDS: { placeholderMessageId: 'setup.field.AUTH_TOTP_SETUP_TTL_SECONDS.placeholder' },
  AUTH_ACCESS_TOKEN_COOKIE_NAME: { placeholderMessageId: 'setup.field.AUTH_ACCESS_TOKEN_COOKIE_NAME.placeholder' },
  AUTH_REFRESH_TOKEN_COOKIE_NAME: { placeholderMessageId: 'setup.field.AUTH_REFRESH_TOKEN_COOKIE_NAME.placeholder' },
  AUTH_COOKIE_SAME_SITE: {},
  AUTH_COOKIE_SECURE: {},
  AUTH_RATE_LIMIT_WINDOW_MS: { placeholderMessageId: 'setup.field.AUTH_RATE_LIMIT_WINDOW_MS.placeholder' },
  AUTH_RATE_LIMIT_MAX: { placeholderMessageId: 'setup.field.AUTH_RATE_LIMIT_MAX.placeholder' },
  GLOBAL_RATE_LIMIT_WINDOW_MS: { placeholderMessageId: 'setup.field.GLOBAL_RATE_LIMIT_WINDOW_MS.placeholder' },
  GLOBAL_RATE_LIMIT_MAX: { placeholderMessageId: 'setup.field.GLOBAL_RATE_LIMIT_MAX.placeholder' },
  LOG_REQUEST_ENABLED: {},
  LOG_TARGETS: {},
  LOG_PENDING_WRITE_MAX: { placeholderMessageId: 'setup.field.LOG_PENDING_WRITE_MAX.placeholder' },
  LOG_WRITE_TIMEOUT_MS: { placeholderMessageId: 'setup.field.LOG_WRITE_TIMEOUT_MS.placeholder' },
  LOG_LOCAL_PATH: { placeholderMessageId: 'setup.field.LOG_LOCAL_PATH.placeholder' },
  LOG_SLS_ENDPOINT: { placeholderMessageId: 'setup.field.LOG_SLS_ENDPOINT.placeholder' },
  LOG_SLS_PROJECT: { placeholderMessageId: 'setup.field.LOG_SLS_PROJECT.placeholder' },
  LOG_SLS_LOGSTORE: { placeholderMessageId: 'setup.field.LOG_SLS_LOGSTORE.placeholder' },
  LOG_SLS_ACCESS_KEY_ID: { placeholderMessageId: 'setup.field.LOG_SLS_ACCESS_KEY_ID.placeholder' },
  LOG_SLS_ACCESS_KEY_SECRET: { placeholderMessageId: 'setup.field.LOG_SLS_ACCESS_KEY_SECRET.placeholder' },
  LOG_SLS_TOPIC: { placeholderMessageId: 'setup.field.LOG_SLS_TOPIC.placeholder' },
  LOG_SLS_SOURCE: { placeholderMessageId: 'setup.field.LOG_SLS_SOURCE.placeholder' },
  EMAIL_VERIFICATION_SERVICE: {},
  EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: {
    placeholderMessageId: 'setup.field.EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS.placeholder',
  },
  EMAIL_VERIFICATION_CODE_COOLDOWN_MS: {
    placeholderMessageId: 'setup.field.EMAIL_VERIFICATION_CODE_COOLDOWN_MS.placeholder',
  },
  EMAIL_SMTP_PROFILES: {},
  SMS_VERIFICATION_SERVICE: {},
  SMS_VERIFICATION_CODE_EXPIRES_IN_MS: {
    placeholderMessageId: 'setup.field.SMS_VERIFICATION_CODE_EXPIRES_IN_MS.placeholder',
  },
  SMS_VERIFICATION_CODE_COOLDOWN_MS: {
    placeholderMessageId: 'setup.field.SMS_VERIFICATION_CODE_COOLDOWN_MS.placeholder',
  },
  SMS_ALICLOUD_PROFILES: {},
  SSO_ENABLED: {},
  SSO_PROFILES: {},
};

export const administratorFieldHelp: Record<keyof SetupAdministrator, FieldHelp> = {
  username: {
    descriptionMessageId: 'setup.admin.username.description',
    placeholderMessageId: 'setup.admin.username.placeholder',
  },
  displayName: {
    descriptionMessageId: 'setup.admin.display.name.description',
    placeholderMessageId: 'setup.admin.display.name.placeholder',
  },
  email: {
    descriptionMessageId: 'setup.admin.email.description',
    placeholderMessageId: 'setup.admin.email.placeholder',
  },
  password: {
    descriptionMessageId: 'setup.admin.password.description',
    placeholderMessageId: 'setup.admin.password.placeholder',
  },
  confirmPassword: {
    descriptionMessageId: 'setup.admin.confirm.password.description',
    placeholderMessageId: 'setup.admin.confirm.password.placeholder',
  },
};

export const setupSteps: SetupStepDefinition[] = [
  {
    id: 'runtime',
    icon: ServerIcon,
    fields: [
      {
        key: 'NODE_ENV',
        group: 'server',
        kind: 'select',
        options: nodeEnvOptions,
      },
      { key: 'SERVER_HOST', group: 'server' },
      { key: 'SERVER_PORT', group: 'server' },
      { key: 'APP_DOMAIN', group: 'application' },
      { key: 'APP_CORS_ORIGINS', group: 'application', kind: 'textarea' },
      {
        key: 'SERVER_TRUST_PROXY',
        group: 'deployment',
        kind: 'select',
        options: booleanOptions,
      },
      {
        key: 'SERVER_MULTI_INSTANCE_ENABLED',
        group: 'deployment',
        kind: 'select',
        options: booleanOptions,
      },
    ],
  },
  {
    id: 'database',
    icon: DatabaseIcon,
    fields: [
      {
        key: 'DATABASE_DIALECT',
        group: 'engine',
        kind: 'select',
        options: databaseDialectOptions,
      },
      {
        key: 'DATABASE_STORAGE',
        group: 'sqlite',
        visible: (environment) => environment.DATABASE_DIALECT === SetupDatabaseDialect.Sqlite,
      },
      {
        key: 'DATABASE_URL',
        group: 'externalDatabase',
        kind: 'password',
        visible: (environment) => environment.DATABASE_DIALECT !== SetupDatabaseDialect.Sqlite,
      },
      {
        key: 'DATABASE_SSL',
        group: 'externalDatabase',
        kind: 'select',
        options: booleanOptions,
        visible: (environment) => environment.DATABASE_DIALECT !== SetupDatabaseDialect.Sqlite,
      },
      {
        key: 'DATABASE_CONNECT_TIMEOUT_MS',
        group: 'externalDatabase',
        visible: (environment) => environment.DATABASE_DIALECT !== SetupDatabaseDialect.Sqlite,
      },
      {
        key: 'DATABASE_POOL_MAX',
        group: 'connectionPool',
        visible: (environment) => environment.DATABASE_DIALECT !== SetupDatabaseDialect.Sqlite,
      },
      {
        key: 'DATABASE_POOL_MIN',
        group: 'connectionPool',
        visible: (environment) => environment.DATABASE_DIALECT !== SetupDatabaseDialect.Sqlite,
      },
      {
        key: 'DATABASE_POOL_ACQUIRE_MS',
        group: 'connectionPool',
        visible: (environment) => environment.DATABASE_DIALECT !== SetupDatabaseDialect.Sqlite,
      },
      {
        key: 'DATABASE_POOL_IDLE_MS',
        group: 'connectionPool',
        visible: (environment) => environment.DATABASE_DIALECT !== SetupDatabaseDialect.Sqlite,
      },
    ],
  },
  {
    id: 'cache',
    icon: DatabaseZapIcon,
    fields: [
      {
        key: 'CACHE_STORE',
        group: 'store',
        kind: 'select',
        options: cacheStoreOptions,
      },
      {
        key: 'CACHE_REDIS_URL',
        group: 'redis',
        kind: 'password',
        visible: (environment) => environment.CACHE_STORE === SetupCacheStore.Redis,
      },
      {
        key: 'CACHE_REDIS_REQUEST_TIMEOUT_MS',
        group: 'redis',
        visible: (environment) => environment.CACHE_STORE === SetupCacheStore.Redis,
      },
    ],
  },
  {
    id: 'file-storage',
    icon: HardDriveIcon,
    fields: [
      {
        key: 'FILE_STORAGE_DRIVER',
        group: 'driver',
        kind: 'select',
        options: fileStorageDriverOptions,
      },
      { key: 'FILE_UPLOAD_MAX_BYTES', group: 'driver' },
      {
        key: 'FILE_PUBLIC_BASE_URL',
        group: 'local',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Local,
      },
      {
        key: 'FILE_LOCAL_ROOT',
        group: 'local',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Local,
      },
      {
        key: 'FILE_OSS_ACCESS_KEY_ID',
        group: 'oss',
        kind: 'password',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Oss,
      },
      {
        key: 'FILE_OSS_ACCESS_KEY_SECRET',
        group: 'oss',
        kind: 'password',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Oss,
      },
      {
        key: 'FILE_OSS_BUCKET',
        group: 'oss',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Oss,
      },
      {
        key: 'FILE_OSS_ENDPOINT',
        group: 'oss',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Oss,
      },
      {
        key: 'FILE_OSS_REGION',
        group: 'oss',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Oss,
      },
      {
        key: 'FILE_OSS_PUBLIC_BASE_URL',
        group: 'oss',
        visible: (environment) => environment.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Oss,
      },
    ],
  },
  {
    id: 'scheduler',
    icon: CalendarClockIcon,
    fields: [
      {
        key: 'SCHEDULER_ENABLED',
        group: 'scheduler',
        kind: 'select',
        options: booleanOptions,
      },
      { key: 'SCHEDULER_LOCK_TTL_MS', group: 'distributedLock' },
    ],
  },
  {
    id: 'security',
    icon: ShieldCheckIcon,
    fields: [
      { key: 'AUTH_TOKEN_SECRET', group: 'tokens', kind: 'password' },
      { key: 'AUTH_ACCESS_TOKEN_TTL_SECONDS', group: 'tokens' },
      { key: 'AUTH_REFRESH_TOKEN_TTL_SECONDS', group: 'tokens' },
      { key: 'AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS', group: 'verification' },
      { key: 'AUTH_VERIFICATION_MAX_ATTEMPTS', group: 'verification' },
      { key: 'AUTH_VERIFICATION_SUDO_TTL_SECONDS', group: 'verification' },
      { key: 'AUTH_PASSKEY_RP_NAME', group: 'passkeys' },
      { key: 'AUTH_PASSKEY_REGISTRATION_TTL_SECONDS', group: 'passkeys' },
      { key: 'AUTH_PASSKEY_OPERATION_TIMEOUT_MS', group: 'passkeys' },
      { key: 'AUTH_TOTP_ISSUER', group: 'authenticatorApps' },
      { key: 'AUTH_TOTP_SETUP_TTL_SECONDS', group: 'authenticatorApps' },
      { key: 'AUTH_ACCESS_TOKEN_COOKIE_NAME', group: 'cookies' },
      { key: 'AUTH_REFRESH_TOKEN_COOKIE_NAME', group: 'cookies' },
      {
        key: 'AUTH_COOKIE_SAME_SITE',
        group: 'cookies',
        kind: 'select',
        options: authCookieSameSiteOptions,
      },
      {
        key: 'AUTH_COOKIE_SECURE',
        group: 'cookies',
        kind: 'select',
        options: authCookieSecureOptions,
      },
      { key: 'AUTH_RATE_LIMIT_WINDOW_MS', group: 'rateLimits' },
      { key: 'AUTH_RATE_LIMIT_MAX', group: 'rateLimits' },
      { key: 'GLOBAL_RATE_LIMIT_WINDOW_MS', group: 'rateLimits' },
      { key: 'GLOBAL_RATE_LIMIT_MAX', group: 'rateLimits' },
    ],
  },
  {
    id: 'logging',
    icon: FileTextIcon,
    fields: [
      {
        key: 'LOG_REQUEST_ENABLED',
        group: 'general',
        kind: 'select',
        options: booleanOptions,
      },
      {
        key: 'LOG_TARGETS',
        group: 'general',
        kind: 'select',
        options: logTargetOptions,
      },
      { key: 'LOG_PENDING_WRITE_MAX', group: 'writeBehavior' },
      { key: 'LOG_WRITE_TIMEOUT_MS', group: 'writeBehavior' },
      {
        key: 'LOG_LOCAL_PATH',
        group: 'local',
        visible: (environment) => hasLogTarget(environment, SetupLogTarget.Local),
      },
      {
        key: 'LOG_SLS_ENDPOINT',
        group: 'sls',
        visible: (environment) => hasLogTarget(environment, SetupLogTarget.Sls),
      },
      {
        key: 'LOG_SLS_PROJECT',
        group: 'sls',
        visible: (environment) => hasLogTarget(environment, SetupLogTarget.Sls),
      },
      {
        key: 'LOG_SLS_LOGSTORE',
        group: 'sls',
        visible: (environment) => hasLogTarget(environment, SetupLogTarget.Sls),
      },
      {
        key: 'LOG_SLS_ACCESS_KEY_ID',
        group: 'sls',
        kind: 'password',
        visible: (environment) => hasLogTarget(environment, SetupLogTarget.Sls),
      },
      {
        key: 'LOG_SLS_ACCESS_KEY_SECRET',
        group: 'sls',
        kind: 'password',
        visible: (environment) => hasLogTarget(environment, SetupLogTarget.Sls),
      },
      {
        key: 'LOG_SLS_TOPIC',
        group: 'sls',
        visible: (environment) => hasLogTarget(environment, SetupLogTarget.Sls),
      },
      {
        key: 'LOG_SLS_SOURCE',
        group: 'sls',
        visible: (environment) => hasLogTarget(environment, SetupLogTarget.Sls),
      },
    ],
  },
  {
    id: 'email',
    icon: MailIcon,
    fields: [
      {
        key: 'EMAIL_VERIFICATION_SERVICE',
        group: 'verification',
        kind: 'select',
        options: emailVerificationServiceOptions,
      },
      {
        key: 'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS',
        group: 'verificationCodes',
        visible: (environment) => environment.EMAIL_VERIFICATION_SERVICE === SetupEmailVerificationService.Smtp,
      },
      {
        key: 'EMAIL_VERIFICATION_CODE_COOLDOWN_MS',
        group: 'verificationCodes',
        visible: (environment) => environment.EMAIL_VERIFICATION_SERVICE === SetupEmailVerificationService.Smtp,
      },
      {
        key: 'EMAIL_SMTP_PROFILES',
        group: 'smtp',
        kind: 'smtp-profiles',
        visible: (environment) => environment.EMAIL_VERIFICATION_SERVICE === SetupEmailVerificationService.Smtp,
      },
    ],
  },
  {
    id: 'sms',
    icon: SmartphoneIcon,
    fields: [
      {
        key: 'SMS_VERIFICATION_SERVICE',
        group: 'verification',
        kind: 'select',
        options: smsVerificationServiceOptions,
      },
      {
        key: 'SMS_VERIFICATION_CODE_EXPIRES_IN_MS',
        group: 'verificationCodes',
        visible: (environment) => environment.SMS_VERIFICATION_SERVICE === SetupSmsVerificationService.Aliyun,
      },
      {
        key: 'SMS_VERIFICATION_CODE_COOLDOWN_MS',
        group: 'verificationCodes',
        visible: (environment) => environment.SMS_VERIFICATION_SERVICE === SetupSmsVerificationService.Aliyun,
      },
      {
        key: 'SMS_ALICLOUD_PROFILES',
        group: 'aliyunSms',
        kind: 'sms-profiles',
        visible: (environment) => environment.SMS_VERIFICATION_SERVICE === SetupSmsVerificationService.Aliyun,
      },
    ],
  },
  {
    id: 'sso',
    icon: KeyRoundIcon,
    fields: [
      { key: 'SSO_ENABLED', group: 'general', kind: 'select', options: booleanOptions },
      {
        key: 'SSO_PROFILES',
        group: 'providers',
        kind: 'sso-profiles',
        visible: (environment) => environment.SSO_ENABLED === SetupBoolean.True,
      },
    ],
  },
  {
    id: 'administrator',
    icon: UserPlusIcon,
  },
  {
    id: 'review',
    icon: CheckCircle2Icon,
  },
];

export function hasLogTarget(environment: SetupEnvironment, target: SetupLogTargetValue) {
  return environment.LOG_TARGETS?.split(',').some((item) => item.trim() === target) ?? false;
}

function createSelectOptions<T extends string>(values: readonly T[]): SelectOption[] {
  return values.map((value) => ({
    value,
  }));
}

function joinLogTargets(targets: readonly SetupLogTargetValue[]) {
  return targets.join(',');
}
