import { type Middleware } from 'koa';

import { AppError } from '../../core/errors';

type AuthCookieSameSite = 'lax' | 'none' | 'strict';
type AuthCookieSecurePolicy = 'auto' | 'false' | 'true';

interface AuthCookieSession {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthCookieConfig {
  accessTokenName: string;
  refreshTokenName: string;
  sameSite: AuthCookieSameSite;
  secure: AuthCookieSecurePolicy;
}

export const defaultAuthCookieConfig: AuthCookieConfig = {
  accessTokenName: 'tilty_scaffold_access_token',
  refreshTokenName: 'tilty_scaffold_refresh_token',
  sameSite: 'lax',
  secure: 'auto',
};

export function getAuthToken(ctx: Parameters<Middleware>[0], config: AuthCookieConfig) {
  const cookieToken = ctx.cookies.get(config.accessTokenName);

  if (!cookieToken) {
    throw new AppError('AUTH_REQUIRED', 'Authentication is required.', 401);
  }

  return cookieToken;
}

export function getAuthRequestContext(ctx: Parameters<Middleware>[0]) {
  return {
    deviceId: ctx.get('x-device-id') || undefined,
    ipAddress: ctx.ip,
    userAgent: ctx.get('user-agent'),
  };
}

export function setAuthCookies(ctx: Parameters<Middleware>[0], session: AuthCookieSession, config: AuthCookieConfig) {
  setAuthCookie(ctx, config.accessTokenName, session.accessToken, session.accessTokenExpiresAt, config);
  setAuthCookie(ctx, config.refreshTokenName, session.refreshToken, session.refreshTokenExpiresAt, config);
}

export function clearAuthCookies(ctx: Parameters<Middleware>[0], config: AuthCookieConfig) {
  clearAuthCookie(ctx, config.accessTokenName, config);
  clearAuthCookie(ctx, config.refreshTokenName, config);
}

export function setSensitiveAuthResponseHeaders(ctx: Parameters<Middleware>[0]) {
  ctx.set('Cache-Control', 'no-store');
  ctx.set('Pragma', 'no-cache');
}

function setAuthCookie(
  ctx: Parameters<Middleware>[0],
  name: string,
  token: string,
  expiresAt: string,
  config: AuthCookieConfig,
) {
  ctx.cookies.set(name, token, {
    expires: new Date(expiresAt),
    httpOnly: true,
    overwrite: true,
    path: '/',
    sameSite: config.sameSite,
    secure: isSecureRequest(ctx, config.secure),
  });
}

function clearAuthCookie(ctx: Parameters<Middleware>[0], name: string, config: AuthCookieConfig) {
  ctx.cookies.set(name, '', {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    overwrite: true,
    path: '/',
    sameSite: config.sameSite,
    secure: isSecureRequest(ctx, config.secure),
  });
}

function isSecureRequest(ctx: Parameters<Middleware>[0], policy: AuthCookieSecurePolicy) {
  if (policy !== 'auto') {
    return policy === 'true';
  }

  return ctx.secure;
}
