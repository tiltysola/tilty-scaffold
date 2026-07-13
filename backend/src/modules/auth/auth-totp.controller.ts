import { type Middleware } from 'koa';

import { type AuthCookieConfig, getAuthToken } from './auth.http';
import { respondWithSensitiveOk } from './auth.responses';
import { totpSetupEnableSchema } from './auth.schemas';
import { type AuthService } from './auth.service';

export class AuthTotpController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  disable: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.disableTotp(token));
  };

  enable: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = totpSetupEnableSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(ctx, this.authService.enableTotp(token, input));
  };

  regenerateRecoveryCodes: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.regenerateTotpRecoveryCodes(token));
  };

  setup: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.createTotpSetup(token));
  };

  status: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.getTotpStatus(token));
  };
}
