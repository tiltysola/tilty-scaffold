import { type Middleware } from 'koa';

import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import { readMultipartFile } from '../../infra/multipart';
import {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  sendEmailVerificationSchema,
  ssoBindAccountSchema,
  ssoCreateAccountSchema,
  ssoSessionSchema,
  ssoStartQuerySchema,
  updateCurrentUserSchema,
} from './auth.schemas';
import { type AuthService } from './auth.service';
import { type SsoCallbackInput, type SsoService } from './auth.sso';

type AuthCookieSameSite = 'lax' | 'none' | 'strict';
type AuthCookieSecurePolicy = 'auto' | 'false' | 'true';

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

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
    private readonly avatarUploadMaxBytes: number,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  config: Middleware = async (ctx) => {
    ctx.body = ok(this.authService.getPublicConfig());
  };

  register: Middleware = async (ctx) => {
    const input = registerSchema.parse(ctx.request.body);
    const session = await this.authService.register(input);

    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.status = 201;
    ctx.body = ok(toSessionResponse(session));
  };

  sendRegistrationEmailVerification: Middleware = async (ctx) => {
    const input = sendEmailVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendRegistrationEmailVerification(input);

    ctx.body = ok(result);
  };

  sendPasswordResetEmailVerification: Middleware = async (ctx) => {
    const input = sendEmailVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendPasswordResetEmailVerification(input);

    ctx.body = ok(result);
  };

  login: Middleware = async (ctx) => {
    const input = loginSchema.parse(ctx.request.body);
    const session = await this.authService.login(input);

    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.body = ok(toSessionResponse(session));
  };

  resetPassword: Middleware = async (ctx) => {
    const input = resetPasswordSchema.parse(ctx.request.body);
    const result = await this.authService.resetPassword(input);

    ctx.body = ok(result);
  };

  me: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const user = await this.authService.getCurrentUser(token);

    ctx.body = ok(user);
  };

  updateMe: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = updateCurrentUserSchema.parse(ctx.request.body);
    const user = await this.authService.updateCurrentUser(token, input);

    ctx.body = ok(user);
  };

  avatar: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const file = await readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName: 'avatar',
      maxBytes: this.avatarUploadMaxBytes,
    });
    const user = await this.authService.uploadAvatar(token, file);

    ctx.body = ok(user);
  };

  refresh: Middleware = async (ctx) => {
    const refreshToken = ctx.cookies.get(this.cookieConfig.refreshTokenName);

    if (!refreshToken) {
      throw new AppError('AUTH_REFRESH_TOKEN_REQUIRED', 'Refresh token is required.', 401);
    }

    const session = await this.authService.refreshSession(refreshToken);

    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.body = ok(toSessionResponse(session));
  };

  logout: Middleware = async (ctx) => {
    const refreshToken = ctx.cookies.get(this.cookieConfig.refreshTokenName);

    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }

    clearAuthCookies(ctx, this.cookieConfig);
    ctx.body = ok({ signedOut: true });
  };

  ssoConfig: Middleware = async (ctx) => {
    ctx.body = ok(this.ssoService.getPublicConfig());
  };

  ssoStart: Middleware = async (ctx) => {
    const query = ssoStartQuerySchema.parse(ctx.query);
    const loginUrl = await this.ssoService.createLoginUrl(query.redirect);

    ctx.redirect(loginUrl);
  };

  ssoCallback: Middleware = async (ctx) => {
    const redirectUrl = await this.ssoService.handleCallback({
      code: getQueryStringValue(ctx.query.code),
      error: getQueryStringValue(ctx.query.error),
      errorDescription: getQueryStringValue(ctx.query.error_description),
      state: getQueryStringValue(ctx.query.state),
    } satisfies SsoCallbackInput);

    ctx.redirect(redirectUrl);
  };

  ssoSession: Middleware = async (ctx) => {
    const input = ssoSessionSchema.parse(ctx.request.body);
    const session = await this.ssoService.exchangeHandoffToken(input.token);

    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.body = ok(toSessionResponse(session));
  };

  ssoCreateAccount: Middleware = async (ctx) => {
    const input = ssoCreateAccountSchema.parse(ctx.request.body);
    const session = await this.ssoService.createSsoAccount(input);

    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.status = 201;
    ctx.body = ok(toSessionResponse(session));
  };

  ssoBindAccount: Middleware = async (ctx) => {
    const input = ssoBindAccountSchema.parse(ctx.request.body);
    const session = await this.ssoService.bindSsoAccount(input);

    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.body = ok(toSessionResponse(session));
  };
}

type AuthenticatedSession = Awaited<ReturnType<AuthService['login']>>;

function toSessionResponse(session: AuthenticatedSession) {
  return {
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    user: session.user,
  };
}

export function getAuthToken(ctx: Parameters<Middleware>[0], config: AuthCookieConfig) {
  const cookieToken = ctx.cookies.get(config.accessTokenName);

  if (!cookieToken) {
    throw new AppError('AUTH_REQUIRED', 'Authentication is required.', 401);
  }

  return cookieToken;
}

function setAuthCookies(ctx: Parameters<Middleware>[0], session: AuthenticatedSession, config: AuthCookieConfig) {
  setAuthCookie(ctx, config.accessTokenName, session.accessToken, session.accessTokenExpiresAt, config);
  setAuthCookie(ctx, config.refreshTokenName, session.refreshToken, session.refreshTokenExpiresAt, config);
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

function clearAuthCookies(ctx: Parameters<Middleware>[0], config: AuthCookieConfig) {
  clearAuthCookie(ctx, config.accessTokenName, config);
  clearAuthCookie(ctx, config.refreshTokenName, config);
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

function getQueryStringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
