import { type Middleware } from 'koa';

import { getSetupEnvironmentDefaults, updateSetupEnvironmentConfig } from '../../config/setup-environment';
import { ok } from '../../core/http';

export class AdminSystemSettingsController {
  get: Middleware = async (ctx) => {
    ctx.body = ok(getSetupEnvironmentDefaults());
  };

  update: Middleware = async (ctx) => {
    ctx.body = ok(await updateSetupEnvironmentConfig(ctx.request.body));
  };
}
