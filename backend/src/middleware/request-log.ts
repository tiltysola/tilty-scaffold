import { Middleware } from 'koa';

import { logger } from '../core/logger';

export function requestLogMiddleware(enabled: boolean): Middleware {
  return async (ctx, next) => {
    const startedAt = Date.now();

    try {
      await next();
    } finally {
      if (enabled) {
        logger.info(
          `${ctx.method} ${ctx.path} ${ctx.status} ${Date.now() - startedAt}ms requestId=${ctx.state.requestId ?? '-'}`,
        );
      }
    }
  };
}
