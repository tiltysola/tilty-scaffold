import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';
import { z } from 'zod';

import { isSafeRelativePath } from '@tilty/shared/paths';
import {
  SetupAuthCookieSameSite,
  setupAuthCookieSameSiteValues,
  SetupAuthCookieSecure,
  setupAuthCookieSecureValues,
  SetupBoolean,
  setupBooleanValues,
  SetupCacheStore,
  setupCacheStoreValues,
  SetupDatabaseDialect,
  setupDatabaseDialectValues,
  SetupEmailVerificationService,
  setupEmailVerificationServiceValues,
  SetupFileStorageDriver,
  setupFileStorageDriverValues,
  SetupLogTarget,
  setupLogTargetValues,
  SetupNodeEnv,
  setupNodeEnvValues,
  SetupSmsPhoneCountryCode,
  setupSmsPhoneCountryCodeValues,
  SetupSmsVerificationService,
  setupSmsVerificationServiceValues,
  SetupSsoProtocol,
  setupSsoProtocolValues,
} from '@tilty/shared/setup';

import { getRuntimeRootDirectory } from '../core/files';
import { parseSeparatedValues, parseUniqueSeparatedValues } from '../core/strings';
import { defaultSetupEnvironment, developmentAuthTokenSecret } from './defaults';

const databaseDialectSchema = z.enum(setupDatabaseDialectValues);
const cacheStoreSchema = z.enum(setupCacheStoreValues);
const emailServiceSchema = z.enum(setupEmailVerificationServiceValues);
const fileStorageDriverSchema = z.enum(setupFileStorageDriverValues);
const logTargetSchema = z.enum(setupLogTargetValues);
const smsServiceSchema = z.enum(setupSmsVerificationServiceValues);
const smsPhoneCountryCodeSchema = z.enum(setupSmsPhoneCountryCodeValues);
const ssoProtocolSchema = z.enum(setupSsoProtocolValues);
const authCookieSameSiteSchema = z.enum(setupAuthCookieSameSiteValues);
const authCookieSecureSchema = z.enum(setupAuthCookieSecureValues);
const configFileName = 'config.toml';
const profileEnvironmentKeys = ['EMAIL_SMTP_PROFILES', 'SMS_ALICLOUD_PROFILES', 'SSO_PROFILES'] as const;
const profileEnvironmentKeySet = new Set<string>(profileEnvironmentKeys);
const nodeRequire = createRequire(__filename);
const { parse: parseToml } = nodeRequire('smol-toml') as {
  parse(source: string): Record<string, unknown>;
};
const numberDefault = (value: string) => Number(value);
const cookieNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/, 'Must be a valid cookie name');
const appDomainSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .refine(isHttpOrigin, 'Must be an http:// or https:// origin such as https://app.example.com');
const cspResourceOriginsSchema = z
  .string()
  .trim()
  .min(1)
  .max(16384)
  .refine(
    (value) => parseListValues(value).every((source) => source === '*' || isHttpOrigin(source)),
    'Must contain only * or comma/newline-separated http:// or https:// origins',
  );
const optionalSmtpCredentialSchema = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.string().trim().min(1).max(512).optional(),
);
const smtpProfileSchema = z
  .object({
    from: z.string().trim().min(1).max(512),
    host: z.string().trim().min(1).max(512),
    password: optionalSmtpCredentialSchema,
    port: z.coerce.number().int().positive(),
    secure: z.boolean(),
    startTls: z.boolean(),
    timeoutMs: z.coerce.number().int().positive(),
    username: optionalSmtpCredentialSchema,
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (profile.secure && profile.startTls) {
      ctx.addIssue({
        code: 'custom',
        path: ['startTls'],
        message: 'Must be false when secure is true',
      });
    }

    if (Boolean(profile.username) !== Boolean(profile.password)) {
      for (const key of ['username', 'password'] as const) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Must be configured together when SMTP authentication is used',
        });
      }
    }
  })
  .transform((profile) => ({
    from: profile.from,
    host: profile.host,
    ...(profile.password ? { password: profile.password } : {}),
    port: profile.port,
    secure: profile.secure,
    startTls: profile.startTls,
    timeoutMs: profile.timeoutMs,
    ...(profile.username ? { username: profile.username } : {}),
  }));
const smtpProfilesSchema = z.array(smtpProfileSchema).min(1);
const optionalAliyunSmsSenderIdSchema = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z
    .string()
    .trim()
    .min(1)
    .max(15)
    .regex(/^[A-Za-z0-9]+$/, 'Sender ID may contain only letters and numbers')
    .optional(),
);
const aliyunSmsBaseProfileSchema = {
  accessKeyId: z.string().trim().min(1).max(512),
  accessKeySecret: z.string().trim().min(1).max(512),
  endpoint: z.string().trim().min(1).max(512),
  phoneCountryCode: smsPhoneCountryCodeSchema,
  regionId: z.string().trim().min(1).max(128),
};
const aliyunSmsDomesticProfileSchema = z
  .object({
    ...aliyunSmsBaseProfileSchema,
    apiVersion: z.literal('2017-05-25'),
    endpoint: z.literal('dysmsapi.aliyuncs.com'),
    operation: z.literal('SendSms'),
    phoneCountryCode: z.literal(SetupSmsPhoneCountryCode.ChinaMainland),
    regionId: z.string().trim().min(1).max(128),
    signName: z.string().trim().min(1).max(128),
    templateCode: z.string().trim().min(1).max(128),
  })
  .strict();
