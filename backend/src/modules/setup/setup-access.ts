import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { chmod, readFile, unlink, writeFile } from 'fs/promises';
import { type Middleware } from 'koa';
import { z } from 'zod';

import { setupAccessCookieName } from '@tilty/shared/setup';

import { getConfigFilePath } from '../../config/env';
import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import { type CacheStore } from '../../infra/cache';

const setupAccessSessionTtlMs = 30 * 60_000;
const setupTokenSchema = z.string().trim().min(32).max(512);
const setupUnlockSchema = z.object({
  token: setupTokenSchema,
});

export class SetupAccessService {
  constructor(
    private readonly cacheStore: CacheStore,
    private readonly expectedToken: string,
    private readonly options: { requireSecure?: boolean } = {},
  ) {}

  unlock: Middleware = async (ctx) => {
    this.assertSecureTransport(ctx.secure);
    const { token } = setupUnlockSchema.parse(ctx.request.body);

    if (!constantTimeEqual(token, this.expectedToken)) {
      throw new AppError('SETUP_TOKEN_INVALID', 'error.SETUP_TOKEN_INVALID', 401);
    }

    const sessionId = randomBytes(32).toString('base64url');

    await this.cacheStore.set(getSetupSessionKey(sessionId), true, setupAccessSessionTtlMs);
    setSetupAccessCookie(ctx, sessionId, setupAccessSessionTtlMs);
    ctx.body = ok({
      expiresInSeconds: setupAccessSessionTtlMs / 1000,
      unlocked: true,
    });
  };

  requireAccess: Middleware = async (ctx, next) => {
    this.assertSecureTransport(ctx.secure);
    const sessionId = ctx.cookies.get(setupAccessCookieName);

    if (!sessionId || !(await this.cacheStore.get<boolean>(getSetupSessionKey(sessionId)))) {
      clearSetupAccessCookie(ctx);
      throw new AppError('SETUP_ACCESS_REQUIRED', 'error.SETUP_ACCESS_REQUIRED', 401);
    }

    await this.cacheStore.set(getSetupSessionKey(sessionId), true, setupAccessSessionTtlMs);
    setSetupAccessCookie(ctx, sessionId, setupAccessSessionTtlMs);
    await next();
  };

  clearAccessCookie(ctx: Parameters<Middleware>[0]) {
    clearSetupAccessCookie(ctx);
  }

  private assertSecureTransport(secure: boolean) {
    if (this.options.requireSecure && !secure) {
      throw new AppError('SETUP_HTTPS_REQUIRED', 'error.SETUP_HTTPS_REQUIRED', 403);
    }
  }
}

export async function loadSetupToken(configuredToken?: string) {
  if (configuredToken) {
    return {
      token: setupTokenSchema.parse(configuredToken),
    };
  }

  const tokenFilePath = `${getConfigFilePath()}.setup-token`;

  try {
    const existingToken = setupTokenSchema.parse((await readFile(tokenFilePath, 'utf8')).trim());

    await chmod(tokenFilePath, 0o600);
    return {
      token: existingToken,
      tokenFilePath,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const token = randomBytes(32).toString('base64url');

  try {
    await writeFile(tokenFilePath, `${token}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }

    return loadSetupToken();
  }

  return {
    token,
    tokenFilePath,
  };
}

export async function removeSetupTokenFile(tokenFilePath?: string) {
  if (tokenFilePath) {
    await unlink(tokenFilePath).catch(() => undefined);
  }
}

function getSetupSessionKey(sessionId: string) {
  return `setup-access:${createHash('sha256').update(sessionId, 'utf8').digest('base64url')}`;
}

function constantTimeEqual(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

function setSetupAccessCookie(ctx: Parameters<Middleware>[0], value: string, maxAge: number) {
  ctx.cookies.set(setupAccessCookieName, value, {
    httpOnly: true,
    maxAge,
    overwrite: true,
    path: '/api/setup',
    sameSite: 'strict',
    secure: ctx.secure,
  });
}

function clearSetupAccessCookie(ctx: Parameters<Middleware>[0]) {
  ctx.cookies.set(setupAccessCookieName, '', {
    httpOnly: true,
    maxAge: 0,
    overwrite: true,
    path: '/api/setup',
    sameSite: 'strict',
    secure: ctx.secure,
  });
}
