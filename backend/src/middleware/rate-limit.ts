import { Middleware } from 'koa';

import { AppError } from '../core/errors';

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

interface RateLimitRecord {
  count: number;
  expiresAt: number;
}

export function rateLimitMiddleware(options: RateLimitOptions): Middleware {
  const records = new Map<string, RateLimitRecord>();

  return async (ctx, next) => {
    const now = Date.now();
    const key = `${ctx.ip}:${ctx.method}:${ctx.path}`;
    const record = records.get(key);

    if (!record || record.expiresAt <= now) {
      records.set(key, {
        count: 1,
        expiresAt: now + options.windowMs,
      });
      await next();
      return;
    }

    if (record.count >= options.max) {
      ctx.set('Retry-After', String(Math.ceil((record.expiresAt - now) / 1000)));
      throw new AppError('RATE_LIMITED', 'The request rate limit has been exceeded.', 429);
    }

    record.count += 1;
    await next();
  };
}
