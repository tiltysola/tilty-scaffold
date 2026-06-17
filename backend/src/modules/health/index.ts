import { type Middleware } from 'koa';

import { fail, ok } from '../../core/http';
import { type BackendModule } from '../../core/module';

export interface ReadinessCheck {
  check: () => Promise<void>;
  name: string;
}

interface HealthModuleOptions {
  readinessChecks?: ReadinessCheck[];
}

const getHealth: Middleware = async (ctx) => {
  ctx.body = ok({
    status: 'ok',
    time: new Date().toISOString(),
  });
};

export function createHealthModule(options: HealthModuleOptions = {}): BackendModule {
  const getReady: Middleware = async (ctx) => {
    const checks: Record<string, 'error' | 'ok'> = {};

    for (const readinessCheck of options.readinessChecks ?? []) {
      try {
        await readinessCheck.check();
        checks[readinessCheck.name] = 'ok';
      } catch {
        checks[readinessCheck.name] = 'error';
      }
    }

    if (Object.values(checks).includes('error')) {
      ctx.status = 503;
      ctx.body = fail(503, 'SERVICE_NOT_READY', 'Service is not ready.', { checks });
      return;
    }

    ctx.body = ok({
      checks,
      status: 'ok',
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
