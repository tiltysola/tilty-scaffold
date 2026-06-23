import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

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
  MULTI_INSTANCE_ENABLED: 'true',
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
    expect(env.authCookies).toEqual({
      accessTokenName: 'tilty_scaffold_access_token',
      refreshTokenName: 'tilty_scaffold_refresh_token',
      sameSite: 'lax',
      secure: 'auto',
    });
    expect(env.cache).toEqual({
      store: 'memory',
    });
    expect(env.fileStorage).toEqual({
      driver: 'local',
      publicBaseUrl: '/uploads',
      root: './data/uploads',
    });
    expect(env.fileUpload).toEqual({
      maxBytes: 2 * 1024 * 1024,
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

  it('rejects sync modes other than off in production', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      DATABASE_SYNC: 'alter',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('DATABASE_SYNC');
  });

  it('rejects wildcard CORS origins in production', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      CORS_ORIGINS: '*',
      DATABASE_DIALECT: 'sqlite',
      DATABASE_SYNC: 'off',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('CORS_ORIGINS');
  });

  it('requires a local environment file for process environment validation', async () => {
    const originalCwd = process.cwd();
    const originalEnv = process.env;
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-env-'));

    try {
      process.chdir(temporaryRoot);
      process.env = {
        AUTH_COOKIE_SECURE: 'true',
        AUTH_TOKEN_SECRET: authTokenSecret,
        CORS_ORIGINS: 'https://app.example.com',
        DATABASE_DIALECT: 'sqlite',
        DATABASE_SYNC: 'off',
        NODE_ENV: 'production',
      };

      expect(getEnvValidationMessage()).toContain('Missing environment file');
    } finally {
      process.env = originalEnv;
      process.chdir(originalCwd);
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('loads configurable authentication token and cookie settings', () => {
    const env = loadEnv({
      AUTH_ACCESS_TOKEN_COOKIE_NAME: '__Host-tilty_access',
      AUTH_ACCESS_TOKEN_TTL_SECONDS: '600',
      AUTH_COOKIE_SAME_SITE: 'strict',
      AUTH_COOKIE_SECURE: 'true',
      AUTH_REFRESH_TOKEN_COOKIE_NAME: '__Host-tilty_refresh',
      AUTH_REFRESH_TOKEN_TTL_SECONDS: '1209600',
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
    } as NodeJS.ProcessEnv);

    expect(env.authTokens).toEqual({
      accessTokenTtlSeconds: 600,
      refreshTokenTtlSeconds: 1_209_600,
    });
    expect(env.authCookies).toEqual({
      accessTokenName: '__Host-tilty_access',
      refreshTokenName: '__Host-tilty_refresh',
      sameSite: 'strict',
      secure: 'true',
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
      CORS_ORIGINS: 'https://app.example.com',
      DATABASE_DIALECT: 'sqlite',
      DATABASE_SYNC: 'off',
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
      DATABASE_SYNC: 'off',
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

  it('requires SMTP settings when email service uses SMTP', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      EMAIL_VERIFICATION_SERVICE: 'smtp',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('SMTP_HOST');
    expect(message).toContain('SMTP_FROM');
  });

  it('loads SMTP email configuration', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      EMAIL_VERIFICATION_SERVICE: 'smtp',
      EMAIL_VERIFICATION_CODE_COOLDOWN_MS: '30000',
      EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: '300000',
      SMTP_FROM: 'Tilty <noreply@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PASSWORD: 'smtp-password',
      SMTP_REQUEST_TIMEOUT_MS: '5000',
      SMTP_USERNAME: 'smtp-user',
    } as NodeJS.ProcessEnv);

    expect(env.email).toEqual({
      codeCooldownMs: 30_000,
      codeExpiresInMs: 300_000,
      smtp: {
        from: 'Tilty <noreply@example.com>',
        host: 'smtp.example.com',
        password: 'smtp-password',
        port: 465,
        secure: true,
        startTls: false,
        timeoutMs: 5_000,
        username: 'smtp-user',
      },
    });
  });

  it('requires TLS for SMTP in production', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      DATABASE_SYNC: 'off',
      EMAIL_VERIFICATION_SERVICE: 'smtp',
      NODE_ENV: 'production',
      SMTP_FROM: 'Tilty <noreply@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_SECURE: 'false',
      SMTP_STARTTLS: 'false',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('SMTP_SECURE');
  });

  it('requires OIDC SSO settings when SSO is enabled', () => {
    const message = getEnvValidationMessage({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      SSO_ENABLED: 'true',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('SSO_ISSUER_URL');
    expect(message).toContain('SSO_CLIENT_ID');
    expect(message).toContain('SSO_CLIENT_SECRET');
    expect(message).toContain('SSO_REDIRECT_URI');
  });

  it('requires HTTPS OIDC SSO URLs in production', () => {
    const message = getEnvValidationMessage({
      AUTH_COOKIE_SECURE: 'true',
      AUTH_TOKEN_SECRET: authTokenSecret,
      CORS_ORIGINS: 'https://app.example.com',
      DATABASE_DIALECT: 'sqlite',
      DATABASE_SYNC: 'off',
      NODE_ENV: 'production',
      SSO_CLIENT_ID: 'test-client',
      SSO_CLIENT_SECRET: 'test-secret',
      SSO_ENABLED: 'true',
      SSO_FRONTEND_CALLBACK_URL: 'http://app.example.com/login',
      SSO_ISSUER_URL: 'http://identity.example.com',
      SSO_REDIRECT_URI: 'http://api.example.com/api/auth/sso/callback',
    } as NodeJS.ProcessEnv);

    expect(message).toContain('SSO_FRONTEND_CALLBACK_URL');
    expect(message).toContain('SSO_ISSUER_URL');
    expect(message).toContain('SSO_REDIRECT_URI');
  });

  it('loads OIDC SSO configuration and normalizes issuer trailing slashes', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_DIALECT: 'sqlite',
      SSO_CLIENT_ID: 'test-client',
      SSO_CLIENT_SECRET: 'test-secret',
      SSO_ENABLED: 'true',
      SSO_FRONTEND_CALLBACK_URL: 'http://localhost:8011/login',
      SSO_ISSUER_URL: 'https://identity.example.com/',
      SSO_REDIRECT_URI: 'http://localhost:3000/api/auth/sso/callback',
      SSO_SCOPES: 'openid profile email email',
    } as NodeJS.ProcessEnv);

    expect(env.sso).toEqual({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      frontendCallbackUrl: 'http://localhost:8011/login',
      issuerUrl: 'https://identity.example.com',
      redirectUri: 'http://localhost:3000/api/auth/sso/callback',
      requestTimeoutMs: 10_000,
      scopes: ['openid', 'profile', 'email'],
    });
  });
});
