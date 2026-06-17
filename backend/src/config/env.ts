import 'dotenv/config';

import { existsSync } from 'fs';
import { resolve } from 'path';

import { z } from 'zod';

const databaseDialectSchema = z.enum(['postgres', 'mysql', 'sqlite']);
const emailServiceSchema = z.enum(['off', 'smtp']);
const logTargetSchema = z.enum(['console', 'local', 'sls']);
const envFilePath = resolve(process.cwd(), '.env');
const developmentAuthTokenSecret = 'development-auth-token-secret-change-before-production';
const defaultCorsOrigins = 'http://localhost:8011';
const defaultSsoScopes = 'openid profile email';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  CORS_ORIGINS: z.string().min(1).default(defaultCorsOrigins),
  LOG_REQUEST_ENABLED: z.enum(['true', 'false']).default('true'),
  LOG_TARGETS: z.string().min(1).default('console'),
  LOG_LOCAL_PATH: z.string().min(1).default('./logs/backend.log'),
  LOG_SLS_ENDPOINT: z.string().optional(),
  LOG_SLS_PROJECT: z.string().optional(),
  LOG_SLS_LOGSTORE: z.string().optional(),
  LOG_SLS_ACCESS_KEY_ID: z.string().optional(),
  LOG_SLS_ACCESS_KEY_SECRET: z.string().optional(),
  LOG_SLS_TOPIC: z.string().min(1).default('tilty-scaffold'),
  LOG_SLS_SOURCE: z.string().min(1).default('backend'),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_DIALECT: databaseDialectSchema.default('sqlite'),
  DATABASE_STORAGE: z.string().min(1).default('./data/database.sqlite'),
  DATABASE_URL: z.string().optional(),
  DATABASE_SYNC: z.enum(['off', 'alter', 'force']).default('off'),
  SCHEDULER_ENABLED: z.enum(['true', 'false']).default('true'),
  AUTH_TOKEN_SECRET: z.string().min(32).optional(),
  EMAIL_VERIFICATION_SERVICE: emailServiceSchema.default('off'),
  EMAIL_VERIFICATION_CODE_EXPIRES_IN_MS: z.coerce.number().int().positive().default(10 * 60_000),
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
  SSO_ISSUER_URL: z.string().url().optional(),
  SSO_CLIENT_ID: z.string().min(1).optional(),
  SSO_CLIENT_SECRET: z.string().min(1).optional(),
  SSO_REDIRECT_URI: z.string().url().optional(),
  SSO_FRONTEND_CALLBACK_URL: z.string().url().default('http://localhost:8011/login'),
  SSO_SCOPES: z.string().min(1).default(defaultSsoScopes),
  SSO_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
}).superRefine((env, ctx) => {
  const rawLogTargets = parseRawLogTargets(env.LOG_TARGETS);
  const invalidLogTargets = rawLogTargets.filter((target) => !logTargetSchema.safeParse(target).success);
  const logTargets = rawLogTargets.filter((target): target is z.infer<typeof logTargetSchema> =>
    logTargetSchema.safeParse(target).success,
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

  if (env.NODE_ENV === 'production' && parseCorsOrigins(env.CORS_ORIGINS).includes('*')) {
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

  if (!env.DATABASE_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'Required when DATABASE_DIALECT is postgres or mysql',
    });
  }
});

export type DatabaseDialect = z.infer<typeof databaseDialectSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env) {
  const message = getEnvValidationMessage(source);

  if (message) {
    throw new Error(message);
  }

  const parsed = envSchema.parse(source);
  const logTargets = parseLogTargets(parsed.LOG_TARGETS);
  const database =
    parsed.DATABASE_DIALECT === 'sqlite'
      ? {
          dialect: 'sqlite' as const,
          storage: parsed.DATABASE_STORAGE,
        }
      : {
          dialect: parsed.DATABASE_DIALECT,
          url: parsed.DATABASE_URL!,
        };

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.SERVER_HOST,
    port: parsed.SERVER_PORT,
    trustProxy: parsed.TRUST_PROXY === 'true',
    authRateLimit: {
      max: parsed.AUTH_RATE_LIMIT_MAX,
      windowMs: parsed.AUTH_RATE_LIMIT_WINDOW_MS,
    },
    corsOrigins: parseCorsOrigins(parsed.CORS_ORIGINS),
    database,
    databaseSync: parsed.DATABASE_SYNC,
    logger: {
      targets: logTargets,
      localPath: parsed.LOG_LOCAL_PATH,
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
    authTokenSecret: parsed.AUTH_TOKEN_SECRET ?? developmentAuthTokenSecret,
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
            issuerUrl: parsed.SSO_ISSUER_URL!,
            redirectUri: parsed.SSO_REDIRECT_URI!,
            requestTimeoutMs: parsed.SSO_REQUEST_TIMEOUT_MS,
            scopes: parseScopes(parsed.SSO_SCOPES),
          }
        : undefined,
  } as const;
}

export function getEnvValidationMessage(source: NodeJS.ProcessEnv = process.env) {
  if (source === process.env && !existsSync(envFilePath)) {
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

function parseCorsOrigins(value: string) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseLogTargets(value: string) {
  return Array.from(new Set(parseRawLogTargets(value))).map((target) => logTargetSchema.parse(target));
}

function parseRawLogTargets(value: string) {
  return value
    .split(',')
    .map((target) => target.trim())
    .filter(Boolean);
}

function parseScopes(value: string) {
  return Array.from(new Set(value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)));
}
