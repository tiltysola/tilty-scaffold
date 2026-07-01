import { type Middleware } from 'koa';

import { AppError } from '../core/errors';
import { type CacheStore, MemoryCacheStore } from '../infra/cache';

type RateLimitScope = 'ip' | 'route';

export interface RateLimitOptions {
  cacheStore?: CacheStore;
  max: number;
  scope?: RateLimitScope;
  skip?: (ctx: Parameters<Middleware>[0]) => boolean;
  windowMs: number;
}

export function rateLimitMiddleware(options: RateLimitOptions): Middleware {
  const cacheStore = options.cacheStore ?? new MemoryCacheStore();
  const scope = options.scope ?? 'route';

  return async (ctx, next) => {
    if (options.skip?.(ctx)) {
      await next();
      return;
    }

    const key = getRateLimitKey(scope, ctx);
    const record = await cacheStore.increment(key, options.windowMs);

    if (record.count > options.max) {
      ctx.set('Retry-After', String(Math.ceil(record.expiresInMs / 1000)));
      throw new AppError('RATE_LIMITED', 'error.RATE_LIMITED', 429);
    }

    await next();
  };
}

function getRateLimitKey(scope: RateLimitScope, ctx: Parameters<Middleware>[0]) {
  if (scope === 'ip') {
    return `rate-limit:${ctx.ip}`;
  }

  return `rate-limit:${ctx.ip}:${ctx.method}:${ctx.path}`;
}
