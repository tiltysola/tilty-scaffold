import { type Middleware } from 'koa';
import { z } from 'zod';

import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import { readMultipartFile } from '../../infra/multipart';
import { getRequestLocale } from '../../middleware/locale';
import { type AccessControlService, type UserAccess } from '../access-control/access-control.service';
import { hashPassword } from '../auth/auth.crypto';
import {
  authDeviceSessionIdSchema,
  authPasskeyIdSchema,
  displayNameSchema,
  emailSchema,
  mfaSettingsSchema,
  optionalPhoneNumberSchema,
  passwordSchema,
  profileBioSchema,
  profileBirthdaySchema,
  profileGenderSchema,
  profileLocationSchema,
  profileWebsiteUrlSchema,
  usernameSchema,
} from '../auth/auth.schemas';
import { type AuthService } from '../auth/auth.service';
import { type SsoService } from '../auth/auth.sso';
import { type UserModel } from './user.model';
import { type UserService } from './user.service';

const userIdSchema = z.uuid();
const userIdParamsSchema = z.object({
  id: userIdSchema,
});
const userSsoIdentityParamsSchema = z.object({
  id: userIdSchema,
  providerId: z.string().trim().min(1).max(64),
});
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
  gender: profileGenderSchema,
  birthday: profileBirthdaySchema,
  bio: profileBioSchema,
  location: profileLocationSchema,
  websiteUrl: profileWebsiteUrlSchema,
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
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
    private readonly avatarUploadMaxBytes: number,
  ) {}

  list: Middleware = async (ctx) => {
    const pagination = listUsersQuerySchema.parse(ctx.query);
    const result = await this.userService.listUsers(pagination);
    const users = result.users;
    const accessByUserId = await this.accessControl.getUsersAccess(users.map((user) => user.id));
    const locale = getRequestLocale(ctx);

    ctx.body = ok({
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pagination.pageSize),
      },
      roles: await this.accessControl.listRoles(locale),
      users: users.map((user) => toUserListItem(user, accessByUserId.get(user.id))),
    });
  };

  updateRoles: Middleware = async (ctx) => {
    const userId = userIdParamsSchema.parse((ctx as { params?: Record<string, string> }).params).id;
    const input = updateUserRolesSchema.parse(ctx.request.body);
    const user = await this.userService.findManagedById(userId);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'error.USER_NOT_FOUND', 404);
    }

    const access = await this.accessControl.replaceUserRoles(user.id, input.roleKeys);

    ctx.body = ok(toUserListItem(user, access));
  };

  update: Middleware = async (ctx) => {
    const userId = userIdParamsSchema.parse((ctx as { params?: Record<string, string> }).params).id;
    const input = updateUserSchema.parse(ctx.request.body);
    const user = await this.userService.findManagedById(userId);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'error.USER_NOT_FOUND', 404);
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

    if (credentials) {
      await this.authService.revokeManagedUserSessions(updatedUser.id);
    }

    ctx.body = ok(toUserListItem(updatedUser, access ?? (await this.accessControl.getUserAccess(updatedUser.id))));
  };

  details: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);

    ctx.body = ok(await this.toManagedUserDetails(user, getCurrentSessionIdForUser(ctx, user.id)));
  };

  updateMfa: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);
    const input = mfaSettingsSchema.parse(ctx.request.body);

    await this.authService.updateManagedMfaSettings(user, input);
    ctx.body = ok(await this.authService.getManagedSecurityState(user));
  };

  disableTotp: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);

    await this.authService.disableManagedTotp(user, getCurrentSessionIdForUser(ctx, user.id));
    ctx.body = ok(await this.authService.getManagedSecurityState(user));
  };

  deletePasskey: Middleware = async (ctx) => {
    const { id, passkeyId } = z
      .object({
        id: userIdSchema,
        ...authPasskeyIdSchema.shape,
      })
      .parse((ctx as { params?: Record<string, string> }).params);
    const user = await this.requireManagedUserById(id);

    await this.authService.deleteManagedPasskey(user, passkeyId, getCurrentSessionIdForUser(ctx, user.id));
    ctx.body = ok(await this.authService.getManagedSecurityState(user));
  };

  devices: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);

    ctx.body = ok(await this.authService.listManagedDeviceSessions(user, getCurrentSessionIdForUser(ctx, user.id)));
  };

  revokeDevice: Middleware = async (ctx) => {
    const { id, sessionId } = z
      .object({
        id: userIdSchema,
        ...authDeviceSessionIdSchema.shape,
      })
      .parse((ctx as { params?: Record<string, string> }).params);
    const user = await this.requireManagedUserById(id);

    ctx.body = ok(
      await this.authService.revokeManagedDeviceSession(user, sessionId, getCurrentSessionIdForUser(ctx, user.id)),
    );
  };

  revokeDevices: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);

    ctx.body = ok(await this.authService.revokeManagedDeviceSessions(user, getCurrentSessionIdForUser(ctx, user.id)));
  };

  ssoIdentities: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);

    ctx.body = ok({
      identities: await this.ssoService.listUserIdentities(user.id),
    });
  };

  deleteSsoIdentity: Middleware = async (ctx) => {
    const { id, providerId } = userSsoIdentityParamsSchema.parse((ctx as { params?: Record<string, string> }).params);
    const user = await this.requireManagedUserById(id);

    await this.userService.deleteSsoIdentity(user.id, providerId);
    ctx.body = ok({
      identities: await this.ssoService.listUserIdentities(user.id),
    });
  };

  avatar: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);
    const file = await readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName: 'avatar',
      maxBytes: this.avatarUploadMaxBytes,
    });
    const updatedUser = await this.authService.uploadManagedAvatar(user, file);

    ctx.body = ok(await this.toManagedUserDetails(updatedUser, getCurrentSessionIdForUser(ctx, updatedUser.id)));
  };

  deleteAvatar: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);
    const updatedUser = await this.authService.deleteManagedAvatar(user);

    ctx.body = ok(await this.toManagedUserDetails(updatedUser, getCurrentSessionIdForUser(ctx, updatedUser.id)));
  };

  profileBanner: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);
    const file = await readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName: 'profileBanner',
      maxBytes: this.avatarUploadMaxBytes,
    });
    const updatedUser = await this.authService.uploadManagedProfileBanner(user, file);

    ctx.body = ok(await this.toManagedUserDetails(updatedUser, getCurrentSessionIdForUser(ctx, updatedUser.id)));
  };

  deleteProfileBanner: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);
    const updatedUser = await this.authService.deleteManagedProfileBanner(user);

    ctx.body = ok(await this.toManagedUserDetails(updatedUser, getCurrentSessionIdForUser(ctx, updatedUser.id)));
  };

  profileBackground: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);
    const file = await readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName: 'profileBackground',
      maxBytes: this.avatarUploadMaxBytes,
    });
    const updatedUser = await this.authService.uploadManagedProfileBackground(user, file);

    ctx.body = ok(await this.toManagedUserDetails(updatedUser, getCurrentSessionIdForUser(ctx, updatedUser.id)));
  };

  deleteProfileBackground: Middleware = async (ctx) => {
    const user = await this.requireManagedUser(ctx);
    const updatedUser = await this.authService.deleteManagedProfileBackground(user);

    ctx.body = ok(await this.toManagedUserDetails(updatedUser, getCurrentSessionIdForUser(ctx, updatedUser.id)));
  };

  private async requireManagedUser(ctx: Parameters<Middleware>[0]) {
    const userId = userIdParamsSchema.parse((ctx as { params?: Record<string, string> }).params).id;

    return this.requireManagedUserById(userId);
  }

  private async requireManagedUserById(userId: string) {
    const user = await this.userService.findManagedById(userId);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'error.USER_NOT_FOUND', 404);
    }

    return user;
  }

  private async toManagedUserDetails(user: UserModel, currentSessionId?: string | undefined) {
    return {
      user: toUserListItem(user, await this.accessControl.getUserAccess(user.id)),
      security: await this.authService.getManagedSecurityState(user),
      devices: (await this.authService.listManagedDeviceSessions(user, currentSessionId)).sessions,
      ssoIdentities: await this.ssoService.listUserIdentities(user.id),
    };
  }
}

function toUserListItem(user: UserModel, access: UserAccess = { roles: [], permissions: [] }) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    ...(user.gender ? { gender: user.gender } : {}),
    ...(user.birthday ? { birthday: user.birthday } : {}),
    ...(user.bio ? { bio: user.bio } : {}),
    ...(user.location ? { location: user.location } : {}),
    ...(user.websiteUrl ? { websiteUrl: user.websiteUrl } : {}),
    email: user.email,
    emailVerified: user.emailVerified,
    ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
    phoneVerified: user.phoneVerified,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.profileBannerUrl ? { profileBannerUrl: user.profileBannerUrl } : {}),
    ...(user.profileBackgroundUrl ? { profileBackgroundUrl: user.profileBackgroundUrl } : {}),
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

function getCurrentSessionIdForUser(ctx: Parameters<Middleware>[0], userId: string) {
  const auth = ctx.state.auth as { sessionId?: string; user?: { id?: string } } | undefined;

  return auth?.user?.id === userId ? auth.sessionId : undefined;
}
