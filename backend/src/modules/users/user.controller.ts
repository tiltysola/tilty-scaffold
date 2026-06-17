import { type Middleware } from 'koa';
import { z } from 'zod';

import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import { type AccessControlService, type UserAccess } from '../access-control/access-control.service';
import { type UserModel } from './user.model';
import { type UserService } from './user.service';

const userIdSchema = z.string().uuid();
const updateUserRolesSchema = z.object({
  roleKeys: z.array(z.string().trim().min(1).max(64)).max(50),
});

export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
  ) {}

  list: Middleware = async (ctx) => {
    const users = await this.userService.listUsers();
    const accessByUserId = await this.accessControl.getUsersAccess(users.map((user) => user.id));

    ctx.body = ok({
      roles: await this.accessControl.listRoles(),
      users: users.map((user) => toUserListItem(user, accessByUserId.get(user.id))),
    });
  };

  updateRoles: Middleware = async (ctx) => {
    const userId = userIdSchema.parse((ctx as { params?: Record<string, string> }).params?.id);
    const input = updateUserRolesSchema.parse(ctx.request.body);
    const user = await this.userService.findById(userId);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User was not found.', 404);
    }

    const access = await this.accessControl.replaceUserRoles(user.id, input.roleKeys);

    ctx.body = ok(toUserListItem(user, access));
  };
}

function toUserListItem(user: UserModel, access: UserAccess = { roles: [], permissions: [] }) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    available: user.available,
    roles: access.roles,
    permissions: access.permissions,
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
  };
}

function toIsoString(value: Date) {
  return value.toISOString();
}
