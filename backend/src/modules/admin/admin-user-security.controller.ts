import { type Middleware } from 'koa';
import { z } from 'zod';

import { getRouteParams, ok } from '../../core/http';
import { authDeviceSessionIdSchema, authPasskeyIdSchema, mfaSettingsSchema } from '../auth/auth.schemas';
import { type AuthService } from '../auth/auth.service';
import { type SsoService } from '../auth/auth.sso';
import { type UserService } from '../users/user.service';
import {
  getCurrentSessionIdForUser,
  requireManagedUser,
  requireManagedUserById,
  userIdSchema,
  userSsoIdentityParamsSchema,
} from './admin-user.helpers';

export class AdminUserSecurityController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
  ) {}

  deletePasskey: Middleware = async (ctx) => {
    const { id, passkeyId } = z
      .object({
        id: userIdSchema,
        ...authPasskeyIdSchema.shape,
      })
      .parse(getRouteParams(ctx));
    const user = await requireManagedUserById(this.userService, id);

    await this.authService.deleteManagedPasskey(user, passkeyId, getCurrentSessionIdForUser(ctx, user.id));
    ctx.body = ok(await this.authService.getManagedSecurityState(user));
  };

  deleteSsoIdentity: Middleware = async (ctx) => {
    const { id, providerId } = userSsoIdentityParamsSchema.parse(getRouteParams(ctx));
    const user = await requireManagedUserById(this.userService, id);

    await this.userService.deleteSsoIdentity(user.id, providerId);
    ctx.body = ok({
      identities: await this.ssoService.listUserIdentities(user.id),
    });
  };

  devices: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);

    ctx.body = ok(await this.authService.listManagedDeviceSessions(user, getCurrentSessionIdForUser(ctx, user.id)));
  };

  disableTotp: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);

    await this.authService.disableManagedTotp(user, getCurrentSessionIdForUser(ctx, user.id));
    ctx.body = ok(await this.authService.getManagedSecurityState(user));
  };

  revokeDevice: Middleware = async (ctx) => {
    const { id, sessionId } = z
      .object({
        id: userIdSchema,
        ...authDeviceSessionIdSchema.shape,
      })
      .parse(getRouteParams(ctx));
    const user = await requireManagedUserById(this.userService, id);

    ctx.body = ok(
      await this.authService.revokeManagedDeviceSession(user, sessionId, getCurrentSessionIdForUser(ctx, user.id)),
    );
  };

  revokeDevices: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);

    ctx.body = ok(await this.authService.revokeManagedDeviceSessions(user, getCurrentSessionIdForUser(ctx, user.id)));
  };

  ssoIdentities: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);

    ctx.body = ok({
      identities: await this.ssoService.listUserIdentities(user.id),
    });
  };

  updateMfa: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);
    const input = mfaSettingsSchema.parse(ctx.request.body);

    await this.authService.updateManagedMfaSettings(user, input);
    ctx.body = ok(await this.authService.getManagedSecurityState(user));
  };
}
