import { type Middleware } from 'koa';

import { type SystemPermissionKey } from '@tilty/shared/access-control';

import { assertPermission } from '../access-control/access-control.service';
import { type AuthCookieConfig, getAuthToken } from './auth.http';
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

export function requireStrongSudoAccess(
  authService: AuthService,
  cookieConfig: AuthCookieConfig,
  purpose: Parameters<AuthService['requireStrongSudoAccess']>[1],
): Middleware {
  return async (ctx, next) => {
    await authService.requireStrongSudoAccess(getAuthToken(ctx, cookieConfig), purpose);

    await next();
  };
}

export function requireStrongVerifiedPermission(
  authService: AuthService,
  cookieConfig: AuthCookieConfig,
  permission: SystemPermissionKey,
  purpose: Parameters<AuthService['requireStrongSudoAccess']>[1],
) {
  return [
    requirePermission(authService, cookieConfig, permission),
    requireStrongSudoAccess(authService, cookieConfig, purpose),
  ];
}
