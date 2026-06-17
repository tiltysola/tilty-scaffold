import { describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '../src/infra/cache';
import { csrfProtectionMiddleware } from '../src/middleware/csrf';
import { rateLimitMiddleware } from '../src/middleware/rate-limit';
import { requestIdMiddleware } from '../src/middleware/request-id';
import { requestLogMiddleware } from '../src/middleware/request-log';
import { securityHeadersMiddleware } from '../src/middleware/security-headers';
import { createAuthModule } from '../src/modules/auth';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.controller';
import { AuthService, defaultAuthTokenConfig } from '../src/modules/auth/auth.service';
import { SsoService } from '../src/modules/auth/auth.sso';
import { createTestContext, getTestRoute, runMiddleware, runMiddlewares } from './support/http';

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

  it('does not reflect invalid request ids', async () => {
    const context = await runMiddleware(
      requestIdMiddleware(),
      createTestContext(undefined, { 'x-request-id': 'bad\r\nx-injected: yes' }),
    );

    expect(context.state.requestId).not.toBe('bad\r\nx-injected: yes');
    expect(context.responseHeaders['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
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

  it('rejects unsafe cookie-backed requests from untrusted origins', async () => {
    await expect(
      runMiddleware(
        csrfProtectionMiddleware({ allowedOrigins: ['http://localhost:8011'] }),
        createTestContext(
          undefined,
          {
            cookie: 'tilty_scaffold_refresh_token=session-token',
            origin: 'https://evil.example.com',
          },
          undefined,
          {
            method: 'POST',
            path: '/api/auth/refresh',
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'CSRF_ORIGIN_INVALID',
      status: 403,
    });
  });

  it('rejects unsafe requests from untrusted origins even before cookies exist', async () => {
    await expect(
      runMiddleware(
        csrfProtectionMiddleware({ allowedOrigins: ['http://localhost:8011'] }),
        createTestContext(
          undefined,
          {
            origin: 'https://evil.example.com',
          },
          undefined,
          {
            method: 'POST',
            path: '/api/auth/login',
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'CSRF_ORIGIN_INVALID',
      status: 403,
    });
  });

  it('requires an origin or referer on unsafe requests', async () => {
    await expect(
      runMiddleware(
        csrfProtectionMiddleware({ allowedOrigins: ['http://localhost:8011'] }),
        createTestContext(undefined, {}, undefined, {
          method: 'POST',
          path: '/api/auth/login',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'CSRF_ORIGIN_INVALID',
      status: 403,
    });
  });

  it('does not treat wildcard CORS as a CSRF allowlist', async () => {
    await expect(
      runMiddleware(
        csrfProtectionMiddleware({ allowedOrigins: ['*'] }),
        createTestContext(
          undefined,
          {
            origin: 'https://evil.example.com',
          },
          undefined,
          {
            method: 'POST',
            path: '/api/auth/login',
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'CSRF_ORIGIN_INVALID',
      status: 403,
    });
  });

  it('allows unsafe cookie-backed requests from trusted origins', async () => {
    const context = await runMiddleware(
      csrfProtectionMiddleware({ allowedOrigins: ['http://localhost:8011'] }),
      createTestContext(
        undefined,
        {
          cookie: 'tilty_scaffold_refresh_token=session-token',
          origin: 'http://localhost:8011',
        },
        undefined,
        {
          method: 'POST',
          path: '/api/auth/refresh',
        },
      ),
    );

    expect(context.status).toBeUndefined();
  });

  it('allows unsafe requests from trusted origins before cookies exist', async () => {
    const context = await runMiddleware(
      csrfProtectionMiddleware({ allowedOrigins: ['http://localhost:8011'] }),
      createTestContext(
        undefined,
        {
          origin: 'http://localhost:8011',
        },
        undefined,
        {
          method: 'POST',
          path: '/api/auth/login',
        },
      ),
    );

    expect(context.status).toBeUndefined();
  });

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
      ssoService: new SsoService(
        {} as never,
        {} as never,
        'test-auth-token-secret-minimum-32-characters',
        undefined,
        new MemoryCacheStore(),
        defaultAuthTokenConfig,
      ),
    }).routes;

    await runMiddlewares(
      getTestRoute(routes, 'post', '/login').handlers,
      createTestContext({ email: 'user@example.com', password: 'password123' }, {}, undefined, {
        method: 'POST',
        path: '/api/auth/login',
      }),
    );

    await expect(
      runMiddlewares(
        getTestRoute(routes, 'post', '/login').handlers,
        createTestContext({ email: 'user@example.com', password: 'password123' }, {}, undefined, {
          method: 'POST',
          path: '/api/auth/login',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
  });
});
