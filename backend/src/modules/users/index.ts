import { SystemPermission } from '@tilty/shared/access-control';

import { type BackendModule } from '../../core/module';
import { type AccessControlService } from '../access-control/access-control.service';
import { type AuthCookieConfig } from '../auth/auth.controller';
import { requirePermission } from '../auth/auth.middleware';
import { type AuthService } from '../auth/auth.service';
import { UserController } from './user.controller';
import { type UserService } from './user.service';

interface UsersModuleOptions {
  cookies: AuthCookieConfig;
}

export function createUsersModule(
  userService: UserService,
  accessControl: AccessControlService,
  authService: AuthService,
  options: UsersModuleOptions,
): BackendModule {
  const controller = new UserController(userService, accessControl);

  return {
    name: 'users',
    prefix: '/api/users',
    routes: [
      {
        method: 'get',
        path: '/',
        handlers: [requirePermission(authService, options.cookies, SystemPermission.UserList), controller.list],
      },
      {
        method: 'put',
        path: '/:id',
        handlers: [requirePermission(authService, options.cookies, SystemPermission.UserAdmin), controller.update],
      },
      {
        method: 'put',
        path: '/:id/roles',
        handlers: [requirePermission(authService, options.cookies, SystemPermission.UserAdmin), controller.updateRoles],
      },
    ],
  };
}
