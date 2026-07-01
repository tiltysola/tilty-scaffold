import { type Middleware } from 'koa';

import { SystemPermission } from '@tilty/shared/access-control';

import { getSetupEnvironmentDefaults, updateSetupEnvironmentConfig } from '../../config/setup-environment';
import { ok } from '../../core/http';
import { type BackendModule } from '../../core/module';
import { type AuthCookieConfig } from '../auth/auth.http';
import { requireStrongVerifiedPermission } from '../auth/auth.middleware';
import { type AuthService } from '../auth/auth.service';

interface SystemSettingsModuleOptions {
  cookies: AuthCookieConfig;
}

class SystemSettingsController {
  get: Middleware = async (ctx) => {
    ctx.body = ok(getSetupEnvironmentDefaults());
  };

  update: Middleware = async (ctx) => {
    ctx.body = ok(await updateSetupEnvironmentConfig(ctx.request.body));
  };
}

export function createSystemSettingsModule(
  authService: AuthService,
  options: SystemSettingsModuleOptions,
): BackendModule {
  const controller = new SystemSettingsController();
  const requireVerifiedSystemSettingsAccess = requireStrongVerifiedPermission(
    authService,
    options.cookies,
    SystemPermission.Root,
    'system_settings',
  );

  return {
    name: 'system-settings',
    prefix: '/api/system-settings',
    routes: [
      {
        method: 'get',
        path: '/',
        handlers: [...requireVerifiedSystemSettingsAccess, controller.get],
      },
      {
        method: 'put',
        path: '/',
        handlers: [...requireVerifiedSystemSettingsAccess, controller.update],
      },
    ],
  };
}
