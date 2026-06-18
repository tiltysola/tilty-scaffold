import { existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

import { isSafeRelativePath } from '@tilty/shared/paths';

import 'dotenv/config';

const databaseDialectSchema = z.enum(['postgres', 'mysql', 'sqlite']);
const cacheStoreSchema = z.enum(['memory', 'redis']);
const emailServiceSchema = z.enum(['off', 'smtp']);
const fileStorageDriverSchema = z.enum(['local', 'oss']);
const logTargetSchema = z.enum(['console', 'local', 'sls']);
const authCookieSameSiteSchema = z.enum(['lax', 'none', 'strict']);
const authCookieSecureSchema = z.enum(['auto', 'false', 'true']);
const cookieNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/, 'Must be a valid cookie name');
const envFilePath = resolve(process.cwd(), '.env');
const developmentAuthTokenSecret = 'development-auth-token-secret-change-before-production';
const defaultCorsOrigins = 'http://localhost:8011';
const defaultSsoScopes = 'openid profile email';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SERVER_HOST: z.string().default('0.0.0.0'),
    SERVER_PORT: z.coerce.number().int().positive().default(3000),
    TRUST_PROXY: z.enum(['true', 'false']).default('false'),
    MULTI_INSTANCE_ENABLED: z.enum(['true', 'false']).default('false'),
    CORS_ORIGINS: z.string().min(1).default(defaultCorsOrigins),
    LOG_REQUEST_ENABLED: z.enum(['true', 'false']).default('true'),
    LOG_TARGETS: z.string().min(1).default('console'),
    LOG_LOCAL_PATH: z.string().min(1).default('./logs/backend.log'),
    LOG_PENDING_WRITE_MAX: z.coerce.number().int().positive().default(1000),
    LOG_WRITE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    LOG_SLS_ENDPOINT: z.string().optional(),
    LOG_SLS_PROJECT: z.string().optional(),
    LOG_SLS_LOGSTORE: z.string().optional(),
    LOG_SLS_ACCESS_KEY_ID: z.string().optional(),
    LOG_SLS_ACCESS_KEY_SECRET: z.string().optional(),
    LOG_SLS_TOPIC: z.string().min(1).default('tilty-scaffold'),
    LOG_SLS_SOURCE: z.string().min(1).default('backend'),
    CACHE_STORE: cacheStoreSchema.default('memory'),
    CACHE_REDIS_URL: z.string().optional(),
    CACHE_REDIS_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    FILE_STORAGE_DRIVER: fileStorageDriverSchema.default('local'),
    FILE_UPLOAD_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(2 * 1024 * 1024),
    FILE_PUBLIC_BASE_URL: z.string().min(1).default('/uploads'),
    FILE_LOCAL_ROOT: z.string().min(1).default('./data/uploads'),
    FILE_OSS_ACCESS_KEY_ID: z.string().min(1).optional(),
    FILE_OSS_ACCESS_KEY_SECRET: z.string().min(1).optional(),
    FILE_OSS_BUCKET: z.string().min(1).optional(),
    FILE_OSS_ENDPOINT: z.string().min(1).optional(),
    FILE_OSS_PUBLIC_BASE_URL: z.string().min(1).optional(),
    FILE_OSS_REGION: z.string().min(1).optional(),
    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
    DATABASE_DIALECT: databaseDialectSchema.default('sqlite'),
    DATABASE_STORAGE: z.string().min(1).default('./data/database.sqlite'),
    DATABASE_URL: z.string().optional(),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    DATABASE_POOL_ACQUIRE_MS: z.coerce.number().int().positive().default(30_000),
    DATABASE_POOL_IDLE_MS: z.coerce.number().int().positive().default(10_000),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(0),
    DATABASE_SSL: z.enum(['true', 'false']).default('false'),
    DATABASE_SYNC: z.enum(['off', 'alter', 'force']).default('off'),
    SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true'),
    SCHEDULER_LOCK_TTL_MS: z.coerce.number().int().min(1000).default(300_000),
    AUTH_TOKEN_SECRET: z.string().min(32).optional(),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 24 * 60 * 60),
    AUTH_ACCESS_TOKEN_COOKIE_NAME: cookieNameSchema.default('tilty_scaffold_access_token'),
    AUTH_REFRESH_TOKEN_COOKIE_NAME: cookieNameSchema.default('tilty_scaffold_refresh_token'),
    AUTH_COOKIE_SAME_SITE: authCookieSameSiteSchema.default('lax'),
    AUTH_COOKIE_SECURE: authCookieSecureSchema.default('auto'),
    EMAIL_VERIFICATION_SERVICE: emailServiceSchema.default('off'),
    EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 60_000),
    EMAIL_VERIFICATION_CODE_COOLDOWN_MS: z.coerce.number().int().positive().default(60_000),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_SECURE: z.enum(['true', 'false']).default('true'),
    SMTP_STARTTLS: z.enum(['true', 'false']).default('false'),
    SMTP_FROM: z.string().min(1).optional(),
    SMTP_USERNAME: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    SSO_ENABLED: z.enum(['true', 'false']).default('false'),
    SSO_ISSUER_URL: z.url().optional(),
    SSO_CLIENT_ID: z.string().min(1).optional(),
    SSO_CLIENT_SECRET: z.string().min(1).optional(),
    SSO_REDIRECT_URI: z.url().optional(),
    SSO_FRONTEND_CALLBACK_URL: z.url().default('http://localhost:8011/login'),
    SSO_SCOPES: z.string().min(1).default(defaultSsoScopes),
    SSO_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  })
  .superRefine((env, ctx) => {
    const rawLogTargets = parseCommaSeparatedValues(env.LOG_TARGETS);
    const invalidLogTargets = rawLogTargets.filter((target) => !logTargetSchema.safeParse(target).success);
    const logTargets = rawLogTargets.filter(
      (target): target is z.infer<typeof logTargetSchema> => logTargetSchema.safeParse(target).success,
    );

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

    if (logTargets.includes('sls')) {
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

    if (env.MULTI_INSTANCE_ENABLED === 'true' && env.CACHE_STORE !== 'redis') {
      ctx.addIssue({
        code: 'custom',
        path: ['CACHE_STORE'],
        message: 'Must be redis when MULTI_INSTANCE_ENABLED is true',
      });
    }

    if (env.MULTI_INSTANCE_ENABLED === 'true' && env.DATABASE_DIALECT === 'sqlite') {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_DIALECT'],
        message: 'Must be mysql or postgres when MULTI_INSTANCE_ENABLED is true',
      });
    }

    if (env.MULTI_INSTANCE_ENABLED === 'true' && env.FILE_STORAGE_DRIVER !== 'oss') {
      ctx.addIssue({
        code: 'custom',
        path: ['FILE_STORAGE_DRIVER'],
        message: 'Must be oss when MULTI_INSTANCE_ENABLED is true',
      });
    }

    if (env.CACHE_STORE === 'redis') {
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

      if (env.NODE_ENV === 'production' && value && hasUrlProtocol(value, ['http:'])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'Absolute public file URLs must use https when NODE_ENV is production',
        });
      }
    }

    if (env.FILE_STORAGE_DRIVER === 'oss') {
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

    if (env.NODE_ENV === 'production' && parseCommaSeparatedValues(env.CORS_ORIGINS).includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Must not include * when NODE_ENV is production',
      });
    }

    if (env.NODE_ENV === 'production' && env.DATABASE_SYNC !== 'off') {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_SYNC'],
        message: 'Must be off when NODE_ENV is production',
      });
    }

    if (env.NODE_ENV === 'production' && !env.AUTH_TOKEN_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_TOKEN_SECRET'],
        message: 'Required when NODE_ENV is production',
      });
    }

    if (env.NODE_ENV === 'production' && env.AUTH_TOKEN_SECRET === developmentAuthTokenSecret) {
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

    if (env.AUTH_COOKIE_SAME_SITE === 'none' && env.AUTH_COOKIE_SECURE !== 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'Must be true when AUTH_COOKIE_SAME_SITE is none',
      });
    }

    if (env.NODE_ENV === 'production' && env.AUTH_COOKIE_SECURE !== 'true') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SECURE'],
        message: 'Must be true when NODE_ENV is production',
      });
    }

    if (env.SSO_ENABLED === 'true') {
      for (const key of ['SSO_ISSUER_URL', 'SSO_CLIENT_ID', 'SSO_CLIENT_SECRET', 'SSO_REDIRECT_URI'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when SSO_ENABLED is true',
          });
        }
      }

      for (const key of ['SSO_ISSUER_URL', 'SSO_REDIRECT_URI', 'SSO_FRONTEND_CALLBACK_URL'] as const) {
        const value = env[key];

        if (value && !hasUrlProtocol(value, ['http:', 'https:'])) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Must use http:// or https://',
          });
        }

        if (env.NODE_ENV === 'production' && value && !hasUrlProtocol(value, ['https:'])) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Must use https when NODE_ENV is production',
          });
        }
      }
    }

    if (env.EMAIL_VERIFICATION_SERVICE === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_FROM'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Required when EMAIL_VERIFICATION_SERVICE is smtp',
          });
        }
      }

      if (env.SMTP_SECURE === 'true' && env.SMTP_STARTTLS === 'true') {
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_STARTTLS'],
          message: 'Must be false when SMTP_SECURE is true',
        });
      }

      if (env.NODE_ENV === 'production' && env.SMTP_SECURE === 'false' && env.SMTP_STARTTLS === 'false') {
        ctx.addIssue({
          code: 'custom',
          path: ['SMTP_SECURE'],
          message: 'SMTP must use implicit TLS or STARTTLS when NODE_ENV is production',
        });
      }

      if (Boolean(env.SMTP_USERNAME) !== Boolean(env.SMTP_PASSWORD)) {
        for (const key of ['SMTP_USERNAME', 'SMTP_PASSWORD'] as const) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'Must be configured together when SMTP authentication is used',
          });
        }
      }
    }

    if (env.DATABASE_DIALECT === 'sqlite') {
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
  const message = getEnvValidationMessage(source);

  if (message) {
    throw new Error(message);
  }

  const parsed = envSchema.parse(source);
  const logTargets = parseLogTargets(parsed.LOG_TARGETS);
  const ssoIssuerUrl = parsed.SSO_ISSUER_URL ? parsed.SSO_ISSUER_URL.replace(/\/+$/, '') : undefined;
  const database =
    parsed.DATABASE_DIALECT === 'sqlite'
      ? {
          dialect: 'sqlite' as const,
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
          ssl: parsed.DATABASE_SSL === 'true',
          url: parsed.DATABASE_URL!,
        };

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.SERVER_HOST,
    port: parsed.SERVER_PORT,
    trustProxy: parsed.TRUST_PROXY === 'true',
    multiInstanceEnabled: parsed.MULTI_INSTANCE_ENABLED === 'true',
    cache:
      parsed.CACHE_STORE === 'redis'
        ? {
            store: 'redis' as const,
            timeoutMs: parsed.CACHE_REDIS_REQUEST_TIMEOUT_MS,
            url: parsed.CACHE_REDIS_URL!,
          }
        : {
            store: 'memory' as const,
          },
    fileStorage:
      parsed.FILE_STORAGE_DRIVER === 'oss'
        ? {
            accessKeyId: parsed.FILE_OSS_ACCESS_KEY_ID!,
            accessKeySecret: parsed.FILE_OSS_ACCESS_KEY_SECRET!,
            bucket: parsed.FILE_OSS_BUCKET!,
            driver: 'oss' as const,
            endpoint: parsed.FILE_OSS_ENDPOINT!,
            ...(parsed.FILE_OSS_PUBLIC_BASE_URL ? { publicBaseUrl: parsed.FILE_OSS_PUBLIC_BASE_URL } : {}),
            region: parsed.FILE_OSS_REGION!,
          }
        : {
            driver: 'local' as const,
            publicBaseUrl: parsed.FILE_PUBLIC_BASE_URL,
            root: parsed.FILE_LOCAL_ROOT,
          },
    fileUpload: {
      maxBytes: parsed.FILE_UPLOAD_MAX_BYTES,
    },
    localFiles:
      parsed.FILE_STORAGE_DRIVER === 'local'
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
    corsOrigins: parseCommaSeparatedValues(parsed.CORS_ORIGINS),
    database,
    databaseSync: parsed.DATABASE_SYNC,
    logger: {
      targets: logTargets,
      localPath: parsed.LOG_LOCAL_PATH,
      maxPendingWrites: parsed.LOG_PENDING_WRITE_MAX,
      writeTimeoutMs: parsed.LOG_WRITE_TIMEOUT_MS,
      ...(logTargets.includes('sls')
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
    requestLogEnabled: parsed.LOG_REQUEST_ENABLED === 'true',
    scheduleEnabled: parsed.SCHEDULER_ENABLED === 'true',
    schedulerLock:
      parsed.MULTI_INSTANCE_ENABLED === 'true' && parsed.SCHEDULER_ENABLED === 'true'
        ? {
            ttlMs: parsed.SCHEDULER_LOCK_TTL_MS,
          }
        : undefined,
    authTokenSecret: parsed.AUTH_TOKEN_SECRET ?? developmentAuthTokenSecret,
    authTokens: {
      accessTokenTtlSeconds: parsed.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: parsed.AUTH_REFRESH_TOKEN_TTL_SECONDS,
    },
    authCookies: {
      accessTokenName: parsed.AUTH_ACCESS_TOKEN_COOKIE_NAME,
      refreshTokenName: parsed.AUTH_REFRESH_TOKEN_COOKIE_NAME,
      sameSite: parsed.AUTH_COOKIE_SAME_SITE,
      secure: parsed.AUTH_COOKIE_SECURE,
    },
    email:
      parsed.EMAIL_VERIFICATION_SERVICE === 'smtp'
        ? {
            codeCooldownMs: parsed.EMAIL_VERIFICATION_CODE_COOLDOWN_MS,
            codeExpiresInMs: parsed.EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS,
            smtp: {
              from: parsed.SMTP_FROM!,
              host: parsed.SMTP_HOST!,
              port: parsed.SMTP_PORT,
              secure: parsed.SMTP_SECURE === 'true',
              startTls: parsed.SMTP_STARTTLS === 'true',
              timeoutMs: parsed.SMTP_REQUEST_TIMEOUT_MS,
              ...(parsed.SMTP_USERNAME
                ? {
                    password: parsed.SMTP_PASSWORD!,
                    username: parsed.SMTP_USERNAME,
                  }
                : {}),
            },
          }
        : undefined,
    sso:
      parsed.SSO_ENABLED === 'true'
        ? {
            clientId: parsed.SSO_CLIENT_ID!,
            clientSecret: parsed.SSO_CLIENT_SECRET!,
            frontendCallbackUrl: parsed.SSO_FRONTEND_CALLBACK_URL,
            issuerUrl: ssoIssuerUrl!,
            redirectUri: parsed.SSO_REDIRECT_URI!,
            requestTimeoutMs: parsed.SSO_REQUEST_TIMEOUT_MS,
            scopes: parseScopes(parsed.SSO_SCOPES),
          }
        : undefined,
  } as const;
}

export function getEnvValidationMessage(source: NodeJS.ProcessEnv = process.env) {
  if (source === process.env && source.NODE_ENV !== 'production' && !existsSync(envFilePath)) {
    return `Missing environment file: ${envFilePath}\nCopy .env.example to .env before starting the backend.`;
  }

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    return [
      'Invalid environment variables:',
      ...parsed.error.issues.map((issue) => {
        const key = issue.path.join('.') || 'environment';

        return `- ${key}: ${issue.message}`;
      }),
    ].join('\n');
  }

  return null;
}

function parseLogTargets(value: string) {
  return parseUniqueValues(value, /,/).map((target) => logTargetSchema.parse(target));
}

function parseCommaSeparatedValues(value: string) {
  return parseValues(value, /,/);
}

function parseScopes(value: string) {
  return parseUniqueValues(value, /\s+/);
}

function parseUniqueValues(value: string, separator: RegExp) {
  return Array.from(new Set(parseValues(value, separator)));
}

function parseValues(value: string, separator: RegExp) {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
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

function getLocalFileUrlPrefix(publicBaseUrl: string) {
  const path = publicBaseUrl.startsWith('/') ? publicBaseUrl : new URL(publicBaseUrl).pathname;

  return path.replace(/\/+$/, '') || '/';
}