const aliyunSmsInternationalProfileSchema = z
  .object({
    ...aliyunSmsBaseProfileSchema,
    apiVersion: z.literal('2018-05-01'),
    endpoint: z.literal('dysmsapi.ap-southeast-1.aliyuncs.com'),
    messageTemplate: z.string().trim().min(1).max(1000),
    operation: z.literal('SendMessageToGlobe'),
    phoneCountryCode: z.enum([SetupSmsPhoneCountryCode.HongKong, SetupSmsPhoneCountryCode.Macao]),
    regionId: z.literal('ap-southeast-1'),
    senderId: optionalAliyunSmsSenderIdSchema,
    type: z.enum(['MKT', 'NOTIFY', 'OTP']).default('OTP'),
  })
  .strict();
const aliyunSmsProfileSchema = z.union([aliyunSmsDomesticProfileSchema, aliyunSmsInternationalProfileSchema]);
const aliyunSmsProfilesSchema = z
  .array(aliyunSmsProfileSchema)
  .min(1)
  .max(3)
  .superRefine((profiles, ctx) => {
    const countryCodes = new Set<string>();

    for (const [index, profile] of profiles.entries()) {
      if (countryCodes.has(profile.phoneCountryCode)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'phoneCountryCode'],
          message: 'SMS profile phone country codes must be unique',
        });
      }

      countryCodes.add(profile.phoneCountryCode);
    }
  });
const ssoProviderIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Provider ID may contain only letters, numbers, underscores, and hyphens');
const optionalSsoIconUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && !value.trim() ? undefined : value),
  z.url().max(1024).optional(),
);
const ssoProfileBaseSchema = {
  id: ssoProviderIdSchema,
  name: z.string().trim().min(1).max(128),
  iconUrl: optionalSsoIconUrlSchema,
  protocol: ssoProtocolSchema,
  loginEnabled: z.boolean(),
  bindingEnabled: z.boolean(),
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().trim().min(1).max(512),
  frontendCallbackUrl: z.url().max(1024),
  redirectUri: z.url().max(1024),
  requestTimeoutMs: z.coerce.number().int().positive(),
  scopes: z.array(z.string().trim().min(1).max(128)).min(1).max(50),
};
const ssoOidcProfileSchema = z
  .object({
    ...ssoProfileBaseSchema,
    protocol: z.literal(SetupSsoProtocol.Oidc),
    issuerUrl: z.url().max(1024),
  })
  .strict()
  .transform((profile) => ({
    ...profile,
    issuerUrl: profile.issuerUrl.replace(/\/+$/, ''),
  }));
const ssoOAuth2ProfileSchema = z
  .object({
    ...ssoProfileBaseSchema,
    protocol: z.literal(SetupSsoProtocol.Oauth2),
    authorizationUrl: z.url().max(1024),
    tokenUrl: z.url().max(1024),
    userInfoUrl: z.url().max(1024),
    subjectField: z.string().trim().min(1).max(128).default('sub'),
    emailField: z.string().trim().min(1).max(128).default('email'),
    emailVerifiedField: z.string().trim().min(1).max(128).default('email_verified'),
    displayNameField: z.string().trim().min(1).max(128).default('name'),
    usernameField: z.string().trim().min(1).max(128).default('preferred_username'),
  })
  .strict();
const ssoProfileSchema = z.union([ssoOidcProfileSchema, ssoOAuth2ProfileSchema]);
const ssoProfilesSchema = z
  .array(ssoProfileSchema)
  .min(1)
  .max(20)
  .superRefine((profiles, ctx) => {
    const providerIds = new Set<string>();

    for (const [index, profile] of profiles.entries()) {
      if (providerIds.has(profile.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: 'SSO profile IDs must be unique',
        });
      }

      providerIds.add(profile.id);
    }
  });

