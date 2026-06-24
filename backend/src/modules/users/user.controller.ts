import { type Middleware } from 'koa';
import { z } from 'zod';

import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import { type AccessControlService, type UserAccess } from '../access-control/access-control.service';
import { hashPassword } from '../auth/auth.crypto';
import {
  displayNameSchema,
  emailSchema,
  optionalPhoneNumberSchema,
  passwordSchema,
  usernameSchema,
} from '../auth/auth.schemas';
import { type UserModel } from './user.model';
import { type UserService } from './user.service';

const userIdSchema = z.uuid();
const defaultUserPageSize = 20;
const maxUserPageSize = 100;
const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(maxUserPageSize).default(defaultUserPageSize),
});
const updateUserRolesSchema = z.object({
  roleKeys: z.array(z.string().trim().min(1).max(64)).max(50),
});
const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  displayName: displayNameSchema.optional(),
  email: emailSchema.optional(),
  emailVerified: z.boolean().optional(),
  phoneNumber: optionalPhoneNumberSchema,
  phoneVerified: z.boolean().optional(),
  password: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    passwordSchema.optional(),
  ),
  available: z.boolean().optional(),
  roleKeys: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
});

export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
  ) {}

  list: Middleware = async (ctx) => {
    const pagination = listUsersQuerySchema.parse(ctx.query);
    const result = await this.userService.listUsers(pagination);
    const users = result.users;
    const accessByUserId = await this.accessControl.getUsersAccess(users.map((user) => user.id));

    ctx.body = ok({
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pagination.pageSize),
      },
      roles: await this.accessControl.listRoles(),
      users: users.map((user) => toUserListItem(user, accessByUserId.get(user.id))),
    });
  };

  updateRoles: Middleware = async (ctx) => {
    const userId = userIdSchema.parse((ctx as { params?: Record<string, string> }).params?.id);
    const input = updateUserRolesSchema.parse(ctx.request.body);
    const user = await this.userService.findManagedById(userId);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User was not found.', 404);
    }

    const access = await this.accessControl.replaceUserRoles(user.id, input.roleKeys);

    ctx.body = ok(toUserListItem(user, access));
  };

  update: Middleware = async (ctx) => {
    const userId = userIdSchema.parse((ctx as { params?: Record<string, string> }).params?.id);
    const input = updateUserSchema.parse(ctx.request.body);
    const user = await this.userService.findManagedById(userId);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User was not found.', 404);
    }

    const { password, roleKeys, ...userInput } = input;
    const credentials = password ? await hashPassword(password) : undefined;
    let access: UserAccess | undefined;
    const updatedUser = await this.userService.transaction(async (transaction) => {
      if (
        Object.prototype.hasOwnProperty.call(userInput, 'available') &&
        user.available &&
        userInput.available === false
      ) {
        await this.accessControl.assertCanDisableUser(user.id, { transaction });
      }

      const managedUser = await this.userService.updateManagedUser(
        user,
        {
          ...userInput,
          ...(credentials ?? {}),
        },
        { transaction },
      );

      if (roleKeys !== undefined) {
        access = await this.accessControl.replaceUserRoles(managedUser.id, roleKeys, {
          transaction,
        });
      }

      return managedUser;
    });

    ctx.body = ok(toUserListItem(updatedUser, access ?? (await this.accessControl.getUserAccess(updatedUser.id))));
  };
}

function toUserListItem(user: UserModel, access: UserAccess = { roles: [], permissions: [] }) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
    phoneVerified: user.phoneVerified,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    available: user.available,
    roles: access.roles,
    permissions: access.permissions,
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
  };
}

function toIsoString(value: Date) {
  return value.toISOString();
}
