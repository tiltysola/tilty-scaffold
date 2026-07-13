import { type Middleware } from 'koa';

import { type SystemPermissionKey } from '@tilty/shared/access-control';

import { AppError } from '../../core/errors';
import { assertPermission } from '../access-control/access-control.service';
import { type ApiKeyService } from '../api-keys/api-key.service';
import { type AuthCookieConfig, getAuthToken } from './auth.http';
import { type AuthService } from './auth.service';

export function requireAuthenticated(
  authService: AuthService,
  cookieConfig: AuthCookieConfig,
  apiKeyService?: ApiKeyService | undefined,
): Middleware {
  return async (ctx, next) => {
    ctx.state.auth = await authenticateRequest(authService, cookieConfig, ctx, apiKeyService);

    await next();
  };
}

export function requireCookieAuthenticated(authService: AuthService, cookieConfig: AuthCookieConfig): Middleware {
  return async (ctx, next) => {
    assertNoApiKeyAuthorization(ctx, cookieConfig);
    ctx.state.auth = {
      ...(await authService.authenticate(getAuthToken(ctx, cookieConfig))),
      authMethod: 'session' as const,
    };

    await next();
  };
}

export function rejectApiKeyAuthorization(cookieConfig: AuthCookieConfig): Middleware {
  return async (ctx, next) => {
    assertNoApiKeyAuthorization(ctx, cookieConfig);

    await next();
  };
}

export function requireStrongSudoAccess(
  authService: AuthService,
  cookieConfig: AuthCookieConfig,
  purpose: Parameters<AuthService['requireStrongSudoAccess']>[1],
): Middleware {
  return async (ctx, next) => {
    assertNoApiKeyAuthorization(ctx, cookieConfig);
    await authService.requireStrongSudoAccess(getAuthToken(ctx, cookieConfig), purpose);

    await next();
  };
}

export function requireSudoAccess(
  authService: AuthService,
  cookieConfig: AuthCookieConfig,
  purpose: Parameters<AuthService['requireSudoAccess']>[1],
): Middleware {
  return async (ctx, next) => {
    assertNoApiKeyAuthorization(ctx, cookieConfig);
    await authService.requireSudoAccess(getAuthToken(ctx, cookieConfig), purpose);

    await next();
  };
}

export function requireStrongVerifiedCookiePermission(
  authService: AuthService,
  cookieConfig: AuthCookieConfig,
  permission: SystemPermissionKey,
  purpose: Parameters<AuthService['requireStrongSudoAccess']>[1],
) {
  return [
    requireCookieAuthenticated(authService, cookieConfig),
    (async (ctx, next) => {
      assertPermission(ctx.state.auth.access, permission);

      await next();
    }) satisfies Middleware,
    requireStrongSudoAccess(authService, cookieConfig, purpose),
  ];
}

export async function authenticateRequest(
  authService: Pick<AuthService, 'authenticate'>,
  cookieConfig: AuthCookieConfig,
  ctx: Parameters<Middleware>[0],
  apiKeyService?: ApiKeyService | undefined,
) {
  const bearerToken = getBearerToken(ctx);
  const cookieToken = ctx.cookies.get(cookieConfig.accessTokenName);

  if (bearerToken && cookieToken) {
    throwAuthConflict();
  }

  if (bearerToken) {
    if (!apiKeyService) {
      throw new AppError('API_KEY_NOT_SUPPORTED', 'error.API_KEY_NOT_SUPPORTED', 403);
    }

    return apiKeyService.authenticate(bearerToken, {
      ipAddress: ctx.ip,
      userAgent: ctx.get('user-agent'),
    });
  }

  return {
    ...(await authService.authenticate(getAuthToken(ctx, cookieConfig))),
    authMethod: 'session' as const,
  };
}

function assertNoApiKeyAuthorization(ctx: Parameters<Middleware>[0], cookieConfig: AuthCookieConfig) {
  const bearerToken = getBearerToken(ctx);

  if (!bearerToken) {
    return;
  }

  if (ctx.cookies.get(cookieConfig.accessTokenName)) {
    throwAuthConflict();
  }

  if (bearerToken) {
    throw new AppError('API_KEY_NOT_SUPPORTED', 'error.API_KEY_NOT_SUPPORTED', 403);
  }
}

function getBearerToken(ctx: Parameters<Middleware>[0]) {
  const authorization = ctx.get('authorization').trim();

  if (!authorization) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization);

  if (!match?.[1]) {
    throw new AppError('API_KEY_INVALID', 'error.API_KEY_INVALID', 401);
  }

  return match[1].trim();
}

function throwAuthConflict(): never {
  throw new AppError('API_KEY_AUTH_CONFLICT', 'error.API_KEY_AUTH_CONFLICT', 400);
}
