import { type Middleware } from 'koa';

import { ok } from '../../core/http';
import {
  type AuthCookieConfig,
  getAuthRequestContext,
  getAuthToken,
  setAuthCookies,
  setSensitiveAuthResponseHeaders,
} from './auth.http';
import {
  getQueryStringValue,
  isVerificationRequiredResponse,
  respondWithSensitiveOk,
  toSessionResponse,
} from './auth.responses';
import { ssoBindAccountSchema, ssoCreateAccountSchema, ssoSessionSchema, ssoStartQuerySchema } from './auth.schemas';
import { type AuthService } from './auth.service';
import { type SsoCallbackInput, type SsoService } from './auth.sso';

export class AuthSsoController {
  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  bindAccount: Middleware = async (ctx) => {
    const input = ssoBindAccountSchema.parse(ctx.request.body);
    const result = await this.ssoService.bindSsoAccount(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    if (isVerificationRequiredResponse(result)) {
      ctx.body = ok(result);
      return;
    }

    setAuthCookies(ctx, result, this.cookieConfig);
    ctx.body = ok(toSessionResponse(result));
  };

  bindStart: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const { user } = await this.authService.requireSsoBindingAccess(token);
    const query = ssoStartQuerySchema.parse(ctx.query);
    const loginUrl = await this.ssoService.createBindUrl(user.id, query.redirect, query.providerId);

    ctx.redirect(loginUrl);
  };

  callback: Middleware = async (ctx) => {
    const redirectUrl = await this.ssoService.handleCallback(
      {
        code: getQueryStringValue(ctx.query.code),
        error: getQueryStringValue(ctx.query.error),
        errorDescription: getQueryStringValue(ctx.query.error_description),
        state: getQueryStringValue(ctx.query.state),
      } satisfies SsoCallbackInput,
      getAuthRequestContext(ctx),
    );

    ctx.redirect(redirectUrl);
  };

  config: Middleware = async (ctx) => {
    ctx.body = ok(this.ssoService.getPublicConfig());
  };

  createAccount: Middleware = async (ctx) => {
    const input = ssoCreateAccountSchema.parse(ctx.request.body);
    const session = await this.ssoService.createSsoAccount(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.status = 201;
    ctx.body = ok(toSessionResponse(session));
  };

  identities: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const { user } = await this.authService.authenticate(token);

    await respondWithSensitiveOk(ctx, {
      identities: await this.ssoService.listUserIdentities(user.id),
    });
  };

  session: Middleware = async (ctx) => {
    const input = ssoSessionSchema.parse(ctx.request.body);
    const session = await this.ssoService.exchangeHandoffToken(input.token, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.body = ok(toSessionResponse(session));
  };

  start: Middleware = async (ctx) => {
    const query = ssoStartQuerySchema.parse(ctx.query);
    const loginUrl = await this.ssoService.createLoginUrl(query.redirect, query.providerId);

    ctx.redirect(loginUrl);
  };
}
