import { Middleware } from 'koa';

import { normalizeError } from '../core/errors';
import { fail } from '../core/http';
import { logger } from '../core/logger';

export function errorMiddleware(): Middleware {
  return async (ctx, next) => {
    try {
      await next();

      if (ctx.status === 404 && ctx.body === undefined) {
        ctx.status = 404;
        ctx.body = fail(404, 'PAGE_NOT_FOUND', 'The requested page was not found.');
      }
    } catch (error) {
      const appError = normalizeError(error);

      ctx.status = appError.status;
      ctx.body = fail(appError.status, appError.code, appError.message, appError.details);

      if (appError.status >= 500) {
        logger.error(appError.message, error as Error);
      }
    }
  };
}
