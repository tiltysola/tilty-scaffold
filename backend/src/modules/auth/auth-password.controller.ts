import { type Middleware } from 'koa';

import { type AuthCookieConfig, getAuthToken } from './auth.http';
import { respondWithSensitiveOk } from './auth.responses';
import { changePasswordSchema } from './auth.schemas';
import { type AuthService } from './auth.service';

export class AuthPasswordController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  changePassword: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = changePasswordSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(ctx, this.authService.changeCurrentUserPassword(token, input));
  };
}