const envSchema = z
  .object({
    NODE_ENV: z.enum(setupNodeEnvValues).default(defaultSetupEnvironment.NODE_ENV),
    SETUP_LOCKED: z.enum(setupBooleanValues).optional(),
    SERVER_HOST: z.string().default(defaultSetupEnvironment.SERVER_HOST),
    SERVER_PORT: z.coerce.number().int().positive().default(numberDefault(defaultSetupEnvironment.SERVER_PORT)),
    APP_DOMAIN: appDomainSchema.default(defaultSetupEnvironment.APP_DOMAIN),
    APP_CORS_ORIGINS: z.string().trim().min(1).optional(),
    APP_CSP_RESOURCE_ORIGINS: cspResourceOriginsSchema.default(defaultSetupEnvironment.APP_CSP_RESOURCE_ORIGINS),
    SERVER_TRUST_PROXY: z.enum(setupBooleanValues).default(defaultSetupEnvironment.SERVER_TRUST_PROXY),
    SERVER_MULTI_INSTANCE_ENABLED: z
      .enum(setupBooleanValues)
      .default(defaultSetupEnvironment.SERVER_MULTI_INSTANCE_ENABLED),
    DATABASE_DIALECT: databaseDialectSchema.default(defaultSetupEnvironment.DATABASE_DIALECT),
    DATABASE_STORAGE: z.string().min(1).default(defaultSetupEnvironment.DATABASE_STORAGE),
    DATABASE_URL: z.string().optional(),
    DATABASE_SSL: z.enum(setupBooleanValues).default(defaultSetupEnvironment.DATABASE_SSL),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.DATABASE_CONNECT_TIMEOUT_MS)),
    DATABASE_POOL_MAX: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.DATABASE_POOL_MAX)),
    DATABASE_POOL_MIN: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(numberDefault(defaultSetupEnvironment.DATABASE_POOL_MIN)),
    DATABASE_POOL_ACQUIRE_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.DATABASE_POOL_ACQUIRE_MS)),
    DATABASE_POOL_IDLE_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.DATABASE_POOL_IDLE_MS)),
    CACHE_STORE: cacheStoreSchema.default(defaultSetupEnvironment.CACHE_STORE),
    CACHE_REDIS_URL: z.string().optional(),
    CACHE_REDIS_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.CACHE_REDIS_REQUEST_TIMEOUT_MS)),
    FILE_STORAGE_DRIVER: fileStorageDriverSchema.default(defaultSetupEnvironment.FILE_STORAGE_DRIVER),
    FILE_UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.FILE_UPLOAD_MAX_BYTES)),
    FILE_PUBLIC_BASE_URL: z.string().min(1).default(defaultSetupEnvironment.FILE_PUBLIC_BASE_URL),
    FILE_LOCAL_ROOT: z.string().min(1).default(defaultSetupEnvironment.FILE_LOCAL_ROOT),
    FILE_OSS_ACCESS_KEY_ID: z.string().min(1).optional(),
    FILE_OSS_ACCESS_KEY_SECRET: z.string().min(1).optional(),
    FILE_OSS_BUCKET: z.string().min(1).optional(),
    FILE_OSS_ENDPOINT: z.string().min(1).optional(),
    FILE_OSS_REGION: z.string().min(1).optional(),
    FILE_OSS_PUBLIC_BASE_URL: z.string().min(1).optional(),
    SCHEDULER_ENABLED: z.enum(setupBooleanValues).default(defaultSetupEnvironment.SCHEDULER_ENABLED),
    SCHEDULER_LOCK_TTL_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .default(numberDefault(defaultSetupEnvironment.SCHEDULER_LOCK_TTL_MS)),
    AUTH_TOKEN_SECRET: z.string().min(32).optional(),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_ACCESS_TOKEN_TTL_SECONDS)),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_REFRESH_TOKEN_TTL_SECONDS)),
    AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS)),
    AUTH_VERIFICATION_MAX_ATTEMPTS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_VERIFICATION_MAX_ATTEMPTS)),
    AUTH_VERIFICATION_SUDO_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_VERIFICATION_SUDO_TTL_SECONDS)),
    AUTH_PASSKEY_RP_NAME: z.string().trim().min(1).max(128).default(defaultSetupEnvironment.AUTH_PASSKEY_RP_NAME),
    AUTH_PASSKEY_REGISTRATION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_PASSKEY_REGISTRATION_TTL_SECONDS)),
    AUTH_PASSKEY_OPERATION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_PASSKEY_OPERATION_TIMEOUT_MS)),
    AUTH_TOTP_ISSUER: z.string().trim().min(1).max(128).default(defaultSetupEnvironment.AUTH_TOTP_ISSUER),
    AUTH_TOTP_SETUP_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_TOTP_SETUP_TTL_SECONDS)),
    AUTH_ACCESS_TOKEN_COOKIE_NAME: cookieNameSchema.default(defaultSetupEnvironment.AUTH_ACCESS_TOKEN_COOKIE_NAME),
    AUTH_REFRESH_TOKEN_COOKIE_NAME: cookieNameSchema.default(defaultSetupEnvironment.AUTH_REFRESH_TOKEN_COOKIE_NAME),
    AUTH_COOKIE_SAME_SITE: authCookieSameSiteSchema.default(defaultSetupEnvironment.AUTH_COOKIE_SAME_SITE),
    AUTH_COOKIE_SECURE: authCookieSecureSchema.default(defaultSetupEnvironment.AUTH_COOKIE_SECURE),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_RATE_LIMIT_WINDOW_MS)),
    AUTH_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.AUTH_RATE_LIMIT_MAX)),
    GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.GLOBAL_RATE_LIMIT_WINDOW_MS)),
    GLOBAL_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.GLOBAL_RATE_LIMIT_MAX)),
    LOG_REQUEST_ENABLED: z.enum(setupBooleanValues).default(defaultSetupEnvironment.LOG_REQUEST_ENABLED),
    LOG_TARGETS: z.string().min(1).default(defaultSetupEnvironment.LOG_TARGETS),
    LOG_PENDING_WRITE_MAX: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.LOG_PENDING_WRITE_MAX)),
    LOG_WRITE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.LOG_WRITE_TIMEOUT_MS)),
    LOG_LOCAL_PATH: z.string().min(1).default(defaultSetupEnvironment.LOG_LOCAL_PATH),
    LOG_SLS_ENDPOINT: z.string().optional(),
    LOG_SLS_PROJECT: z.string().optional(),
    LOG_SLS_LOGSTORE: z.string().optional(),
    LOG_SLS_ACCESS_KEY_ID: z.string().optional(),
    LOG_SLS_ACCESS_KEY_SECRET: z.string().optional(),
    LOG_SLS_TOPIC: z.string().min(1).default(defaultSetupEnvironment.LOG_SLS_TOPIC),
    LOG_SLS_SOURCE: z.string().min(1).default(defaultSetupEnvironment.LOG_SLS_SOURCE),
    EMAIL_VERIFICATION_SERVICE: emailServiceSchema.default(defaultSetupEnvironment.EMAIL_VERIFICATION_SERVICE),
    EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS)),
    EMAIL_VERIFICATION_CODE_COOLDOWN_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.EMAIL_VERIFICATION_CODE_COOLDOWN_MS)),
    EMAIL_SMTP_PROFILES: z.string().default(defaultSetupEnvironment.EMAIL_SMTP_PROFILES),
    SMS_VERIFICATION_SERVICE: smsServiceSchema.default(defaultSetupEnvironment.SMS_VERIFICATION_SERVICE),
    SMS_VERIFICATION_CODE_EXPIRES_IN_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.SMS_VERIFICATION_CODE_EXPIRES_IN_MS)),
    SMS_VERIFICATION_CODE_COOLDOWN_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(numberDefault(defaultSetupEnvironment.SMS_VERIFICATION_CODE_COOLDOWN_MS)),
    SMS_ALICLOUD_PROFILES: z.string().default(defaultSetupEnvironment.SMS_ALICLOUD_PROFILES),
    SSO_ENABLED: z.enum(setupBooleanValues).default(defaultSetupEnvironment.SSO_ENABLED),
    SSO_PROFILES: z.string().default(defaultSetupEnvironment.SSO_PROFILES),
  })
  .superRefine((env, ctx) => {
    const rawLogTargets = parseCommaSeparatedValues(env.LOG_TARGETS);
    const parsedLogTargets = rawLogTargets.map((target) => ({
      target,
      result: logTargetSchema.safeParse(target),
    }));
    const invalidLogTargets = parsedLogTargets.filter(({ result }) => !result.success).map(({ target }) => target);
    const logTargets = parsedLogTargets.flatMap(({ result }) => (result.success ? [result.data] : []));

    if (rawLogTargets.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_TARGETS'],
        message: 'Must include at least one log target',
      });
    }

    if (invalidLogTargets.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['LOG_TARGETS'],
        message: `Unsupported log target(s): ${invalidLogTargets.join(', ')}`,
      });
    }

    if (logTargets.includes(SetupLogTarget.Sls)) {
      for (const key of [
        'LOG_SLS_ENDPOINT',
        'LOG_SLS_PROJECT',
        'LOG_SLS_LOGSTORE',
        'LOG_SLS_ACCESS_KEY_ID',
        'LOG_SLS_ACCESS_KEY_SECRET',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when LOG_TARGETS includes sls',
          });
        }
      }
    }

    if (env.SERVER_MULTI_INSTANCE_ENABLED === SetupBoolean.True && env.CACHE_STORE !== SetupCacheStore.Redis) {
      ctx.addIssue({
        code: 'custom',
        path: ['CACHE_STORE'],
        message: 'Must be redis when SERVER_MULTI_INSTANCE_ENABLED is true',
      });
    }

    if (
      env.SERVER_MULTI_INSTANCE_ENABLED === SetupBoolean.True &&
      env.DATABASE_DIALECT === SetupDatabaseDialect.Sqlite
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_DIALECT'],
        message: 'Must be mysql or postgres when SERVER_MULTI_INSTANCE_ENABLED is true',
      });
    }

    if (
      env.SERVER_MULTI_INSTANCE_ENABLED === SetupBoolean.True &&
      env.FILE_STORAGE_DRIVER !== SetupFileStorageDriver.Oss
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['FILE_STORAGE_DRIVER'],
        message: 'Must be oss when SERVER_MULTI_INSTANCE_ENABLED is true',
      });
    }

    if (env.CACHE_STORE === SetupCacheStore.Redis) {
      if (!env.CACHE_REDIS_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['CACHE_REDIS_URL'],
          message: 'Required when CACHE_STORE is redis',
        });
      } else if (!isRedisUrl(env.CACHE_REDIS_URL)) {
        ctx.addIssue({
          code: 'custom',
          path: ['CACHE_REDIS_URL'],
          message: 'Must use redis:// or rediss:// with an optional non-negative database path',
        });
      }
    }

    if (!isPublicBaseUrl(env.FILE_PUBLIC_BASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['FILE_PUBLIC_BASE_URL'],
        message: 'Must be an absolute URL or a path starting with a single /',
      });
    }

    if (env.FILE_OSS_PUBLIC_BASE_URL && !isPublicBaseUrl(env.FILE_OSS_PUBLIC_BASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['FILE_OSS_PUBLIC_BASE_URL'],
        message: 'Must be an absolute URL or a path starting with a single /',
      });
    }

    for (const key of ['FILE_PUBLIC_BASE_URL', 'FILE_OSS_PUBLIC_BASE_URL'] as const) {
      const value = env[key];

      if (env.NODE_ENV === SetupNodeEnv.Production && value && hasUrlProtocol(value, ['http:'])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Absolute public file URLs must use https when NODE_ENV is production',
        });
      }
    }

    if (env.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Oss) {
      for (const key of [
        'FILE_OSS_ACCESS_KEY_ID',
        'FILE_OSS_ACCESS_KEY_SECRET',
        'FILE_OSS_BUCKET',
        'FILE_OSS_ENDPOINT',
        'FILE_OSS_REGION',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when FILE_STORAGE_DRIVER is oss',
          });
        }
      }
    }

    if (
      env.NODE_ENV === SetupNodeEnv.Production &&
      parseCommaSeparatedValues(env.APP_CORS_ORIGINS ?? env.APP_DOMAIN).includes('*')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_CORS_ORIGINS'],
        message: 'Must not include * when NODE_ENV is production',
      });
    }

    if (env.NODE_ENV === SetupNodeEnv.Production && hasUrlProtocol(env.APP_DOMAIN, ['http:'])) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_DOMAIN'],
        message: 'Must use https when NODE_ENV is production',
      });
    }

    if (
      env.NODE_ENV === SetupNodeEnv.Production &&
      parseCspResourceOrigins(env.APP_CSP_RESOURCE_ORIGINS).includes('*')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_CSP_RESOURCE_ORIGINS'],
        message: 'Must not include * when NODE_ENV is production',
      });
    }

    if (env.NODE_ENV === SetupNodeEnv.Production && !env.AUTH_TOKEN_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_TOKEN_SECRET'],
        message: 'Required when NODE_ENV is production',
      });
    }

    if (env.NODE_ENV === SetupNodeEnv.Production && env.AUTH_TOKEN_SECRET === developmentAuthTokenSecret) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_TOKEN_SECRET'],
        message: 'Must be changed for production',
      });
    }

    if (env.AUTH_REFRESH_TOKEN_TTL_SECONDS <= env.AUTH_ACCESS_TOKEN_TTL_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_REFRESH_TOKEN_TTL_SECONDS'],
        message: 'Must be greater than AUTH_ACCESS_TOKEN_TTL_SECONDS',
      });
    }

    if (env.AUTH_ACCESS_TOKEN_COOKIE_NAME === env.AUTH_REFRESH_TOKEN_COOKIE_NAME) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_REFRESH_TOKEN_COOKIE_NAME'],
        message: 'Must be different from AUTH_ACCESS_TOKEN_COOKIE_NAME',
      });
    }

    if (
      env.AUTH_COOKIE_SAME_SITE === SetupAuthCookieSameSite.None &&
      env.AUTH_COOKIE_SECURE !== SetupAuthCookieSecure.True
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'Must be true when AUTH_COOKIE_SAME_SITE is none',
      });
    }

    if (env.NODE_ENV === SetupNodeEnv.Production && env.AUTH_COOKIE_SECURE !== SetupAuthCookieSecure.True) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'Must be true when NODE_ENV is production',
      });
    }

    if (env.SSO_ENABLED === SetupBoolean.True) {
      const result = parseSsoProfilesResult(env.SSO_PROFILES);

      if (!result.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['SSO_PROFILES'],
          message: result.message,
        });
      } else {
        validateSsoProfileUrls(result.profiles, env.NODE_ENV, ctx);
      }
    }

    if (env.EMAIL_VERIFICATION_SERVICE === SetupEmailVerificationService.Smtp) {
      const result = parseSmtpProfilesResult(env.EMAIL_SMTP_PROFILES);

      if (!result.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_SMTP_PROFILES'],
          message: result.message,
        });
      } else if (env.NODE_ENV === 'production') {
        for (const [index, profile] of result.profiles.entries()) {
          if (!profile.secure && !profile.startTls) {
            ctx.addIssue({
              code: 'custom',
              path: ['EMAIL_SMTP_PROFILES', index, 'secure'],
              message: 'SMTP must use implicit TLS or STARTTLS when NODE_ENV is production',
            });
          }
        }
      }
    }

    if (env.SMS_VERIFICATION_SERVICE === SetupSmsVerificationService.Aliyun) {
      const result = parseAliyunSmsProfilesResult(env.SMS_ALICLOUD_PROFILES);

      if (!result.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['SMS_ALICLOUD_PROFILES'],
          message: result.message,
        });
      }
    }

    if (env.DATABASE_DIALECT === SetupDatabaseDialect.Sqlite) {
      return;
    }

    if (env.DATABASE_POOL_MIN > env.DATABASE_POOL_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_POOL_MIN'],
        message: 'Must be less than or equal to DATABASE_POOL_MAX',
      });
    }

    if (!env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Required when DATABASE_DIALECT is postgres or mysql',
      });
    }
  });

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const resolvedSource = getResolvedEnvironmentSource(source);
  const parsed = parseEnvSource(resolvedSource);
  const appDomain = normalizeOrigin(parsed.APP_DOMAIN);
  const corsOrigins = parseCommaSeparatedValues(parsed.APP_CORS_ORIGINS ?? appDomain);
  const cspResourceOrigins = parseCspResourceOrigins(parsed.APP_CSP_RESOURCE_ORIGINS);
  const logTargets = parseLogTargets(parsed.LOG_TARGETS);
  const smtpProfiles =
    parsed.EMAIL_VERIFICATION_SERVICE === SetupEmailVerificationService.Smtp
      ? parseSmtpProfiles(parsed.EMAIL_SMTP_PROFILES)
      : [];
  const smsProfiles =
    parsed.SMS_VERIFICATION_SERVICE === SetupSmsVerificationService.Aliyun
      ? parseAliyunSmsProfiles(parsed.SMS_ALICLOUD_PROFILES)
      : [];
  const ssoProfiles = parsed.SSO_ENABLED === SetupBoolean.True ? parseSsoProfiles(parsed.SSO_PROFILES) : [];
  const database =
    parsed.DATABASE_DIALECT === SetupDatabaseDialect.Sqlite
      ? {
          dialect: SetupDatabaseDialect.Sqlite,
          storage: parsed.DATABASE_STORAGE,
        }
      : {
          connectTimeoutMs: parsed.DATABASE_CONNECT_TIMEOUT_MS,
          dialect: parsed.DATABASE_DIALECT,
          pool: {
            acquire: parsed.DATABASE_POOL_ACQUIRE_MS,
            idle: parsed.DATABASE_POOL_IDLE_MS,
            max: parsed.DATABASE_POOL_MAX,
            min: parsed.DATABASE_POOL_MIN,
          },
          ssl: parsed.DATABASE_SSL === SetupBoolean.True,
          url: parsed.DATABASE_URL!,
        };

  return {
    appDomain,
    cspResourceOrigins,
    nodeEnv: parsed.NODE_ENV,
    host: parsed.SERVER_HOST,
    port: parsed.SERVER_PORT,
    trustProxy: parsed.SERVER_TRUST_PROXY === SetupBoolean.True,
    multiInstanceEnabled: parsed.SERVER_MULTI_INSTANCE_ENABLED === SetupBoolean.True,
    cache:
      parsed.CACHE_STORE === SetupCacheStore.Redis
        ? {
            store: SetupCacheStore.Redis,
            timeoutMs: parsed.CACHE_REDIS_REQUEST_TIMEOUT_MS,
            url: parsed.CACHE_REDIS_URL!,
          }
        : {
            store: SetupCacheStore.Memory,
          },
    fileStorage:
      parsed.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Oss
        ? {
            accessKeyId: parsed.FILE_OSS_ACCESS_KEY_ID!,
            accessKeySecret: parsed.FILE_OSS_ACCESS_KEY_SECRET!,
            bucket: parsed.FILE_OSS_BUCKET!,
            driver: SetupFileStorageDriver.Oss,
            endpoint: parsed.FILE_OSS_ENDPOINT!,
            ...(parsed.FILE_OSS_PUBLIC_BASE_URL ? { publicBaseUrl: parsed.FILE_OSS_PUBLIC_BASE_URL } : {}),
            region: parsed.FILE_OSS_REGION!,
          }
        : {
            driver: SetupFileStorageDriver.Local,
            publicBaseUrl: parsed.FILE_PUBLIC_BASE_URL,
            root: parsed.FILE_LOCAL_ROOT,
          },
    fileUpload: {
      maxBytes: parsed.FILE_UPLOAD_MAX_BYTES,
    },
    localFiles:
      parsed.FILE_STORAGE_DRIVER === SetupFileStorageDriver.Local
        ? {
            root: parsed.FILE_LOCAL_ROOT,
            urlPrefix: getLocalFileUrlPrefix(parsed.FILE_PUBLIC_BASE_URL),
          }
        : undefined,
    authRateLimit: {
      max: parsed.AUTH_RATE_LIMIT_MAX,
      windowMs: parsed.AUTH_RATE_LIMIT_WINDOW_MS,
    },
    globalRateLimit: {
      max: parsed.GLOBAL_RATE_LIMIT_MAX,
      windowMs: parsed.GLOBAL_RATE_LIMIT_WINDOW_MS,
    },
    corsOrigins,
    database,
    logger: {
      targets: logTargets,
      localPath: parsed.LOG_LOCAL_PATH,
      maxPendingWrites: parsed.LOG_PENDING_WRITE_MAX,
      writeTimeoutMs: parsed.LOG_WRITE_TIMEOUT_MS,
      ...(logTargets.includes(SetupLogTarget.Sls)
        ? {
            sls: {
              accessKeyId: parsed.LOG_SLS_ACCESS_KEY_ID!,
              accessKeySecret: parsed.LOG_SLS_ACCESS_KEY_SECRET!,
              endpoint: parsed.LOG_SLS_ENDPOINT!,
              logstore: parsed.LOG_SLS_LOGSTORE!,
              project: parsed.LOG_SLS_PROJECT!,
              source: parsed.LOG_SLS_SOURCE,
              topic: parsed.LOG_SLS_TOPIC,
            },
          }
        : {}),
    },
    requestLogEnabled: parsed.LOG_REQUEST_ENABLED === SetupBoolean.True,
    scheduleEnabled: parsed.SCHEDULER_ENABLED === SetupBoolean.True,
    schedulerLock:
      parsed.SERVER_MULTI_INSTANCE_ENABLED === SetupBoolean.True && parsed.SCHEDULER_ENABLED === SetupBoolean.True
        ? {
            ttlMs: parsed.SCHEDULER_LOCK_TTL_MS,
          }
        : undefined,
    authTokenSecret: parsed.AUTH_TOKEN_SECRET ?? developmentAuthTokenSecret,
    authTokens: {
      accessTokenTtlSeconds: parsed.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: parsed.AUTH_REFRESH_TOKEN_TTL_SECONDS,
    },
    authVerification: {
      challengeTtlMs: parsed.AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS * 1000,
      maxChallengeAttempts: parsed.AUTH_VERIFICATION_MAX_ATTEMPTS,
      sudoTtlMs: parsed.AUTH_VERIFICATION_SUDO_TTL_SECONDS * 1000,
    },
    authCookies: {
      accessTokenName: parsed.AUTH_ACCESS_TOKEN_COOKIE_NAME,
      refreshTokenName: parsed.AUTH_REFRESH_TOKEN_COOKIE_NAME,
      sameSite: parsed.AUTH_COOKIE_SAME_SITE,
      secure: parsed.AUTH_COOKIE_SECURE,
    },
    passkey: {
      rpName: parsed.AUTH_PASSKEY_RP_NAME,
      registrationTtlMs: parsed.AUTH_PASSKEY_REGISTRATION_TTL_SECONDS * 1000,
      operationTimeoutMs: parsed.AUTH_PASSKEY_OPERATION_TIMEOUT_MS,
    },
    totp: {
      issuer: parsed.AUTH_TOTP_ISSUER,
      setupTtlMs: parsed.AUTH_TOTP_SETUP_TTL_SECONDS * 1000,
    },
    email:
      parsed.EMAIL_VERIFICATION_SERVICE === SetupEmailVerificationService.Smtp
        ? {
            codeCooldownMs: parsed.EMAIL_VERIFICATION_CODE_COOLDOWN_MS,
            codeExpiresInMs: parsed.EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS,
            smtpProfiles,
          }
        : undefined,
    sms:
      parsed.SMS_VERIFICATION_SERVICE === SetupSmsVerificationService.Aliyun
        ? {
            aliyunProfiles: smsProfiles,
            codeCooldownMs: parsed.SMS_VERIFICATION_CODE_COOLDOWN_MS,
            codeExpiresInMs: parsed.SMS_VERIFICATION_CODE_EXPIRES_IN_MS,
          }
        : undefined,
    sso:
      parsed.SSO_ENABLED === SetupBoolean.True
        ? {
            profiles: ssoProfiles,
          }
        : undefined,
  } as const;
}

