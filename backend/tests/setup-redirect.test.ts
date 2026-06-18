import { describe, expect, it } from 'vitest';

import { setupRedirectMiddleware } from '../src/middleware/setup-redirect';
import { createTestContext, runMiddlewares } from './support/http';

describe('setup redirect middleware', () => {
  it('returns setup-required responses for non-setup API requests in setup mode', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => false,
          mode: 'setup',
        }),
      ],
      createTestContext(
        undefined,
        {
          origin: 'http://localhost:8011',
        },
        undefined,
        {
          path: '/api/auth/config',
        },
      ),
    );

    expect(context.status).toBe(503);
    expect(context.body).toEqual({
      code: 503,
      error: 'SETUP_REQUIRED',
      message: 'Setup is required before this API can be used.',
    });
    expect(context.responseHeaders.location).toBeUndefined();
  });

  it('allows setup API requests in setup mode', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => false,
          mode: 'setup',
        }),
        async (ctx) => {
          ctx.status = 204;
        },
      ],
      createTestContext(undefined, {}, undefined, {
        path: '/api/setup/defaults',
      }),
    );

    expect(context.status).toBe(204);
    expect(context.responseHeaders.location).toBeUndefined();
  });

  it('returns restart-required responses for non-setup API requests after setup completes without restart', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => true,
          mode: 'setup',
        }),
      ],
      createTestContext(undefined, {}, undefined, {
        path: '/api/auth/config',
      }),
    );

    expect(context.status).toBe(503);
    expect(context.body).toEqual({
      code: 503,
      error: 'SETUP_RESTART_REQUIRED',
      message: 'Setup is complete. Restart the backend service before using this API.',
    });
    expect(context.responseHeaders.location).toBeUndefined();
  });

  it('uses the request origin for setup page redirects when wildcard CORS is configured', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['*'],
          isSetupLocked: () => false,
          mode: 'setup',
        }),
      ],
      createTestContext(
        undefined,
        {
          accept: 'text/html',
          origin: 'http://localhost:8011',
        },
        undefined,
        {
          path: '/dashboard',
        },
      ),
    );

    expect(context.responseHeaders.location).toBe('http://localhost:8011/setup');
  });

  it('redirects browser navigation requests to the setup page in setup mode', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => false,
          mode: 'setup',
        }),
      ],
      createTestContext(
        undefined,
        {
          accept: 'text/html',
        },
        undefined,
        {
          path: '/dashboard',
        },
      ),
    );

    expect(context.status).toBe(302);
    expect(context.responseHeaders.location).toBe('http://localhost:8011/setup');
  });

  it('passes non-HTML non-API requests through in setup mode', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => false,
          mode: 'setup',
        }),
        async (ctx) => {
          ctx.status = 204;
        },
      ],
      createTestContext(
        undefined,
        {
          accept: 'image/png',
        },
        undefined,
        {
          path: '/favicon.png',
        },
      ),
    );

    expect(context.status).toBe(204);
    expect(context.responseHeaders.location).toBeUndefined();
  });

  it('redirects direct setup page visits to login after setup completes without restart', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => true,
          mode: 'setup',
        }),
      ],
      createTestContext(
        undefined,
        {
          origin: 'http://localhost:8011',
        },
        undefined,
        {
          path: '/setup',
        },
      ),
    );

    expect(context.status).toBe(302);
    expect(context.responseHeaders.location).toBe('http://localhost:8011/login');
  });

  it('allows setup API requests after setup completes without restart', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => true,
          mode: 'setup',
        }),
        async (ctx) => {
          ctx.status = 204;
        },
      ],
      createTestContext(undefined, {}, undefined, {
        path: '/api/setup/defaults',
      }),
    );

    expect(context.status).toBe(204);
    expect(context.responseHeaders.location).toBeUndefined();
  });

  it('redirects direct setup page visits to login in locked mode', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => true,
          mode: 'locked',
        }),
      ],
      createTestContext(
        undefined,
        {
          origin: 'http://localhost:8011',
        },
        undefined,
        {
          path: '/setup',
        },
      ),
    );

    expect(context.status).toBe(302);
    expect(context.responseHeaders.location).toBe('http://localhost:8011/login');
  });

  it('passes non-setup API requests through in locked mode', async () => {
    const context = await runMiddlewares(
      [
        setupRedirectMiddleware({
          allowedOrigins: ['http://localhost:8011'],
          isSetupLocked: () => true,
          mode: 'locked',
        }),
        async (ctx) => {
          ctx.status = 204;
        },
      ],
      createTestContext(undefined, {}, undefined, {
        path: '/api/auth/config',
      }),
    );

    expect(context.status).toBe(204);
    expect(context.responseHeaders.location).toBeUndefined();
  });
});
