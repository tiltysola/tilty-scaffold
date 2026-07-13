import { type Middleware } from 'koa';

import { type AuthCookieConfig, getAuthToken } from './auth.http';
import { respondWithSensitiveOk } from './auth.responses';
import { authPasskeyIdSchema, passkeyRegistrationVerifySchema } from './auth.schemas';
import { type AuthService } from './auth.service';

export class AuthPasskeyController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  createRegistrationOptions: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.createPasskeyRegistrationOptions(token));
  };

  delete: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const { passkeyId } = authPasskeyIdSchema.parse(ctx.params);

    await respondWithSensitiveOk(ctx, this.authService.deletePasskey(token, passkeyId));
  };

  list: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.listPasskeys(token));
  };

  verifyRegistration: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = passkeyRegistrationVerifySchema.parse(ctx.request.body);

    await respondWithSensitiveOk(ctx, this.authService.verifyPasskeyRegistration(token, input));
  };
}
