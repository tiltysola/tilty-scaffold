import { randomUUID } from 'crypto';
import { type Middleware } from 'koa';

const requestIdHeader = 'X-Request-Id';
const requestIdPattern = /^[A-Za-z0-9._:-]+$/;

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

  if (!requestId || requestId.length > 128 || !requestIdPattern.test(requestId)) {
    return null;
  }

  return requestId;
}
