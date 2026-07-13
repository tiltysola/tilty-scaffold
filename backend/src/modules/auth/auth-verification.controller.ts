import { type Middleware } from 'koa';

import { ok } from '../../core/http';
import { getRequestLocale } from '../../middleware/locale';
import {
  type AuthCookieConfig,
  getAuthRequestContext,
  getAuthToken,
  setAuthCookies,
  setSensitiveAuthResponseHeaders,
} from './auth.http';
import { respondWithSensitiveOk, toSessionResponse } from './auth.responses';
import {
  verificationChallengeCreateSchema,
  verificationCodeSendSchema,
  verificationConfirmSchema,
  verificationTokenSchema,
} from './auth.schemas';
import { type AuthService } from './auth.service';

export class AuthVerificationController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  createChallenge: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = verificationChallengeCreateSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(
      ctx,
      this.authService.createVerificationChallenge(token, input.purpose, getAuthRequestContext(ctx)),
    );
  };

  createPasskeyOptions: Middleware = async (ctx) => {
    const input = verificationTokenSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(
      ctx,
      this.authService.createPasskeyVerificationOptions(input.verificationToken, getAuthRequestContext(ctx)),
    );
  };

  sendCode: Middleware = async (ctx) => {
    const input = verificationCodeSendSchema.parse(ctx.request.body);
    const token = ctx.cookies.get(this.cookieConfig.accessTokenName);

    await respondWithSensitiveOk(
      ctx,
      this.authService.sendVerificationCode(token, input, getAuthRequestContext(ctx), getRequestLocale(ctx)),
    );
  };

  verifyChallenge: Middleware = async (ctx) => {
    const input = verificationConfirmSchema.parse(ctx.request.body);
    const result = await this.authService.verifyAuthenticationChallenge(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    if ('accessToken' in result) {
      setAuthCookies(ctx, result, this.cookieConfig);
      ctx.body = ok(toSessionResponse(result));
      return;
    }

    ctx.body = ok(result);
  };
}
