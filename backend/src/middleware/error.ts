import { type Middleware } from 'koa';

import { normalizeError } from '../core/errors';
import { fail } from '../core/http';
import { logger } from '../core/logger';
import { getBackendMessage } from '../i18n';
import { getRequestLocale } from './locale';

export function errorMiddleware(): Middleware {
  return async (ctx, next) => {
    try {
      await next();

      if (ctx.status === 404 && ctx.body === undefined) {
        ctx.status = 404;
        ctx.body = fail(404, 'PAGE_NOT_FOUND', getBackendMessage(getRequestLocale(ctx), 'error.PAGE_NOT_FOUND'));
      }
    } catch (error) {
      const appError = normalizeError(error);

      ctx.status = appError.status;
      ctx.body = fail(
        appError.status,
        appError.code,
        appError.messageId ? getBackendMessage(getRequestLocale(ctx), appError.messageId) : appError.message,
        appError.details,
      );

      if (appError.status >= 500) {
        logger.error(appError.message, error as Error);
      }
    }
  };
}
