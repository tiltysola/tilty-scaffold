import { type Middleware } from 'koa';
import { z } from 'zod';

import { AppError } from '../../core/errors';
import { getRouteParams } from '../../core/http';
import { type AccessControlService } from '../access-control/access-control.service';
import { type AuthService } from '../auth/auth.service';
import { type SsoService } from '../auth/auth.sso';
import { type UserModel } from '../users/user.model';
import { type UserService } from '../users/user.service';
import { toUserListItem } from './admin-user.presenters';

export const userIdSchema = z.uuid();

export const userIdParamsSchema = z.object({
  id: userIdSchema,
});

export const userSsoIdentityParamsSchema = z.object({
  id: userIdSchema,
  providerId: z.string().trim().min(1).max(64),
});

export function getCurrentSessionIdForUser(ctx: Parameters<Middleware>[0], userId: string) {
  const auth = ctx.state.auth as { sessionId?: string; user?: { id?: string } } | undefined;

  return auth?.user?.id === userId ? auth.sessionId : undefined;
}

export async function requireManagedUser(userService: UserService, ctx: Parameters<Middleware>[0]) {
  const userId = userIdParamsSchema.parse(getRouteParams(ctx)).id;

  return requireManagedUserById(userService, userId);
}

export async function requireManagedUserById(userService: UserService, userId: string) {
  const user = await userService.findManagedById(userId);

  if (!user) {
    throw new AppError('USER_NOT_FOUND', 'error.USER_NOT_FOUND', 404);
  }

  return user;
}

export async function toManagedUserDetails(
  accessControl: AccessControlService,
  authService: AuthService,
  ssoService: SsoService,
  user: UserModel,
  currentSessionId?: string | undefined,
) {
  return {
    user: toUserListItem(user, await accessControl.getUserAccess(user.id)),
    security: await authService.getManagedSecurityState(user),
    devices: (await authService.listManagedDeviceSessions(user, currentSessionId)).sessions,
    ssoIdentities: await ssoService.listUserIdentities(user.id),
  };
}
