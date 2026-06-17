import { randomUUID } from 'crypto';

import { Middleware } from 'koa';

const requestIdHeader = 'X-Request-Id';

export function requestIdMiddleware(): Middleware {
  return async (ctx, next) => {
    const requestId = getRequestId(ctx.get(requestIdHeader)) ?? randomUUID();

    ctx.state.requestId = requestId;
    ctx.set(requestIdHeader, requestId);

    await next();
  };
}

function getRequestId(value: string) {
  const requestId = value.trim();

  if (!requestId || requestId.length > 128) {
    return null;
  }

  return requestId;
}
