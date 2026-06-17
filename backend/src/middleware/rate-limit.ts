import { type Middleware } from 'koa';

import { AppError } from '../core/errors';
import { type CacheStore, MemoryCacheStore } from '../infra/cache';

export interface RateLimitOptions {
  cacheStore?: CacheStore;
  max: number;
  windowMs: number;
}

export function rateLimitMiddleware(options: RateLimitOptions): Middleware {
  const cacheStore = options.cacheStore ?? new MemoryCacheStore();

  return async (ctx, next) => {
    const key = `rate-limit:${ctx.ip}:${ctx.method}:${ctx.path}`;
    const record = await cacheStore.increment(key, options.windowMs);

    if (record.count > options.max) {
      ctx.set('Retry-After', String(Math.ceil(record.expiresInMs / 1000)));
      throw new AppError('RATE_LIMITED', 'The request rate limit has been exceeded.', 429);
    }

    await next();
  };
}