export function getEnvValidationMessage(source: NodeJS.ProcessEnv = process.env) {
  try {
    parseEnvSource(getResolvedEnvironmentSource(source));
  } catch (error) {
    return error instanceof Error ? error.message : 'Configuration could not be loaded.';
  }

  return null;
}

function parseEnvSource(source: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(formatEnvValidationIssues(parsed.error.issues));
  }

  return parsed.data;
}

function formatEnvValidationIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>) {
  return [
    'Invalid environment variables:',
    ...issues.map((issue) => {
      const key = issue.path.map(String).join('.') || 'environment';

      return `- ${key}: ${issue.message}`;
    }),
  ].join('\n');
}

export function getConfigFilePath() {
  return resolve(getRuntimeRootDirectory(), configFileName);
}

export function hasConfigFile() {
  return existsSync(getConfigFilePath());
}

export function loadConfigFileSource(): NodeJS.ProcessEnv {
  const configFilePath = getConfigFilePath();

  if (!existsSync(configFilePath)) {
    return {};
  }

  return parseConfigToml(readFileSync(configFilePath, 'utf8'));
}

export function isSetupLocked() {
  const setupLockedValue = loadConfigFileSource().SETUP_LOCKED?.trim();

  if (setupLockedValue === undefined) {
    return false;
  }

  return setupLockedValue !== SetupBoolean.False;
}

