import { type Middleware } from 'koa';

import { fail, ok } from '../../core/http';
import { getBackendMessage } from '../../i18n';
import { getRequestLocale } from '../../middleware/locale';

export interface ReadinessCheck {
  name: string;
  check: () => Promise<void>;
}

export type ReadinessCheckStatusValue = (typeof readinessCheckStatusValues)[number];

export const ReadinessCheckStatus = {
  Error: 'error',
  Ok: 'ok',
} as const;

export const readinessCheckStatusValues = [ReadinessCheckStatus.Error, ReadinessCheckStatus.Ok] as const;

export class HealthController {
  constructor(private readonly readinessChecks: ReadinessCheck[] = []) {}

  health: Middleware = async (ctx) => {
    ctx.body = ok({
      status: ReadinessCheckStatus.Ok,
      time: new Date().toISOString(),
    });
  };

  ready: Middleware = async (ctx) => {
    const checks: Record<string, ReadinessCheckStatusValue> = {};

    for (const readinessCheck of this.readinessChecks) {
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
}
