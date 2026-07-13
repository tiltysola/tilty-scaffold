import { type Middleware } from 'koa';

import { type AuthCookieConfig, getAuthToken } from './auth.http';
import { respondWithSensitiveOk } from './auth.responses';
import { mfaSettingsSchema } from './auth.schemas';
import { type AuthService } from './auth.service';

export class AuthMfaController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  getSettings: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.getMfaSettings(token));
  };

  updateSettings: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = mfaSettingsSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(ctx, this.authService.updateMfaSettings(token, input));
  };
}