function getResolvedEnvironmentSource(source: NodeJS.ProcessEnv) {
  if (source !== process.env) {
    return source;
  }

  if (!hasConfigFile()) {
    throw new Error(`Missing configuration file: ${getConfigFilePath()}\nComplete setup before starting the backend.`);
  }

  return loadConfigFileSource();
}

function parseConfigToml(source: string): NodeJS.ProcessEnv {
  let parsed: Record<string, unknown>;

  try {
    parsed = parseToml(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid TOML syntax.';

    throw new Error(`Invalid configuration file: ${message}`);
  }

  const environmentSource: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (profileEnvironmentKeySet.has(key)) {
      continue;
    }

    environmentSource[key] = formatConfigEnvironmentValue(key, value);
  }

  for (const key of profileEnvironmentKeys) {
    const profiles = parsed[key];

    if (profiles !== undefined) {
      environmentSource[key] = JSON.stringify(parseConfigProfileTables(key, profiles));
    }
  }

  return environmentSource;
}

function parseConfigProfileTables(key: string, value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid configuration file: ${key} must be a TOML table array.`);
  }

  return value.map((profile, index) => {
    if (!isPlainConfigRecord(profile)) {
      throw new Error(`Invalid configuration file: ${key}[${index}] must be a TOML table.`);
    }

    return Object.fromEntries(
      Object.entries(profile).map(([profileKey, profileValue]) => [
        profileKey,
        normalizeConfigProfileValue(`${key}[${index}].${profileKey}`, profileValue),
      ]),
    );
  });
}

function normalizeConfigProfileValue(key: string, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeConfigProfileArrayValue(`${key}[${index}]`, item));
  }

  if (isConfigScalar(value)) {
    return value;
  }

  throw new Error(`Invalid configuration file: ${key} must be a string, number, boolean, or scalar array.`);
}

function normalizeConfigProfileArrayValue(key: string, value: unknown): unknown {
  if (isConfigScalar(value)) {
    return value;
  }

  throw new Error(`Invalid configuration file: ${key} must be a string, number, or boolean.`);
}

function formatConfigEnvironmentValue(key: string, value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  throw new Error(`Invalid configuration file: ${key} must be a string, number, or boolean.`);
}

function isConfigScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isPlainConfigRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function parseLogTargets(value: string) {
  return parseUniqueSeparatedValues(value, /,/).map((target) => logTargetSchema.parse(target));
}

function parseCommaSeparatedValues(value: string) {
  return parseSeparatedValues(value, /,/);
}

function parseListValues(value: string) {
  return parseUniqueSeparatedValues(value, /[,\n]/);
}

function parseCspResourceOrigins(value: string) {
  const origins = parseListValues(value);

  return origins.includes('*') ? ['*'] : [...new Set(origins.map(normalizeOrigin))];
}

function parseSmtpProfiles(value: string) {
  return parseProfileJsonOrThrow(parseSmtpProfilesResult(value));
}

function parseSmtpProfilesResult(value: string) {
  return parseProfileJsonResult(
    value,
    smtpProfilesSchema,
    'Must be a JSON array containing at least one SMTP profile object',
    'Invalid SMTP profiles',
  );
}

function parseAliyunSmsProfiles(value: string) {
  return parseProfileJsonOrThrow(parseAliyunSmsProfilesResult(value));
}

function parseAliyunSmsProfilesResult(value: string) {
  return parseProfileJsonResult(
    value,
    aliyunSmsProfilesSchema,
    'Must be a JSON array of Aliyun SMS profile objects',
    'Invalid Aliyun SMS profiles',
  );
}

function parseSsoProfiles(value: string) {
  return parseProfileJsonOrThrow(parseSsoProfilesResult(value));
}

function parseSsoProfilesResult(value: string) {
  return parseProfileJsonResult(
    value,
    ssoProfilesSchema,
    'Must be a JSON array of SSO profile objects',
    'Invalid SSO profiles',
  );
}

function parseProfileJsonResult<T>(
  value: string,
  schema: z.ZodType<T>,
  parseFailureMessage: string,
  invalidMessage: string,
) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return {
      success: false as const,
      message: parseFailureMessage,
    };
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.length ? ` at ${issue.path.join('.')}` : '';

    return {
      success: false as const,
      message: `${issue?.message ?? invalidMessage}${path}`,
    };
  }

  return {
    success: true as const,
    profiles: result.data,
  };
}

function parseProfileJsonOrThrow<T>(result: ReturnType<typeof parseProfileJsonResult<T>>) {
  if (!result.success) {
    throw new Error(result.message);
  }

  return result.profiles;
}

function validateSsoProfileUrls(
  profiles: Array<z.infer<typeof ssoProfileSchema>>,
  nodeEnv: string,
  ctx: z.RefinementCtx,
) {
  for (const [index, profile] of profiles.entries()) {
    const fields = ['frontendCallbackUrl', 'redirectUri'];

    if (profile.iconUrl) {
      fields.push('iconUrl');
    }

    if (profile.protocol === SetupSsoProtocol.Oidc) {
      fields.push('issuerUrl');
    } else {
      fields.push('authorizationUrl', 'tokenUrl', 'userInfoUrl');
    }

    for (const field of fields) {
      const value = (profile as Record<string, unknown>)[field];

      if (typeof value !== 'string') {
        continue;
      }

      if (!hasUrlProtocol(value, ['http:', 'https:'])) {
        ctx.addIssue({
          code: 'custom',
          path: ['SSO_PROFILES', index, field],
          message: 'Must use http:// or https://',
        });
      }

      if (nodeEnv === 'production' && !hasUrlProtocol(value, ['https:'])) {
        ctx.addIssue({
          code: 'custom',
          path: ['SSO_PROFILES', index, field],
          message: 'Must use https when NODE_ENV is production',
        });
      }
    }
  }
}

function isRedisUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
      return false;
    }

    if (!url.pathname || url.pathname === '/') {
      return true;
    }

    const database = Number(url.pathname.slice(1));

    return Number.isInteger(database) && database >= 0;
  } catch {
    return false;
  }
}

function isPublicBaseUrl(value: string) {
  if (value.startsWith('/')) {
    return isSafeRelativePath(value);
  }

  try {
    const url = new URL(value);

    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function hasUrlProtocol(value: string, allowedProtocols: string[]) {
  try {
    const url = new URL(value);

    return allowedProtocols.includes(url.protocol);
  } catch {
    return false;
  }
}

function isHttpOrigin(value: string) {
  try {
    const url = new URL(value);

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string) {
  return new URL(value).origin;
}

function getLocalFileUrlPrefix(publicBaseUrl: string) {
  const path = publicBaseUrl.startsWith('/') ? publicBaseUrl : new URL(publicBaseUrl).pathname;

  return path.replace(/\/+$/, '') || '/';
}
