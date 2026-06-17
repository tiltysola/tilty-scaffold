import { type Middleware } from 'koa';

import { AppError } from '../core/errors';

export interface CsrfProtectionOptions {
  allowedOrigins: string[];
}

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtectionMiddleware(options: CsrfProtectionOptions): Middleware {
  return async (ctx, next) => {
    if (safeMethods.has(ctx.method.toUpperCase())) {
      await next();
      return;
    }

    const requestOrigin = getRequestOrigin(ctx.get('origin'), ctx.get('referer'));

    if (!requestOrigin || (requestOrigin !== ctx.origin && !options.allowedOrigins.includes(requestOrigin))) {
      throw new AppError('CSRF_ORIGIN_INVALID', 'Request origin is not allowed.', 403);
    }

    await next();
  };
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
