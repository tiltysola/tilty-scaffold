import { Middleware } from 'koa';

import { type RouteDefinition } from '../../src/core/module';

interface TestContext {
  body?: unknown;
  cookies: {
    get: (name: string) => string | undefined;
    set: (name: string, value: string, options?: Record<string, unknown>) => void;
  };
  get: (name: string) => string;
  ip: string;
  method: string;
  params?: Record<string, string>;
  path: string;
  query: Record<string, string | undefined>;
  redirect: (url: string) => void;
  redirectUrl?: string;
  request: {
    body?: unknown;
  };
  responseHeaders: Record<string, string>;
  secure: boolean;
  set: (name: string, value: string) => void;
  status?: number;
  state: Record<string, unknown>;
  type?: string;
}

interface TestContextOptions {
  cookies?: Record<string, string>;
  ip?: string;
  method?: string;
  path?: string;
  query?: Record<string, string | undefined>;
  secure?: boolean;
}

export function createTestContext(
  body?: unknown,
  headers: Record<string, string> = {},
  params?: Record<string, string>,
  options: TestContextOptions = {},
) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const responseHeaders: Record<string, string> = {};
  const cookies = new Map(Object.entries(options.cookies ?? {}));

  return {
    cookies: {
      get: (name: string) => cookies.get(name),
      set: (name: string, value: string, cookieOptions?: Record<string, unknown>) => {
        cookies.set(name, value);
        responseHeaders[`set-cookie:${name}`] = JSON.stringify({
          value,
          ...(cookieOptions ?? {}),
        });
      },
    },
    get: (name: string) => normalizedHeaders[name.toLowerCase()] ?? '',
    ip: options.ip ?? '127.0.0.1',
    method: options.method ?? 'GET',
    ...(params ? { params } : {}),
    path: options.path ?? '/',
    query: options.query ?? {},
    redirect: (url: string) => {
      responseHeaders.location = url;
    },
    request: {
      body,
    },
    responseHeaders,
    secure: options.secure ?? false,
    set: (name: string, value: string) => {
      responseHeaders[name.toLowerCase()] = value;
    },
    state: {},
  } satisfies TestContext;
}

export async function runMiddleware(handler: Middleware, ctx: TestContext) {
  await runMiddlewares([handler], ctx);

  return ctx;
}

export async function runMiddlewares(handlers: Middleware[], ctx: TestContext) {
  let index = -1;

  const dispatch = async (nextIndex: number): Promise<void> => {
    if (nextIndex <= index) {
      throw new Error('next() called multiple times');
    }

    index = nextIndex;
    const handler = handlers[nextIndex];

    if (!handler) {
      return;
    }

    await handler(ctx as never, async () => {
      await dispatch(nextIndex + 1);
    });
  };

  await dispatch(0);

  return ctx;
}

export function getTestRoute(routes: RouteDefinition[], method: RouteDefinition['method'], path: string) {
  const route = routes.find((item) => item.method === method && item.path === path);

  if (!route) {
    throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  }

  return route;
}

export function getTestRouteHandler(routes: RouteDefinition[], method: RouteDefinition['method'], path: string) {
  return getTestRoute(routes, method, path).handlers[0]!;
}
