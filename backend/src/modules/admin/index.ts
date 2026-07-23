import { type Middleware } from 'koa';

import { SystemPermission } from '@tilty/shared/access-control';
import { AuthVerificationPurpose } from '@tilty/shared/auth';
import { defaultFileUploadMaxBytes } from '@tilty/shared/setup';

import { type BackendModule } from '../../core/module';
import { type AccessControlService, assertPermission } from '../access-control/access-control.service';
import { type ApiKeyService } from '../api-keys/api-key.service';
import { type AuthCookieConfig } from '../auth/auth.http';
import {
  requireCookieAuthenticated,
  requireStrongVerifiedCookiePermission,
  requireSudoAccess,
} from '../auth/auth.middleware';
import { type AuthService } from '../auth/auth.service';
import { type SsoService } from '../auth/auth.sso';
import { type UserService } from '../users/user.service';
import { AdminApiKeyController } from './admin-api-key.controller';
import { AdminSystemSettingsController } from './admin-system-settings.controller';
import { requireAssignableUserRoles, requireManageableUserTarget } from './admin-user.helpers';
import { AdminUserDirectoryController } from './admin-user-directory.controller';
import { AdminUserMediaController } from './admin-user-media.controller';
import { AdminUserProfileController } from './admin-user-profile.controller';
import { AdminUserSecurityController } from './admin-user-security.controller';

interface AdminModuleOptions {
  apiKeyService: ApiKeyService;
  cookies: AuthCookieConfig;
  fileUploadMaxBytes?: number;
  ssoService: SsoService;
}

export function createAdminModule(
  userService: UserService,
  accessControl: AccessControlService,
  authService: AuthService,
  options: AdminModuleOptions,
): BackendModule {
  const apiKeyController = new AdminApiKeyController(options.apiKeyService);
  const systemSettingsController = new AdminSystemSettingsController();
  const userDirectoryController = new AdminUserDirectoryController(userService, accessControl);
  const userMediaController = new AdminUserMediaController(
    userService,
    accessControl,
    authService,
    options.ssoService,
    options.fileUploadMaxBytes ?? defaultFileUploadMaxBytes,
  );
  const userProfileController = new AdminUserProfileController(
    userService,
    accessControl,
    authService,
    options.ssoService,
  );
  const userSecurityController = new AdminUserSecurityController(userService, authService, options.ssoService);
  const requireAdminApiKeyManagement = [
    requireCookieAuthenticated(authService, options.cookies),
    (async (ctx, next) => {
      assertPermission(ctx.state.auth.access, SystemPermission.UserAdmin);
      await next();
    }) satisfies Middleware,
    requireSudoAccess(authService, options.cookies, AuthVerificationPurpose.ManageApiKey),
  ];
  const requireVerifiedSystemSettingsAccess = requireStrongVerifiedCookiePermission(
    authService,
    options.cookies,
    SystemPermission.Root,
    AuthVerificationPurpose.SystemSettings,
  );
  const requireVerifiedUserList = requireStrongVerifiedCookiePermission(
    authService,
    options.cookies,
    SystemPermission.UserList,
    AuthVerificationPurpose.UserManagement,
  );
  const requireVerifiedUserAdmin = requireStrongVerifiedCookiePermission(
    authService,
    options.cookies,
    SystemPermission.UserAdmin,
    AuthVerificationPurpose.UserManagement,
  );
  const requireManageableUser = requireManageableUserTarget(accessControl);
  const requireAssignableRoles = requireAssignableUserRoles(accessControl);

  return {
    name: 'admin',
    prefix: '/api/admin',
    routes: [
      {
        method: 'get',
        path: '/api-keys',
        handlers: [...requireAdminApiKeyManagement, apiKeyController.list],
      },
      {
        method: 'post',
        path: '/api-keys/:id/revoke',
        handlers: [...requireAdminApiKeyManagement, apiKeyController.revoke],
      },
      {
        method: 'get',
        path: '/system-settings/',
        handlers: [...requireVerifiedSystemSettingsAccess, systemSettingsController.get],
      },
      {
        method: 'put',
        path: '/system-settings/',
        handlers: [...requireVerifiedSystemSettingsAccess, systemSettingsController.update],
      },
      {
        method: 'get',
        path: '/users/',
        handlers: [...requireVerifiedUserList, userDirectoryController.list],
      },
      {
        method: 'get',
        path: '/users/:id/details',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userProfileController.details],
      },
      {
        method: 'put',
        path: '/users/:id',
        handlers: [
          ...requireVerifiedUserAdmin,
          requireManageableUser,
          requireAssignableRoles,
          userProfileController.update,
        ],
      },
      {
        method: 'put',
        path: '/users/:id/roles',
        handlers: [
          ...requireVerifiedUserAdmin,
          requireManageableUser,
          requireAssignableRoles,
          userProfileController.updateRoles,
        ],
      },
      {
        method: 'patch',
        path: '/users/:id/mfa',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userSecurityController.updateMfa],
      },
      {
        method: 'post',
        path: '/users/:id/totp/disable',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userSecurityController.disableTotp],
      },
      {
        method: 'delete',
        path: '/users/:id/passkeys/:passkeyId',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userSecurityController.deletePasskey],
      },
      {
        method: 'get',
        path: '/users/:id/devices',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userSecurityController.devices],
      },
      {
        method: 'delete',
        path: '/users/:id/devices',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userSecurityController.revokeDevices],
      },
      {
        method: 'delete',
        path: '/users/:id/devices/:sessionId',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userSecurityController.revokeDevice],
      },
      {
        method: 'get',
        path: '/users/:id/sso-identities',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userSecurityController.ssoIdentities],
      },
      {
        method: 'delete',
        path: '/users/:id/sso-identities/:providerId',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userSecurityController.deleteSsoIdentity],
      },
      {
        method: 'post',
        path: '/users/:id/avatar',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userMediaController.uploadAvatar],
      },
      {
        method: 'delete',
        path: '/users/:id/avatar',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userMediaController.deleteAvatar],
      },
      {
        method: 'post',
        path: '/users/:id/profile-banner',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userMediaController.uploadProfileBanner],
      },
      {
        method: 'delete',
        path: '/users/:id/profile-banner',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userMediaController.deleteProfileBanner],
      },
      {
        method: 'post',
        path: '/users/:id/profile-background',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userMediaController.uploadProfileBackground],
      },
      {
        method: 'delete',
        path: '/users/:id/profile-background',
        handlers: [...requireVerifiedUserAdmin, requireManageableUser, userMediaController.deleteProfileBackground],
      },
    ],
  };
}
