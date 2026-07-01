import { type Middleware } from 'koa';

import { fail, ok } from '../../core/http';
import { type BackendModule } from '../../core/module';
import { getBackendMessage } from '../../i18n';
import { getRequestLocale } from '../../middleware/locale';

export interface ReadinessCheck {
  check: () => Promise<void>;
  name: string;
}

interface HealthModuleOptions {
  readinessChecks?: ReadinessCheck[];
}

export type ReadinessCheckStatusValue = (typeof readinessCheckStatusValues)[number];

export const ReadinessCheckStatus = {
  Error: 'error',
  Ok: 'ok',
} as const;

export const readinessCheckStatusValues = [ReadinessCheckStatus.Error, ReadinessCheckStatus.Ok] as const;

const getHealth: Middleware = async (ctx) => {
  ctx.body = ok({
    status: ReadinessCheckStatus.Ok,
    time: new Date().toISOString(),
  });
};

export function createHealthModule(options: HealthModuleOptions = {}): BackendModule {
  const getReady: Middleware = async (ctx) => {
    const checks: Record<string, ReadinessCheckStatusValue> = {};

    for (const readinessCheck of options.readinessChecks ?? []) {
      try {
        await readinessCheck.check();
        checks[readinessCheck.name] = ReadinessCheckStatus.Ok;
      } catch {
        checks[readinessCheck.name] = ReadinessCheckStatus.Error;
      }
    }

    if (Object.values(checks).includes(ReadinessCheckStatus.Error)) {
      ctx.status = 503;
      ctx.body = fail(503, 'SERVICE_NOT_READY', getBackendMessage(getRequestLocale(ctx), 'error.SERVICE_NOT_READY'), {
        checks,
      });
      return;
    }

    ctx.body = ok({
      checks,
      status: ReadinessCheckStatus.Ok,
      time: new Date().toISOString(),
    });
  };

  return {
    name: 'health',
    prefix: '/api/health',
    routes: [
      {
        method: 'get',
        path: '',
        handlers: [getHealth],
      },
      {
        method: 'get',
        path: '/ready',
        handlers: [getReady],
      },
    ],
  };
}
