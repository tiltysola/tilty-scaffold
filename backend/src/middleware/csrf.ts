import { type Middleware } from 'koa';

import { apiKeyPrefix } from '@tilty/shared/api-keys';

import { AppError } from '../core/errors';

export interface CsrfProtectionOptions {
  allowedOrigins: string[];
}

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const apiKeyBearerAuthorizationPattern = new RegExp(`^Bearer\\s+${escapeRegExp(apiKeyPrefix)}_`, 'i');

export function csrfProtectionMiddleware(options: CsrfProtectionOptions): Middleware {
  return async (ctx, next) => {
    if (safeMethods.has(ctx.method.toUpperCase())) {
      await next();
      return;
    }

    if (hasBearerAuthorization(ctx.get('authorization'))) {
      await next();
      return;
    }

    const requestOrigin = getRequestOrigin(ctx.get('origin'), ctx.get('referer'));

    if (!requestOrigin || (requestOrigin !== ctx.origin && !options.allowedOrigins.includes(requestOrigin))) {
      throw new AppError('CSRF_ORIGIN_INVALID', 'error.CSRF_ORIGIN_INVALID', 403);
    }

    await next();
  };
}

function hasBearerAuthorization(authorization: string) {
  return apiKeyBearerAuthorizationPattern.test(authorization.trim());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRequestOrigin(origin: string, referer: string) {
  if (origin) {
    return origin;
  }

  if (!referer) {
    return undefined;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
