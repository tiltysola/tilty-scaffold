import { type Middleware } from 'koa';

import { ok } from '../../core/http';
import { getRequestLocale } from '../../middleware/locale';
import {
  type AuthCookieConfig,
  getAuthRequestContext,
  setAuthCookies,
  setSensitiveAuthResponseHeaders,
} from './auth.http';
import { respondWithSensitiveOk, toSessionResponse } from './auth.responses';
import { registerSchema, resetPasswordSchema, sendEmailVerificationSchema } from './auth.schemas';
import { type AuthService } from './auth.service';

export class AuthAccountController {
  constructor(
    private readonly authService: AuthService,
    private readonly fileUploadMaxBytes: number,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  config: Middleware = async (ctx) => {
    ctx.body = ok({
      fileUploadMaxBytes: this.fileUploadMaxBytes,
      ...this.authService.getPublicConfig(),
    });
  };

  register: Middleware = async (ctx) => {
    const input = registerSchema.parse(ctx.request.body);
    const session = await this.authService.register(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.status = 201;
    ctx.body = ok(toSessionResponse(session));
  };

  resetPassword: Middleware = async (ctx) => {
    const input = resetPasswordSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(ctx, this.authService.resetPassword(input));
  };

  sendPasswordResetEmailVerification: Middleware = async (ctx) => {
    const input = sendEmailVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendPasswordResetEmailVerification(input, getRequestLocale(ctx));

    ctx.body = ok(result);
  };

  sendRegistrationEmailVerification: Middleware = async (ctx) => {
    const input = sendEmailVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendRegistrationEmailVerification(input, getRequestLocale(ctx));

    ctx.body = ok(result);
  };
}
