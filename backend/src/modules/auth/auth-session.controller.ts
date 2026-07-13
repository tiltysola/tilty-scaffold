import { type Middleware } from 'koa';

import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import {
  type AuthCookieConfig,
  clearAuthCookies,
  getAuthRequestContext,
  setAuthCookies,
  setSensitiveAuthResponseHeaders,
} from './auth.http';
import { isAuthenticationFailure, isVerificationRequiredResponse, toSessionResponse } from './auth.responses';
import { loginSchema } from './auth.schemas';
import { type AuthService } from './auth.service';

export class AuthSessionController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  login: Middleware = async (ctx) => {
    const input = loginSchema.parse(ctx.request.body);
    const result = await this.authService.login(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    if (isVerificationRequiredResponse(result)) {
      ctx.body = ok(result);
      return;
    }

    setAuthCookies(ctx, result, this.cookieConfig);
    ctx.body = ok(toSessionResponse(result));
  };

  logout: Middleware = async (ctx) => {
    const refreshToken = ctx.cookies.get(this.cookieConfig.refreshTokenName);

    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }

    setSensitiveAuthResponseHeaders(ctx);
    clearAuthCookies(ctx, this.cookieConfig);
    ctx.body = ok({ signedOut: true });
  };

  refresh: Middleware = async (ctx) => {
    setSensitiveAuthResponseHeaders(ctx);

    const refreshToken = ctx.cookies.get(this.cookieConfig.refreshTokenName);

    if (!refreshToken) {
      clearAuthCookies(ctx, this.cookieConfig);
      throw new AppError('AUTH_REFRESH_TOKEN_REQUIRED', 'error.AUTH_REFRESH_TOKEN_REQUIRED', 401);
    }

    let session: Awaited<ReturnType<AuthService['refreshSession']>>;

    try {
      session = await this.authService.refreshSession(refreshToken, getAuthRequestContext(ctx));
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        clearAuthCookies(ctx, this.cookieConfig);
      }

      throw error;
    }

    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.body = ok(toSessionResponse(session));
  };
}
