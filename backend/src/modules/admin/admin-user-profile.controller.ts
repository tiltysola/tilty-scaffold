import { type Middleware } from 'koa';
import { z } from 'zod';

import { getRouteParams, ok } from '../../core/http';
import { type AccessControlService, type UserAccess } from '../access-control/access-control.service';
import { hashPassword } from '../auth/auth.crypto';
import {
  displayNameSchema,
  emailSchema,
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
import { type UserService } from '../users/user.service';
import {
  getCurrentSessionIdForUser,
  requireManagedUser,
  requireManagedUserById,
  toManagedUserDetails,
  userIdParamsSchema,
} from './admin-user.helpers';
import { toUserListItem } from './admin-user.presenters';

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

export class AdminUserProfileController {
  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
  ) {}

  details: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);

    ctx.body = ok(
      await toManagedUserDetails(
        this.accessControl,
        this.authService,
        this.ssoService,
        user,
        getCurrentSessionIdForUser(ctx, user.id),
      ),
    );
  };

  update: Middleware = async (ctx) => {
    const userId = userIdParamsSchema.parse(getRouteParams(ctx)).id;
    const input = updateUserSchema.parse(ctx.request.body);
    const user = await requireManagedUserById(this.userService, userId);
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

  updateRoles: Middleware = async (ctx) => {
    const userId = userIdParamsSchema.parse(getRouteParams(ctx)).id;
    const input = updateUserRolesSchema.parse(ctx.request.body);
    const user = await requireManagedUserById(this.userService, userId);
    const access = await this.accessControl.replaceUserRoles(user.id, input.roleKeys);

    ctx.body = ok(toUserListItem(user, access));
  };
}
