import { describe, expect, it, vi } from 'vitest';

import { shouldSkipGlobalRateLimit } from '../src/app';
import { rateLimitMiddleware } from '../src/middleware/rate-limit';
import { createAuthModule } from '../src/modules/auth';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.http';
import { type AuthService } from '../src/modules/auth/auth.service';
import { type SsoService } from '../src/modules/auth/auth.sso';
import { createTestContext, getTestRoute, runMiddleware, runMiddlewares } from './support/http';

describe('rate limit middleware', () => {
  it('rate limits authentication-sensitive routes', async () => {
    const authService = {
      login: vi.fn(async () => ({ ok: true })),
      register: vi.fn(async () => ({ ok: true })),
    } as unknown as AuthService;
    const routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      rateLimit: rateLimitMiddleware({
        max: 1,
        windowMs: 60_000,
      }),
      ssoService: {} as SsoService,
    }).routes;

    await runMiddlewares(
      getTestRoute(routes, 'post', '/login').handlers,
      createTestContext({ identifier: 'user@example.com', password: 'password123' }, {}, undefined, {
        method: 'POST',
        path: '/api/auth/login',
      }),
    );

    await expect(
      runMiddlewares(
        getTestRoute(routes, 'post', '/login').handlers,
        createTestContext({ identifier: 'user@example.com', password: 'password123' }, {}, undefined, {
          method: 'POST',
          path: '/api/auth/login',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });

  it('rate limits globally by IP across routes', async () => {
    const rateLimit = rateLimitMiddleware({
      max: 1,
      scope: 'ip',
      windowMs: 60_000,
    });

    await runMiddleware(
      rateLimit,
      createTestContext(undefined, {}, undefined, {
        ip: '192.0.2.10',
        method: 'GET',
        path: '/api/docs',
      }),
    );

    await expect(
      runMiddleware(
        rateLimit,
        createTestContext(undefined, {}, undefined, {
          ip: '192.0.2.10',
          method: 'GET',
          path: '/api/users/',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });

  it('skips global rate limits for health checks and OPTIONS requests', async () => {
    const rateLimit = rateLimitMiddleware({
      max: 1,
      scope: 'ip',
      skip: shouldSkipGlobalRateLimit,
      windowMs: 60_000,
    });

    for (const request of [
      { method: 'GET', path: '/api/health' },
      { method: 'GET', path: '/api/health/ready' },
      { method: 'OPTIONS', path: '/api/users/' },
    ]) {
      await runMiddleware(
        rateLimit,
        createTestContext(undefined, {}, undefined, {
          ip: '192.0.2.11',
          ...request,
        }),
      );
    }

    await runMiddleware(
      rateLimit,
      createTestContext(undefined, {}, undefined, {
        ip: '192.0.2.11',
        method: 'GET',
        path: '/api/docs',
      }),
    );

    await expect(
      runMiddleware(
        rateLimit,
        createTestContext(undefined, {}, undefined, {
          ip: '192.0.2.11',
          method: 'GET',
          path: '/api/users/',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });
});
