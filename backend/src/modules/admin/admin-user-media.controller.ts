import { type Middleware } from 'koa';

import { type ProfileImageFieldName } from '@tilty/shared/auth';

import { ok } from '../../core/http';
import { readMultipartFile } from '../../infra/multipart';
import { type AccessControlService } from '../access-control/access-control.service';
import { type AuthService } from '../auth/auth.service';
import { type SsoService } from '../auth/auth.sso';
import { type UserModel } from '../users/user.model';
import { type UserService } from '../users/user.service';
import { getCurrentSessionIdForUser, requireManagedUser, toManagedUserDetails } from './admin-user.helpers';

export class AdminUserMediaController {
  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
    private readonly fileUploadMaxBytes: number,
  ) {}

  uploadAvatar: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);
    const file = await this.readProfileImage(ctx, 'avatar');
    const updatedUser = await this.authService.uploadManagedAvatar(user, file);

    ctx.body = ok(await this.toDetails(ctx, updatedUser));
  };

  deleteAvatar: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);
    const updatedUser = await this.authService.deleteManagedAvatar(user);

    ctx.body = ok(await this.toDetails(ctx, updatedUser));
  };

  uploadProfileBanner: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);
    const file = await this.readProfileImage(ctx, 'profileBanner');
    const updatedUser = await this.authService.uploadManagedProfileBanner(user, file);

    ctx.body = ok(await this.toDetails(ctx, updatedUser));
  };

  deleteProfileBanner: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);
    const updatedUser = await this.authService.deleteManagedProfileBanner(user);

    ctx.body = ok(await this.toDetails(ctx, updatedUser));
  };

  uploadProfileBackground: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);
    const file = await this.readProfileImage(ctx, 'profileBackground');
    const updatedUser = await this.authService.uploadManagedProfileBackground(user, file);

    ctx.body = ok(await this.toDetails(ctx, updatedUser));
  };

  deleteProfileBackground: Middleware = async (ctx) => {
    const user = await requireManagedUser(this.userService, ctx);
    const updatedUser = await this.authService.deleteManagedProfileBackground(user);

    ctx.body = ok(await this.toDetails(ctx, updatedUser));
  };

  private readProfileImage(ctx: Parameters<Middleware>[0], fieldName: ProfileImageFieldName) {
    return readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName,
      maxBytes: this.fileUploadMaxBytes,
    });
  }

  private async toDetails(ctx: Parameters<Middleware>[0], user: UserModel) {
    return toManagedUserDetails(
      this.accessControl,
      this.authService,
      this.ssoService,
      user,
      getCurrentSessionIdForUser(ctx, user.id),
    );
  }
}
