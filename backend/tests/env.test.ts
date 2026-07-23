import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { defaultFileUploadMaxBytes } from '@tilty/shared/setup';

import { getEnvValidationMessage, loadEnv } from '../src/config/env';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';
const validMultiInstanceEnv = {
  AUTH_TOKEN_SECRET: authTokenSecret,
  CACHE_REDIS_URL: 'redis://localhost:6379/0',
  CACHE_STORE: 'redis',
  DATABASE_DIALECT: 'postgres',
  DATABASE_URL: 'postgres://postgres:password@localhost:5432/app',
  FILE_OSS_ACCESS_KEY_ID: 'test-access-key-id',
  FILE_OSS_ACCESS_KEY_SECRET: 'test-access-key-secret',
  FILE_OSS_BUCKET: 'tilty-scaffold',
  FILE_OSS_ENDPOINT: 'oss-cn-hangzhou.aliyuncs.com',
  FILE_OSS_REGION: 'oss-cn-hangzhou',
  FILE_STORAGE_DRIVER: 'oss',
  SERVER_MULTI_INSTANCE_ENABLED: 'true',
  SCHEDULER_ENABLED: 'false',
} as const;

describe('environment configuration', () => {
  it('loads sqlite configuration by default', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_STORAGE: ':memory:',
    } as NodeJS.ProcessEnv);

    expect(env.database).toEqual({
      dialect: 'sqlite',
      storage: ':memory:',
    });
    expect(env.authRateLimit).toEqual({
      max: 10,
      windowMs: 60_000,
    });
    expect(env.globalRateLimit).toEqual({
      max: 1000,
      windowMs: 60_000,
    });
    expect(env.authTokens).toEqual({
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
    });
    expect(env.authVerification).toEqual({
      challengeTtlMs: 300_000,
      maxChallengeAttempts: 5,
      sudoTtlMs: 900_000,
    });
    expect(env.authCookies).toEqual({
      accessTokenName: 'tilty_scaffold_access_token',
      refreshTokenName: 'tilty_scaffold_refresh_token',
      sameSite: 'lax',
      secure: 'auto',
    });
    expect(env.appDomain).toBe('http://localhost:8011');
    expect(env.cspResourceOrigins).toEqual(['*']);
    expect(env.cache).toEqual({
      store: 'memory',
    });
    expect(env.fileStorage).toEqual({
      driver: 'local',
      publicBaseUrl: '/uploads',
      root: './data/uploads',
    });
    expect(env.fileUpload).toEqual({
      maxBytes: defaultFileUploadMaxBytes,
    });
    expect(env.passkey).toEqual({
      rpName: 'Tilty Scaffold',
      registrationTtlMs: 300_000,
      operationTimeoutMs: 60_000,
    });
    expect(env.totp).toEqual({
      issuer: 'Tilty Scaffold',
      setupTtlMs: 600_000,
    });
    expect(env.corsOrigins).toEqual(['http://localhost:8011']);
    expect(env.logger).toEqual({
      localPath: './logs/backend.log',
      maxPendingWrites: 1000,
      targets: ['console'],
      writeTimeoutMs: 5000,
    });
    expect(env.email).toBeUndefined();
    expect(env.requestLogEnabled).toBe(true);
    expect(env.multiInstanceEnabled).toBe(false);
    expect(env.scheduleEnabled).toBe(true);
    expect(env.schedulerLock).toBeUndefined();
    expect(env.sso).toBeUndefined();
    expect(env.trustProxy).toBe(false);
  });

  it('requires DATABASE_URL for mysql and postgres', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'mysql',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('DATABASE_URL');
  });

  it('loads database production connection options', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_CONNECT_TIMEOUT_MS: '5000',
      DATABASE_DIALECT: 'postgres',
      DATABASE_POOL_ACQUIRE_MS: '15000',
      DATABASE_POOL_IDLE_MS: '7000',
      DATABASE_POOL_MAX: '20',
      DATABASE_POOL_MIN: '2',
      DATABASE_SSL: 'true',
      DATABASE_URL: 'postgres://postgres:password@localhost:5432/app',
    } as NodeJS.ProcessEnv);

    expect(env.database).toEqual({
      connectTimeoutMs: 5000,
      dialect: 'postgres',
      pool: {
        acquire: 15_000,
        idle: 7000,
        max: 20,
        min: 2,
      },
      ssl: true,
      url: 'postgres://postgres:password@localhost:5432/app',
    });
  });

  it('rejects invalid database pool ranges', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'postgres',
      DATABASE_POOL_MAX: '2',
      DATABASE_POOL_MIN: '3',
      DATABASE_URL: 'postgres://postgres:password@localhost:5432/app',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('DATABASE_POOL_MIN');
  });

  it('rejects wildcard CORS origins in production', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      APP_CORS_ORIGINS: '*',
      DATABASE_DIALECT: 'sqlite',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('APP_CORS_ORIGINS');
  });

  it('defaults CORS origins from the application domain', () => {
    const env = loadEnv({
      APP_DOMAIN: 'https://app.example.com',
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(env.appDomain).toBe('https://app.example.com');
    expect(env.corsOrigins).toEqual(['https://app.example.com']);
  });

  it('loads unique normalized CSP resource origins', () => {
    const env = loadEnv({
      APP_CSP_RESOURCE_ORIGINS: 'https://cdn.example.com/, https://fonts.example.com\nhttps://cdn.example.com',
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(env.cspResourceOrigins).toEqual(['https://cdn.example.com', 'https://fonts.example.com']);
  });

  it('rejects invalid CSP resource origins', () => {
    const message = getEnvValidationMessage({
      APP_CSP_RESOURCE_ORIGINS: 'https://cdn.example.com/assets; script-src *',
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('APP_CSP_RESOURCE_ORIGINS');
  });

  it('requires a local configuration file for process environment validation', async () => {
    const originalCwd = process.cwd();
    const originalEnv = process.env;
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-env-'));

    try {
      process.chdir(temporaryRoot);
      process.env = {
        AUTH_COOKIE_SECURE: 'true',
        AUTH_TOKEN_SECRET: authTokenSecret,
        APP_CORS_ORIGINS: 'https://app.example.com',
        DATABASE_DIALECT: 'sqlite',
        NODE_ENV: 'production',
      };

      expect(getEnvValidationMessage()).toContain('Missing configuration file');
    } finally {
      process.env = originalEnv;
      process.chdir(originalCwd);
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('loads local TOML configuration with profile tables for process environment validation', async () => {
    const originalCwd = process.cwd();
    const originalEnv = process.env;
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-env-'));

    try {
      process.chdir(temporaryRoot);
      process.env = {};
      await writeFile(
        'config.toml',
        [
          'SETUP_LOCKED = true',
          `AUTH_TOKEN_SECRET = "${authTokenSecret}"`,
          'DATABASE_DIALECT = "sqlite"',
          'DATABASE_STORAGE = ":memory:"',
          'EMAIL_VERIFICATION_SERVICE = "smtp"',
          'EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS = "300000"',
          'EMAIL_VERIFICATION_CODE_COOLDOWN_MS = "30000"',
          'SMS_VERIFICATION_SERVICE = "aliyun"',
          'SMS_VERIFICATION_CODE_EXPIRES_IN_MS = "300000"',
          'SMS_VERIFICATION_CODE_COOLDOWN_MS = "30000"',
          'SSO_ENABLED = "true"',
          '',
          '[[EMAIL_SMTP_PROFILES]]',
          'from = "Tilty <noreply@example.com>"',
          'host = "smtp.example.com"',
          'password = "smtp-password"',
          'port = 465',
          'secure = true',
          'startTls = false',
          'timeoutMs = 10000',
          'username = "smtp-user"',
          '',
          '[[SMS_ALICLOUD_PROFILES]]',
          'phoneCountryCode = "+86"',
          'apiVersion = "2017-05-25"',
          'operation = "SendSms"',
          'regionId = "cn-hangzhou"',
          'endpoint = "dysmsapi.aliyuncs.com"',
          'accessKeyId = "sms-access-key-id"',
          'accessKeySecret = "sms-access-key-secret"',
          'signName = "Tilty"',
          'templateCode = "SMS_100000001"',
          '',
          '[[SSO_PROFILES]]',
          'id = "corporate"',
          'name = "Corporate"',
          'protocol = "oidc"',
          'loginEnabled = true',
          'bindingEnabled = true',
          'clientId = "sso-client-id"',
          'clientSecret = "sso-client-secret"',
          'frontendCallbackUrl = "http://localhost:8011/auth/sso/callback"',
          'redirectUri = "http://localhost:3000/api/auth/sso/callback"',
          'requestTimeoutMs = 10000',
          'scopes = ["openid", "email", "profile"]',
          'issuerUrl = "https://idp.example.com"',
          '',
        ].join('\n'),
        'utf8',
      );

      expect(getEnvValidationMessage()).toBeNull();

      const env = loadEnv();

      expect(env.email?.smtpProfiles).toHaveLength(1);
      expect(env.sms?.aliyunProfiles).toHaveLength(1);
      expect(env.sso?.profiles).toHaveLength(1);
    } finally {
      process.env = originalEnv;
      process.chdir(originalCwd);
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('does not let process environment values override local TOML configuration', async () => {
    const originalCwd = process.cwd();
    const originalEnv = process.env;
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-env-'));

    try {
      process.chdir(temporaryRoot);
      process.env = {
        DATABASE_STORAGE: './stale-env.sqlite',
        EMAIL_SMTP_PROFILES: 'stale-env-value',
        SMS_ALICLOUD_PROFILES: 'stale-env-value',
        SSO_PROFILES: 'stale-env-value',
      };
      await writeFile(
        'config.toml',
        [
          'SETUP_LOCKED = true',
          `AUTH_TOKEN_SECRET = "${authTokenSecret}"`,
          'DATABASE_DIALECT = "sqlite"',
          'DATABASE_STORAGE = ":memory:"',
          'EMAIL_VERIFICATION_SERVICE = "off"',
          'SMS_VERIFICATION_SERVICE = "off"',
          'SSO_ENABLED = "false"',
          '',
        ].join('\n'),
        'utf8',
      );

      expect(getEnvValidationMessage()).toBeNull();
      expect(loadEnv().database).toEqual({
        dialect: 'sqlite',
        storage: ':memory:',
      });
    } finally {
      process.env = originalEnv;
      process.chdir(originalCwd);
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('loads the documented TOML configuration example', async () => {
    const originalCwd = process.cwd();
    const originalEnv = process.env;
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-env-'));

    try {
      const example = await readFile(join(originalCwd, '..', 'config.toml.example'), 'utf8');

      process.chdir(temporaryRoot);
      process.env = {};
      await writeFile('config.toml', example, 'utf8');

      expect(getEnvValidationMessage()).toBeNull();
      expect(() => loadEnv()).not.toThrow();
    } finally {
      process.env = originalEnv;
      process.chdir(originalCwd);
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('loads configurable authentication settings', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      AUTH_ACCESS_TOKEN_TTL_SECONDS: '600',
      AUTH_REFRESH_TOKEN_TTL_SECONDS: '1209600',
      AUTH_VERIFICATION_CHALLENGE_TTL_SECONDS: '180',
      AUTH_VERIFICATION_MAX_ATTEMPTS: '3',
      AUTH_VERIFICATION_SUDO_TTL_SECONDS: '600',
      AUTH_PASSKEY_RP_NAME: 'Example App',
      AUTH_PASSKEY_REGISTRATION_TTL_SECONDS: '240',
      AUTH_PASSKEY_OPERATION_TIMEOUT_MS: '45000',
      AUTH_TOTP_ISSUER: 'Example App',
      AUTH_TOTP_SETUP_TTL_SECONDS: '480',
      AUTH_ACCESS_TOKEN_COOKIE_NAME: '__Host-tilty_access',
      AUTH_REFRESH_TOKEN_COOKIE_NAME: '__Host-tilty_refresh',
      AUTH_COOKIE_SAME_SITE: 'strict',
      AUTH_COOKIE_SECURE: 'true',
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(env.authTokens).toEqual({
      accessTokenTtlSeconds: 600,
      refreshTokenTtlSeconds: 1_209_600,
    });
    expect(env.authVerification).toEqual({
      challengeTtlMs: 180_000,
      maxChallengeAttempts: 3,
      sudoTtlMs: 600_000,
    });
    expect(env.authCookies).toEqual({
      accessTokenName: '__Host-tilty_access',
      refreshTokenName: '__Host-tilty_refresh',
      sameSite: 'strict',
      secure: 'true',
    });
    expect(env.passkey).toEqual({
      rpName: 'Example App',
      registrationTtlMs: 240_000,
      operationTimeoutMs: 45_000,
    });
    expect(env.totp).toEqual({
      issuer: 'Example App',
      setupTtlMs: 480_000,
    });
  });

  it('loads configurable global rate limit settings', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      GLOBAL_RATE_LIMIT_MAX: '250',
      GLOBAL_RATE_LIMIT_WINDOW_MS: '30000',
    } as NodeJS.ProcessEnv);

    expect(env.globalRateLimit).toEqual({
      max: 250,
      windowMs: 30_000,
    });
  });

  it('rejects invalid authentication token and cookie settings', () => {
    const message = getEnvValidationMessage({
      AUTH_ACCESS_TOKEN_COOKIE_NAME: 'tilty_token',
      AUTH_ACCESS_TOKEN_TTL_SECONDS: '3600',
      AUTH_COOKIE_SAME_SITE: 'none',
      AUTH_COOKIE_SECURE: 'auto',
      AUTH_REFRESH_TOKEN_COOKIE_NAME: 'tilty_token',
      AUTH_REFRESH_TOKEN_TTL_SECONDS: '3600',
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('AUTH_REFRESH_TOKEN_TTL_SECONDS');
    expect(message).toContain('AUTH_REFRESH_TOKEN_COOKIE_NAME');
    expect(message).toContain('AUTH_COOKIE_SECURE');
  });

  it('requires secure authentication cookies in production', () => {
    const message = getEnvValidationMessage({
      AUTH_COOKIE_SECURE: 'auto',
      AUTH_TOKEN_SECRET: authTokenSecret,
      APP_CORS_ORIGINS: 'https://app.example.com',
      DATABASE_DIALECT: 'sqlite',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('AUTH_COOKIE_SECURE');
  });

  it('requires Aliyun SLS settings when SLS logging is enabled', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      LOG_TARGETS: 'console,sls',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('LOG_SLS_ENDPOINT');
    expect(message).toContain('LOG_SLS_PROJECT');
    expect(message).toContain('LOG_SLS_LOGSTORE');
  });

  it('requires a Redis URL when Redis cache storage is enabled', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      CACHE_STORE: 'redis',
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('CACHE_REDIS_URL');
  });

  it('requires Redis cache storage for multi-instance deployments', () => {
    const message = getEnvValidationMessage({
      ...validMultiInstanceEnv,
      CACHE_STORE: 'memory',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('CACHE_STORE');
  });

  it('loads Redis-backed scheduler lock settings for multi-instance scheduler processes', () => {
    const env = loadEnv({
      ...validMultiInstanceEnv,
      SCHEDULER_ENABLED: 'true',
      SCHEDULER_LOCK_TTL_MS: '120000',
    } as NodeJS.ProcessEnv);

    expect(env.scheduleEnabled).toBe(true);
    expect(env.schedulerLock).toEqual({
      ttlMs: 120_000,
    });
  });

  it('rejects invalid scheduler lock TTL settings', () => {
    const message = getEnvValidationMessage({
      ...validMultiInstanceEnv,
      SCHEDULER_ENABLED: 'true',
      SCHEDULER_LOCK_TTL_MS: '999',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('SCHEDULER_LOCK_TTL_MS');
  });

  it('rejects SQLite for multi-instance deployments', () => {
    const message = getEnvValidationMessage({
      ...validMultiInstanceEnv,
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('DATABASE_DIALECT');
  });

  it('rejects local file storage for multi-instance deployments', () => {
    const message = getEnvValidationMessage({
      ...validMultiInstanceEnv,
      FILE_STORAGE_DRIVER: 'local',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('FILE_STORAGE_DRIVER');
  });

  it('loads valid multi-instance configuration', () => {
    const env = loadEnv(validMultiInstanceEnv as NodeJS.ProcessEnv);

    expect(env.multiInstanceEnabled).toBe(true);
    expect(env.cache.store).toBe('redis');
    expect(env.database.dialect).toBe('postgres');
    expect(env.fileStorage.driver).toBe('oss');
    expect(env.scheduleEnabled).toBe(false);
    expect(env.schedulerLock).toBeUndefined();
  });

  it('loads Redis cache configuration', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      CACHE_REDIS_URL: 'redis://localhost:6379/0',
      CACHE_STORE: 'redis',
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(env.cache).toEqual({
      store: 'redis',
      timeoutMs: 10_000,
      url: 'redis://localhost:6379/0',
    });
  });

  it('loads Redis request timeout configuration', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      CACHE_REDIS_REQUEST_TIMEOUT_MS: '2500',
      CACHE_REDIS_URL: 'rediss://localhost:6380/1',
      CACHE_STORE: 'redis',
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(env.cache).toEqual({
      store: 'redis',
      timeoutMs: 2500,
      url: 'rediss://localhost:6380/1',
    });
  });

  it('rejects invalid Redis database paths', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      CACHE_REDIS_URL: 'redis://localhost:6379/not-a-number',
      CACHE_STORE: 'redis',
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('CACHE_REDIS_URL');
  });

  it('requires Aliyun OSS settings when OSS file storage is enabled', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      FILE_STORAGE_DRIVER: 'oss',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('FILE_OSS_ACCESS_KEY_ID');
    expect(message).toContain('FILE_OSS_ACCESS_KEY_SECRET');
    expect(message).toContain('FILE_OSS_BUCKET');
    expect(message).toContain('FILE_OSS_ENDPOINT');
    expect(message).toContain('FILE_OSS_REGION');
  });

  it('loads Aliyun OSS file storage configuration', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      FILE_OSS_ACCESS_KEY_ID: 'test-access-key-id',
      FILE_OSS_ACCESS_KEY_SECRET: 'test-access-key-secret',
      FILE_OSS_BUCKET: 'tilty-scaffold',
      FILE_OSS_ENDPOINT: 'oss-cn-hangzhou.aliyuncs.com',
      FILE_OSS_PUBLIC_BASE_URL: 'https://cdn.example.com',
      FILE_OSS_REGION: 'oss-cn-hangzhou',
      FILE_STORAGE_DRIVER: 'oss',
      FILE_UPLOAD_MAX_BYTES: '1048576',
    } as NodeJS.ProcessEnv);

    expect(env.fileStorage).toEqual({
      accessKeyId: 'test-access-key-id',
      accessKeySecret: 'test-access-key-secret',
      bucket: 'tilty-scaffold',
      driver: 'oss',
      endpoint: 'oss-cn-hangzhou.aliyuncs.com',
      publicBaseUrl: 'https://cdn.example.com',
      region: 'oss-cn-hangzhou',
    });
    expect(env.fileUpload).toEqual({
      maxBytes: 1_048_576,
    });
  });

  it('rejects invalid OSS public URL configuration', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      FILE_OSS_ACCESS_KEY_ID: 'test-access-key-id',
      FILE_OSS_ACCESS_KEY_SECRET: 'test-access-key-secret',
      FILE_OSS_BUCKET: 'tilty-scaffold',
      FILE_OSS_ENDPOINT: 'oss-cn-hangzhou.aliyuncs.com',
      FILE_OSS_PUBLIC_BASE_URL: 'cdn.example.com',
      FILE_OSS_REGION: 'oss-cn-hangzhou',
      FILE_STORAGE_DRIVER: 'oss',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('FILE_OSS_PUBLIC_BASE_URL');
  });

  it('rejects protocol-relative public file URLs', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      FILE_PUBLIC_BASE_URL: '//assets.example.com/uploads',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('FILE_PUBLIC_BASE_URL');
  });

  it('requires HTTPS public file URLs in production', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      FILE_PUBLIC_BASE_URL: 'http://assets.example.com/uploads',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('FILE_PUBLIC_BASE_URL');
  });

  it('loads local and Aliyun SLS logger configuration', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_STORAGE: ':memory:',
      LOG_LOCAL_PATH: './logs/app.log',
      LOG_PENDING_WRITE_MAX: '250',
      LOG_SLS_ACCESS_KEY_ID: 'test-access-key-id',
      LOG_SLS_ACCESS_KEY_SECRET: 'test-access-key-secret',
      LOG_SLS_ENDPOINT: 'cn-hangzhou.log.aliyuncs.com',
      LOG_SLS_LOGSTORE: 'backend',
      LOG_SLS_PROJECT: 'tilty-scaffold',
      LOG_TARGETS: 'console,local,sls',
      LOG_WRITE_TIMEOUT_MS: '1500',
    } as NodeJS.ProcessEnv);

    expect(env.logger).toEqual({
      localPath: './logs/app.log',
      maxPendingWrites: 250,
      sls: {
        accessKeyId: 'test-access-key-id',
        accessKeySecret: 'test-access-key-secret',
        endpoint: 'cn-hangzhou.log.aliyuncs.com',
        logstore: 'backend',
        project: 'tilty-scaffold',
        source: 'backend',
        topic: 'tilty-scaffold',
      },
      targets: ['console', 'local', 'sls'],
      writeTimeoutMs: 1500,
    });
  });

  it('requires SMTP profiles when email service uses SMTP', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      EMAIL_VERIFICATION_SERVICE: 'smtp',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('EMAIL_SMTP_PROFILES');
  });

  it('loads SMTP email profile configuration', () => {
    const profiles = [
      {
        from: 'Tilty <noreply@example.com>',
        host: 'smtp.example.com',
        password: 'smtp-password',
        port: 465,
        secure: true,
        startTls: false,
        timeoutMs: 5_000,
        username: 'smtp-user',
      },
      {
        from: 'Tilty Backup <backup@example.com>',
        host: 'smtp-backup.example.com',
        port: 587,
        secure: false,
        startTls: true,
        timeoutMs: 10_000,
      },
    ];
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      EMAIL_VERIFICATION_SERVICE: 'smtp',
      EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: '300000',
      EMAIL_VERIFICATION_CODE_COOLDOWN_MS: '30000',
      EMAIL_SMTP_PROFILES: JSON.stringify(profiles),
    } as NodeJS.ProcessEnv);

    expect(env.email).toEqual({
      codeCooldownMs: 30_000,
      codeExpiresInMs: 300_000,
      smtpProfiles: profiles,
    });
  });

  it('requires at least one SMTP profile when email service uses SMTP', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      EMAIL_VERIFICATION_SERVICE: 'smtp',
      EMAIL_SMTP_PROFILES: '[]',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('EMAIL_SMTP_PROFILES');
  });

  it('requires valid Aliyun SMS profiles when SMS verification is enabled', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      SMS_VERIFICATION_SERVICE: 'aliyun',
      SMS_ALICLOUD_PROFILES: '[]',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('SMS_ALICLOUD_PROFILES');
  });

  it('loads Aliyun SMS profile configuration', () => {
    const profiles = [
      {
        phoneCountryCode: '+86',
        apiVersion: '2017-05-25',
        operation: 'SendSms',
        regionId: 'cn-hangzhou',
        endpoint: 'dysmsapi.aliyuncs.com',
        accessKeyId: 'domestic-access-key-id',
        accessKeySecret: 'domestic-access-key-secret',
        signName: 'Tilty',
        templateCode: 'SMS_100000001',
      },
      {
        phoneCountryCode: '+852',
        apiVersion: '2018-05-01',
        operation: 'SendMessageToGlobe',
        regionId: 'ap-southeast-1',
        endpoint: 'dysmsapi.ap-southeast-1.aliyuncs.com',
        accessKeyId: 'overseas-access-key-id',
        accessKeySecret: 'overseas-access-key-secret',
        messageTemplate: 'Your verification code is ${code}.',
        senderId: 'Tilty',
        type: 'OTP',
      },
    ];
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      SMS_VERIFICATION_SERVICE: 'aliyun',
      SMS_VERIFICATION_CODE_EXPIRES_IN_MS: '300000',
      SMS_VERIFICATION_CODE_COOLDOWN_MS: '30000',
      SMS_ALICLOUD_PROFILES: JSON.stringify(profiles),
    } as NodeJS.ProcessEnv);

    expect(env.sms).toEqual({
      aliyunProfiles: profiles,
      codeCooldownMs: 30_000,
      codeExpiresInMs: 300_000,
    });
  });

  it('requires TLS for SMTP in production', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      EMAIL_VERIFICATION_SERVICE: 'smtp',
      NODE_ENV: 'production',
      EMAIL_SMTP_PROFILES: JSON.stringify([
        {
          from: 'Tilty <noreply@example.com>',
          host: 'smtp.example.com',
          port: 25,
          secure: false,
          startTls: false,
          timeoutMs: 5_000,
        },
      ]),
    } as NodeJS.ProcessEnv);

    expect(message).toContain('EMAIL_SMTP_PROFILES');
  });

  it('requires SSO profiles when SSO is enabled', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      SSO_ENABLED: 'true',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('SSO_PROFILES');
  });

  it('requires HTTPS OIDC SSO URLs in production', () => {
    const message = getEnvValidationMessage({
      AUTH_COOKIE_SECURE: 'true',
      AUTH_TOKEN_SECRET: authTokenSecret,
      APP_CORS_ORIGINS: 'https://app.example.com',
      DATABASE_DIALECT: 'sqlite',
      NODE_ENV: 'production',
      SSO_ENABLED: 'true',
      SSO_PROFILES: JSON.stringify([
        {
          id: 'corporate',
          name: 'Corporate SSO',
          protocol: 'oidc',
          loginEnabled: true,
          bindingEnabled: true,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          frontendCallbackUrl: 'http://app.example.com/login',
          issuerUrl: 'http://identity.example.com',
          redirectUri: 'http://api.example.com/api/auth/sso/callback',
          requestTimeoutMs: 10_000,
          scopes: ['openid', 'profile', 'email'],
        },
      ]),
    } as NodeJS.ProcessEnv);

    expect(message).toContain('SSO_PROFILES.0.frontendCallbackUrl');
    expect(message).toContain('SSO_PROFILES.0.issuerUrl');
    expect(message).toContain('SSO_PROFILES.0.redirectUri');
  });

  it('loads SSO profile configuration and normalizes issuer trailing slashes', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      SSO_ENABLED: 'true',
      SSO_PROFILES: JSON.stringify([
        {
          id: 'corporate',
          name: 'Corporate SSO',
          protocol: 'oidc',
          loginEnabled: true,
          bindingEnabled: true,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          frontendCallbackUrl: 'http://localhost:8011/login',
          issuerUrl: 'https://identity.example.com/',
          redirectUri: 'http://localhost:3000/api/auth/sso/callback',
          requestTimeoutMs: 10_000,
          scopes: ['openid', 'profile', 'email'],
        },
      ]),
    } as NodeJS.ProcessEnv);

    expect(env.sso).toEqual({
      profiles: [
        {
          id: 'corporate',
          name: 'Corporate SSO',
          protocol: 'oidc',
          loginEnabled: true,
          bindingEnabled: true,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          frontendCallbackUrl: 'http://localhost:8011/login',
          issuerUrl: 'https://identity.example.com',
          redirectUri: 'http://localhost:3000/api/auth/sso/callback',
          requestTimeoutMs: 10_000,
          scopes: ['openid', 'profile', 'email'],
        },
      ],
    });
  });
});
