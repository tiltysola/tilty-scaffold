import { describe, expect, it, vi } from 'vitest';

import { RouteDefinition } from '../src/core/module';
import { requestIdMiddleware } from '../src/middleware/request-id';
import { requestLogMiddleware } from '../src/middleware/request-log';
import { rateLimitMiddleware } from '../src/middleware/rate-limit';
import { securityHeadersMiddleware } from '../src/middleware/security-headers';
import { createAuthModule } from '../src/modules/auth';
import { AuthService } from '../src/modules/auth/auth.service';
import { SsoService } from '../src/modules/auth/auth.sso';
import { createTestContext, runMiddleware, runMiddlewares } from './support/http';

describe('security middleware', () => {
  it('sets security headers', async () => {
    const context = await runMiddleware(securityHeadersMiddleware(), createTestContext());

    expect(context.responseHeaders['content-security-policy']).toContain("default-src 'self'");
    expect(context.responseHeaders['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(context.responseHeaders['x-content-type-options']).toBe('nosniff');
    expect(context.responseHeaders['x-frame-options']).toBe('DENY');
    expect(context.responseHeaders['referrer-policy']).toBe('no-referrer');
  });

  it('preserves or creates request ids', async () => {
    const context = await runMiddleware(
      requestIdMiddleware(),
      createTestContext(undefined, { 'x-request-id': 'request-123' }),
    );

    expect(context.state.requestId).toBe('request-123');
    expect(context.responseHeaders['x-request-id']).toBe('request-123');
  });

  it('logs requests when enabled', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      const context = createTestContext(undefined, {}, undefined, {
        method: 'GET',
        path: '/api/health',
      });
      context.status = 200;
      context.state.requestId = 'request-123';

      await runMiddleware(requestLogMiddleware(true), context);

      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('GET /api/health 200'),
      );
    } finally {
      info.mockRestore();
    }
  });

  it('rate limits authentication-sensitive routes', async () => {
    const authService = {
      login: vi.fn(async () => ({ ok: true })),
      register: vi.fn(async () => ({ ok: true })),
    } as unknown as AuthService;
    const routes = createAuthModule(authService, {
      rateLimit: rateLimitMiddleware({
        max: 1,
        windowMs: 60_000,
      }),
      ssoService: new SsoService({} as never, 'test-auth-token-secret-minimum-32-characters'),
    }).routes;

    await runMiddlewares(getRoute(routes, 'post', '/login').handlers, createTestContext(
      { email: 'user@example.com', password: 'password123' },
      {},
      undefined,
      {
        method: 'POST',
        path: '/api/auth/login',
      },
    ));

    await expect(
      runMiddlewares(getRoute(routes, 'post', '/login').handlers, createTestContext(
        { email: 'user@example.com', password: 'password123' },
        {},
        undefined,
        {
          method: 'POST',
          path: '/api/auth/login',
        },
      )),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });
});

function getRoute(routes: RouteDefinition[], method: RouteDefinition['method'], path: string) {
  const route = routes.find((item) => item.method === method && item.path === path);

  if (!route) {
    throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  }

  return route;
}
