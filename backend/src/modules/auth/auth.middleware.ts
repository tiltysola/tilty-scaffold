import { type Middleware } from 'koa';

import { type SystemPermissionKey } from '@tilty/shared/access-control';

import { assertPermission } from '../access-control/access-control.service';
import { type AuthCookieConfig, getAuthToken } from './auth.controller';
import { type AuthService } from './auth.service';

export function requireAuthenticated(authService: AuthService, cookieConfig: AuthCookieConfig): Middleware {
  return async (ctx, next) => {
    ctx.state.auth = await authService.authenticate(getAuthToken(ctx, cookieConfig));

    await next();
  };
}

export function requirePermission(
  authService: AuthService,
  cookieConfig: AuthCookieConfig,
  permission: SystemPermissionKey,
): Middleware {
  const authenticate = requireAuthenticated(authService, cookieConfig);

  return async (ctx, next) => {
    await authenticate(ctx, async () => {
      assertPermission(ctx.state.auth.access, permission);

      await next();
    });
  };
}
