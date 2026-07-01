import { describe, expect, it } from 'vitest';

import { localeRequestHeader } from '@tilty/shared/i18n';

import { localeMiddleware } from '../src/middleware/locale';
import { createHealthModule, ReadinessCheckStatus } from '../src/modules/health';
import { createTestContext, getTestRoute, runMiddleware, runMiddlewares } from './support/http';

describe('health API', () => {
  it('returns service health', async () => {
    const context = await runMiddleware(
      getTestRoute(createHealthModule().routes, 'get', '').handlers[0]!,
      createTestContext(),
    );

    expect(context.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        status: ReadinessCheckStatus.Ok,
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
    const context = await runMiddleware(getTestRoute(routes, 'get', '/ready').handlers[0]!, createTestContext());

    expect(context.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        checks: {
          database: ReadinessCheckStatus.Ok,
        },
        status: ReadinessCheckStatus.Ok,
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
    const context = await runMiddleware(getTestRoute(routes, 'get', '/ready').handlers[0]!, createTestContext());

    expect(context.status).toBe(503);
    expect(context.body).toMatchObject({
      code: 503,
      error: 'SERVICE_NOT_READY',
      details: {
        checks: {
          database: ReadinessCheckStatus.Error,
        },
      },
    });
  });

  it('localizes readiness failure messages from the request locale', async () => {
    const route = getTestRoute(
      createHealthModule({
        readinessChecks: [
          {
            name: 'database',
            check: async () => {
              throw new Error('database unavailable');
            },
          },
        ],
      }).routes,
      'get',
      '/ready',
    );
    const context = await runMiddlewares(
      [localeMiddleware(), route.handlers[0]!],
      createTestContext(undefined, {
        [localeRequestHeader]: 'zh-CN',
      }),
    );

    expect(context.status).toBe(503);
    expect(context.body).toMatchObject({
      code: 503,
      error: 'SERVICE_NOT_READY',
      message: '服务尚未就绪。',
    });
  });
});
