import { describe, expect, it } from 'vitest';

import { RouteDefinition } from '../src/core/module';
import { createHealthModule } from '../src/modules/health';
import { createTestContext, runMiddleware } from './support/http';

describe('health API', () => {
  it('returns service health', async () => {
    const context = await runMiddleware(getRoute(createHealthModule().routes, '').handlers[0]!, createTestContext());

    expect(context.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        status: 'ok',
      },
    });
    expect(Date.parse((context.body as { data: { time: string } }).data.time)).not.toBeNaN();
  });

  it('returns readiness when checks pass', async () => {
    const routes = createHealthModule({
      readinessChecks: [
        {
          name: 'database',
          check: async () => undefined,
        },
      ],
    }).routes;
    const context = await runMiddleware(getRoute(routes, '/ready').handlers[0]!, createTestContext());

    expect(context.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        checks: {
          database: 'ok',
        },
        status: 'ok',
      },
    });
  });

  it('returns 503 readiness when a check fails', async () => {
    const routes = createHealthModule({
      readinessChecks: [
        {
          name: 'database',
          check: async () => {
            throw new Error('database unavailable');
          },
        },
      ],
    }).routes;
    const context = await runMiddleware(getRoute(routes, '/ready').handlers[0]!, createTestContext());

    expect(context.status).toBe(503);
    expect(context.body).toMatchObject({
      code: 503,
      error: 'SERVICE_NOT_READY',
      details: {
        checks: {
          database: 'error',
        },
      },
    });
  });
});

function getRoute(routes: RouteDefinition[], path: string) {
  const route = routes.find((item) => item.method === 'get' && item.path === path);

  if (!route) {
    throw new Error(`Missing health route ${path}`);
  }

  return route;
}
