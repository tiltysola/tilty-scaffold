export const SetupBoolean = {
  False: 'false',
  True: 'true',
} as const;

export const setupBooleanValues = [SetupBoolean.False, SetupBoolean.True] as const;

export type SetupBooleanValue = (typeof setupBooleanValues)[number];

export const SetupNodeEnv = {
  Development: 'development',
  Test: 'test',
  Production: 'production',
} as const;

export const setupNodeEnvValues = [SetupNodeEnv.Development, SetupNodeEnv.Test, SetupNodeEnv.Production] as const;

export type SetupNodeEnvValue = (typeof setupNodeEnvValues)[number];

export const SetupDatabaseDialect = {
  Sqlite: 'sqlite',
  Mysql: 'mysql',
  Postgres: 'postgres',
} as const;

export const setupDatabaseDialectValues = [
  SetupDatabaseDialect.Sqlite,
  SetupDatabaseDialect.Mysql,
  SetupDatabaseDialect.Postgres,
] as const;

export type SetupDatabaseDialectValue = (typeof setupDatabaseDialectValues)[number];

export const SetupCacheStore = {
  Memory: 'memory',
  Redis: 'redis',
} as const;

export const setupCacheStoreValues = [SetupCacheStore.Memory, SetupCacheStore.Redis] as const;

export type SetupCacheStoreValue = (typeof setupCacheStoreValues)[number];

export const SetupFileStorageDriver = {
  Local: 'local',
  Oss: 'oss',
} as const;

export const setupFileStorageDriverValues = [SetupFileStorageDriver.Local, SetupFileStorageDriver.Oss] as const;

export type SetupFileStorageDriverValue = (typeof setupFileStorageDriverValues)[number];

export const defaultFileUploadMaxBytes = 2 * 1024 * 1024;

export const SetupLogTarget = {
  Console: 'console',
  Local: 'local',
  Sls: 'sls',
} as const;

export const setupLogTargetValues = [SetupLogTarget.Console, SetupLogTarget.Local, SetupLogTarget.Sls] as const;

export type SetupLogTargetValue = (typeof setupLogTargetValues)[number];

export const SetupAuthCookieSameSite = {
  Lax: 'lax',
  Strict: 'strict',
  None: 'none',
} as const;

export const setupAuthCookieSameSiteValues = [
  SetupAuthCookieSameSite.Lax,
  SetupAuthCookieSameSite.Strict,
  SetupAuthCookieSameSite.None,
] as const;

export type SetupAuthCookieSameSiteValue = (typeof setupAuthCookieSameSiteValues)[number];

export const SetupAuthCookieSecure = {
  Auto: 'auto',
  True: 'true',
  False: 'false',
} as const;

export const setupAuthCookieSecureValues = [
  SetupAuthCookieSecure.Auto,
  SetupAuthCookieSecure.True,
  SetupAuthCookieSecure.False,
] as const;

export type SetupAuthCookieSecureValue = (typeof setupAuthCookieSecureValues)[number];

export const SetupEmailVerificationService = {
  Off: 'off',
  Smtp: 'smtp',
} as const;

export const setupEmailVerificationServiceValues = [
  SetupEmailVerificationService.Off,
  SetupEmailVerificationService.Smtp,
] as const;

export type SetupEmailVerificationServiceValue = (typeof setupEmailVerificationServiceValues)[number];

export const SetupSmsVerificationService = {
  Off: 'off',
  Aliyun: 'aliyun',
} as const;

export const setupSmsVerificationServiceValues = [
  SetupSmsVerificationService.Off,
  SetupSmsVerificationService.Aliyun,
] as const;

export type SetupSmsVerificationServiceValue = (typeof setupSmsVerificationServiceValues)[number];

export const SetupSmsPhoneCountryCode = {
  ChinaMainland: '+86',
  HongKong: '+852',
  Macao: '+853',
} as const;

export const setupSmsPhoneCountryCodeValues = [
  SetupSmsPhoneCountryCode.ChinaMainland,
  SetupSmsPhoneCountryCode.HongKong,
  SetupSmsPhoneCountryCode.Macao,
] as const;

export type SetupSmsPhoneCountryCodeValue = (typeof setupSmsPhoneCountryCodeValues)[number];

export const SetupSsoProtocol = {
  Oauth2: 'oauth2',
  Oidc: 'oidc',
} as const;

export const setupSsoProtocolValues = [SetupSsoProtocol.Oauth2, SetupSsoProtocol.Oidc] as const;

export type SetupSsoProtocolValue = (typeof setupSsoProtocolValues)[number];

export const SetupEnvironmentStep = {
  Administrator: 'administrator',
  Runtime: 'runtime',
  Scheduler: 'scheduler',
  Security: 'security',
} as const;

export const setupEnvironmentStepValues = [
  SetupEnvironmentStep.Administrator,
  SetupEnvironmentStep.Runtime,
  SetupEnvironmentStep.Scheduler,
  SetupEnvironmentStep.Security,
] as const;

export type SetupEnvironmentStepValue = (typeof setupEnvironmentStepValues)[number];
