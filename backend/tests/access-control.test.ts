import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SystemPermission, SystemRole } from '@tilty/shared/access-control';

import { initModels } from '../src/composition/models';
import { createServices } from '../src/composition/services';
import { type RouteDefinition } from '../src/core/module';
import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.http';
import { createUsersModule } from '../src/modules/users';
import {
  registerRootWithUserManagementAccess,
  registerTestUser,
  registerUserWithUserManagementAccess,
} from './support/auth';
import { createTestContext, getTestRoute, runMiddlewares } from './support/http';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';

describe('access control', () => {
  let routes: RouteDefinition[];
  let sequelize: ReturnType<typeof createSequelize>;
  let services: ReturnType<typeof createServices>;

  beforeEach(async () => {
    sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    const models = initModels(sequelize);

    services = createServices(models, { authTokenSecret });

    await createMigrator(sequelize).up();
    await services.accessControl.syncSystemAccessControl();

    routes = createUsersModule(services.user, services.accessControl, services.auth, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
  });

  afterEach(async () => {
    await sequelize.close();
  });

  it('grants the first registered user the root role', async () => {
    const session = await registerTestUser(services.auth, 'Root User', 'root@example.com');
    const rootUser = await services.user.findByUsername('root_user');

    expect(session.user.roles).toEqual([SystemRole.Root]);
    expect(session.user.permissions).toEqual([
      SystemPermission.Root,
      SystemPermission.UserAdmin,
      SystemPermission.UserList,
    ]);
    expect(rootUser).not.toBeNull();
    await expect(services.accessControl.can(rootUser!.id, SystemPermission.UserAdmin)).resolves.toBe(true);
  });

  it('enforces user list permissions on the server', async () => {
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-list@example.com');
    const regularSession = await registerTestUser(services.auth, 'Regular User', 'regular-list@example.com');
    const listRoute = getTestRoute(routes, 'get', '/');

    const forbiddenContext = await runMiddlewares(
      [errorMiddleware(), ...listRoute.handlers],
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: regularSession.accessToken,
        },
      }),
    );

    expect(forbiddenContext.status).toBe(403);
    expect(forbiddenContext.body).toMatchObject({
      error: 'AUTH_FORBIDDEN',
    });

    const allowedContext = await runMiddlewares(
      [errorMiddleware(), ...listRoute.handlers],
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: rootSession.accessToken,
        },
      }),
    );
    const body = allowedContext.body as UserListBody;

    expect(body.data.users).toHaveLength(2);
    expect(body.data.roles.map((role) => role.key)).toEqual([
      SystemRole.Root,
      SystemRole.UserAdmin,
      SystemRole.UserList,
    ]);
  });

  it('updates user roles and prevents removing the final root', async () => {
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-admin@example.com');
    const regularSession = await registerUserWithUserManagementAccess(
      services,
      'Regular User',
      'regular-admin@example.com',
    );
    const regularUser = await services.user.findByUsername('regular_user');
    const rootUser = await services.user.findByUsername('root_user');
    const updateRolesRoute = getTestRoute(routes, 'put', '/:id/roles');
    const listRoute = getTestRoute(routes, 'get', '/');

    expect(regularUser).not.toBeNull();
    expect(rootUser).not.toBeNull();

    const updateContext = await runMiddlewares(
      [errorMiddleware(), ...updateRolesRoute.handlers],
      createTestContext(
        {
          roleKeys: [SystemRole.UserList],
        },
        {},
        {
          id: regularUser!.id,
        },
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );
    const updateBody = updateContext.body as UserBody;

    expect(updateBody.data.roles).toEqual([SystemRole.UserList]);
    expect(updateBody.data.permissions).toEqual([SystemPermission.UserList]);

    const regularListContext = await runMiddlewares(
      [errorMiddleware(), ...listRoute.handlers],
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: regularSession.accessToken,
        },
      }),
    );

    expect(regularListContext.status).toBeUndefined();

    const removeLastRootContext = await runMiddlewares(
      [errorMiddleware(), ...updateRolesRoute.handlers],
      createTestContext(
        {
          roleKeys: [],
        },
        {},
        {
          id: rootUser!.id,
        },
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );

    expect(removeLastRootContext.status).toBe(409);
    expect(removeLastRootContext.body).toMatchObject({
      error: 'LAST_ROOT_ROLE_REQUIRED',
    });
  });
});

interface UserListBody {
  data: {
    roles: Array<{
      key: string;
    }>;
    users: unknown[];
  };
}

interface UserBody {
  data: {
    permissions: string[];
    roles: string[];
  };
}
