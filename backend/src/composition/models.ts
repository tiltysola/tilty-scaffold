import { type Sequelize } from 'sequelize';

import {
  initAccessControlModels,
  type PermissionModel,
  type RoleModel,
  type RolePermissionModel,
  type UserRoleModel,
} from '../modules/access-control/access-control.model';
import { type AuthPasskeyModel, initAuthPasskeyModel } from '../modules/auth/auth-passkey.model';
import { type AuthSessionModel, initAuthSessionModel } from '../modules/auth/auth-session.model';
import {
  initSsoIdentityModel,
  initUserModel,
  type SsoIdentityModel,
  type UserModel,
} from '../modules/users/user.model';

export interface Models {
  authPasskey: typeof AuthPasskeyModel;
  authSession: typeof AuthSessionModel;
  permission: typeof PermissionModel;
  role: typeof RoleModel;
  rolePermission: typeof RolePermissionModel;
  ssoIdentity: typeof SsoIdentityModel;
  user: typeof UserModel;
  userRole: typeof UserRoleModel;
}

export function initModels(sequelize: Sequelize): Models {
  const user = initUserModel(sequelize);
  const authPasskey = initAuthPasskeyModel(sequelize);
  const authSession = initAuthSessionModel(sequelize);
  const accessControlModels = initAccessControlModels(sequelize);

  return {
    authPasskey,
    authSession,
    permission: accessControlModels.permission,
    role: accessControlModels.role,
    rolePermission: accessControlModels.rolePermission,
    ssoIdentity: initSsoIdentityModel(sequelize),
    user,
    userRole: accessControlModels.userRole,
  };
}
