import { describe, expect, it } from 'vitest';

import { getEnvValidationMessage, loadEnv } from '../src/config/env';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';

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
    expect(env.corsOrigins).toEqual(['http://localhost:8011']);
    expect(env.logger).toEqual({
      localPath: './logs/backend.log',
      targets: ['console'],
    });
    expect(env.email).toBeUndefined();
    expect(env.requestLogEnabled).toBe(true);
    expect(env.scheduleEnabled).toBe(true);
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

  it('loads local and Aliyun SLS logger configuration', () => {
    const env = loadEnv({
      AUTH_TOKEN_SECRET: authTokenSecret,
      DATABASE_STORAGE: ':memory:',
      LOG_LOCAL_PATH: './logs/app.log',
      LOG_SLS_ACCESS_KEY_ID: 'test-access-key-id',
      LOG_SLS_ACCESS_KEY_SECRET: 'test-access-key-secret',
      LOG_SLS_ENDPOINT: 'cn-hangzhou.log.aliyuncs.com',
      LOG_SLS_LOGSTORE: 'backend',
      LOG_SLS_PROJECT: 'tilty-scaffold',
      LOG_TARGETS: 'console,local,sls',
    } as NodeJS.ProcessEnv);

    expect(env.logger).toEqual({
      localPath: './logs/app.log',
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

  it('loads OIDC SSO configuration', () => {
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
      issuerUrl: 'https://identity.example.com/',
      redirectUri: 'http://localhost:3000/api/auth/sso/callback',
      requestTimeoutMs: 10_000,
      scopes: ['openid', 'profile', 'email'],
    });
  });
});
