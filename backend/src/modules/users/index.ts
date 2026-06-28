import { SystemPermission } from '@tilty/shared/access-control';

import { type BackendModule } from '../../core/module';
import { type AccessControlService } from '../access-control/access-control.service';
import { type AuthCookieConfig } from '../auth/auth.http';
import { requireStrongVerifiedPermission } from '../auth/auth.middleware';
import { type AuthService } from '../auth/auth.service';
import { type SsoService } from '../auth/auth.sso';
import { UserController } from './user.controller';
import { type UserService } from './user.service';

interface UsersModuleOptions {
  avatarUploadMaxBytes?: number;
  cookies: AuthCookieConfig;
  ssoService: SsoService;
}

export function createUsersModule(
  userService: UserService,
  accessControl: AccessControlService,
  authService: AuthService,
  options: UsersModuleOptions,
): BackendModule {
  const controller = new UserController(
    userService,
    accessControl,
    authService,
    options.ssoService,
    options.avatarUploadMaxBytes ?? 2 * 1024 * 1024,
  );
  const requireVerifiedUserList = requireStrongVerifiedPermission(
    authService,
    options.cookies,
    SystemPermission.UserList,
    'user_management',
  );
  const requireVerifiedUserAdmin = requireStrongVerifiedPermission(
    authService,
    options.cookies,
    SystemPermission.UserAdmin,
    'user_management',
  );

  return {
    name: 'users',
    prefix: '/api/users',
    routes: [
      {
        method: 'get',
        path: '/',
        handlers: [...requireVerifiedUserList, controller.list],
      },
      {
        method: 'get',
        path: '/:id/details',
        handlers: [...requireVerifiedUserAdmin, controller.details],
      },
      {
        method: 'patch',
        path: '/:id/mfa',
        handlers: [...requireVerifiedUserAdmin, controller.updateMfa],
      },
      {
        method: 'post',
        path: '/:id/totp/disable',
        handlers: [...requireVerifiedUserAdmin, controller.disableTotp],
      },
      {
        method: 'delete',
        path: '/:id/passkeys/:passkeyId',
        handlers: [...requireVerifiedUserAdmin, controller.deletePasskey],
      },
      {
        method: 'get',
        path: '/:id/devices',
        handlers: [...requireVerifiedUserAdmin, controller.devices],
      },
      {
        method: 'get',
        path: '/:id/sso-identities',
        handlers: [...requireVerifiedUserAdmin, controller.ssoIdentities],
      },
      {
        method: 'delete',
        path: '/:id/sso-identities/:providerId',
        handlers: [...requireVerifiedUserAdmin, controller.deleteSsoIdentity],
      },
      {
        method: 'post',
        path: '/:id/avatar',
        handlers: [...requireVerifiedUserAdmin, controller.avatar],
      },
      {
        method: 'delete',
        path: '/:id/avatar',
        handlers: [...requireVerifiedUserAdmin, controller.deleteAvatar],
      },
      {
        method: 'post',
        path: '/:id/profile-banner',
        handlers: [...requireVerifiedUserAdmin, controller.profileBanner],
      },
      {
        method: 'delete',
        path: '/:id/profile-banner',
        handlers: [...requireVerifiedUserAdmin, controller.deleteProfileBanner],
      },
      {
        method: 'post',
        path: '/:id/profile-background',
        handlers: [...requireVerifiedUserAdmin, controller.profileBackground],
      },
      {
        method: 'delete',
        path: '/:id/profile-background',
        handlers: [...requireVerifiedUserAdmin, controller.deleteProfileBackground],
      },
      {
        method: 'put',
        path: '/:id',
        handlers: [...requireVerifiedUserAdmin, controller.update],
      },
      {
        method: 'put',
        path: '/:id/roles',
        handlers: [...requireVerifiedUserAdmin, controller.updateRoles],
      },
    ],
  };
}
