import { type Middleware } from 'koa';

import { type AuthCookieConfig, getAuthToken } from './auth.http';
import { respondWithSensitiveOk } from './auth.responses';
import { authDeviceSessionIdSchema } from './auth.schemas';
import { type AuthService } from './auth.service';

export class AuthDeviceController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  list: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.listDeviceSessions(token));
  };

  revoke: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const { sessionId } = authDeviceSessionIdSchema.parse(ctx.params);

    await respondWithSensitiveOk(ctx, this.authService.revokeDeviceSession(token, sessionId));
  };

  revokeOthers: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    await respondWithSensitiveOk(ctx, this.authService.revokeOtherDeviceSessions(token));
  };
}
