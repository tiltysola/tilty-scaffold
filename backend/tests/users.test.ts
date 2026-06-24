import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type RouteDefinition } from '../src/core/module';
import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { createServices, initModels } from '../src/modules';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.controller';
import { createUsersModule } from '../src/modules/users';
import { registerTestUser } from './support/auth';
import { createTestContext, getTestRoute, runMiddlewares } from './support/http';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';

describe('users API', () => {
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
    }).routes;
  });

  afterEach(async () => {
    await sequelize.close();
  });

  it('paginates user list responses', async () => {
    const rootSession = await registerTestUser(services.auth, 'Root User', 'root-paged@example.com');
    await registerTestUser(services.auth, 'Alpha User', 'alpha-paged@example.com');
    await registerTestUser(services.auth, 'Beta User', 'beta-paged@example.com');
    const listRoute = getTestRoute(routes, 'get', '/');
    const context = await runMiddlewares(
      [errorMiddleware(), ...listRoute.handlers],
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: rootSession.accessToken,
        },
        query: {
          page: '2',
          pageSize: '1',
        },
      }),
    );
    const body = context.body as UserListBody;

    expect(body.data.users).toHaveLength(1);
    expect(body.data.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 3,
      totalPages: 3,
    });
  });

  it('updates user details and roles as an administrator', async () => {
    const rootSession = await registerTestUser(services.auth, 'Root User', 'root-update@example.com');
    await registerTestUser(services.auth, 'Target User', 'target-update@example.com');
    const targetUser = await services.user.findByEmail('target-update@example.com');

    expect(targetUser).not.toBeNull();

    if (!targetUser) {
      return;
    }

    const updateRoute = getTestRoute(routes, 'put', '/:id');
    const context = await runMiddlewares(
      [errorMiddleware(), ...updateRoute.handlers],
      createTestContext(
        {
          username: 'managed_user',
          displayName: 'Managed User',
          email: 'managed@example.com',
          emailVerified: true,
          phoneNumber: '+8613800138000',
          phoneVerified: true,
          password: 'newpassword123',
          available: true,
          roleKeys: ['USER_LIST'],
        },
        {},
        {
          id: targetUser.id,
        },
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );
    const body = context.body as UserUpdateBody;
    const updatedUser = await services.user.findById(targetUser.id);

    expect(body.data).toMatchObject({
      username: 'managed_user',
      displayName: 'Managed User',
      email: 'managed@example.com',
      emailVerified: true,
      phoneNumber: '+8613800138000',
      phoneVerified: true,
      available: true,
      roles: ['USER_LIST'],
      permissions: ['USER_LIST'],
    });
    expect(updatedUser).toMatchObject({
      username: 'managed_user',
      displayName: 'Managed User',
      email: 'managed@example.com',
      emailVerified: true,
      phoneNumber: '+8613800138000',
      phoneVerified: true,
    });
    await expect(
      services.auth.login({
        identifier: 'managed@example.com',
        password: 'newpassword123',
      }),
    ).resolves.toMatchObject({
      user: {
        email: 'managed@example.com',
      },
    });
  });

  it('leaves omitted user details unchanged during partial updates', async () => {
    const rootSession = await registerTestUser(services.auth, 'Root User', 'root-partial@example.com');
    await registerTestUser(services.auth, 'Target User', 'target-partial@example.com');
    const targetUser = await services.user.findByEmail('target-partial@example.com');

    expect(targetUser).not.toBeNull();

    if (!targetUser) {
      return;
    }

    const updateRoute = getTestRoute(routes, 'put', '/:id');
    const context = await runMiddlewares(
      [errorMiddleware(), ...updateRoute.handlers],
      createTestContext(
        {
          displayName: 'Partial User',
          password: '',
        },
        {},
        {
          id: targetUser.id,
        },
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );
    const body = context.body as UserUpdateBody;
    const updatedUser = await services.user.findByEmail(targetUser.email);

    expect(body.data).toMatchObject({
      username: targetUser.username,
      displayName: 'Partial User',
      email: targetUser.email,
      emailVerified: targetUser.emailVerified,
      phoneVerified: targetUser.phoneVerified,
    });
    expect(updatedUser).toMatchObject({
      username: targetUser.username,
      displayName: 'Partial User',
      email: targetUser.email,
      emailVerified: targetUser.emailVerified,
      phoneVerified: targetUser.phoneVerified,
    });
    await expect(
      services.auth.login({
        identifier: targetUser.email,
        password: 'password123',
      }),
    ).resolves.toMatchObject({
      user: {
        email: targetUser.email,
      },
    });
  });

  it('does not disable the last available root user', async () => {
    const rootSession = await registerTestUser(services.auth, 'Root User', 'root-disable@example.com');
    const rootUser = await services.user.findByEmail('root-disable@example.com');

    expect(rootUser).not.toBeNull();

    if (!rootUser) {
      return;
    }

    const updateRoute = getTestRoute(routes, 'put', '/:id');
    const context = await runMiddlewares(
      [errorMiddleware(), ...updateRoute.handlers],
      createTestContext(
        {
          available: false,
        },
        {},
        {
          id: rootUser.id,
        },
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );
    const unchangedUser = await services.user.findById(rootUser.id);

    expect(context.status).toBe(409);
    expect(context.body).toMatchObject({
      error: 'LAST_ROOT_ROLE_REQUIRED',
    });
    expect(unchangedUser?.available).toBe(true);
  });

  it('does not update user details when role assignment fails', async () => {
    const rootSession = await registerTestUser(services.auth, 'Root User', 'root-rollback@example.com');
    await registerTestUser(services.auth, 'Target User', 'target-rollback@example.com');
    const targetUser = await services.user.findByEmail('target-rollback@example.com');

    expect(targetUser).not.toBeNull();

    if (!targetUser) {
      return;
    }

    const updateRoute = getTestRoute(routes, 'put', '/:id');
    const context = await runMiddlewares(
      [errorMiddleware(), ...updateRoute.handlers],
      createTestContext(
        {
          username: 'rollback_user',
          displayName: 'Rollback User',
          email: 'rollback@example.com',
          phoneNumber: null,
          available: true,
          roleKeys: ['MISSING_ROLE'],
        },
        {},
        {
          id: targetUser.id,
        },
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );
    const unchangedUser = await services.user.findById(targetUser.id);

    expect(context.status).toBe(404);
    expect(unchangedUser).toMatchObject({
      username: targetUser.username,
      displayName: targetUser.displayName,
      email: targetUser.email,
    });
  });
});

interface UserListBody {
  data: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    users: unknown[];
  };
}

interface UserUpdateBody {
  data: {
    username: string;
    displayName: string;
    email: string;
    emailVerified: boolean;
    phoneNumber?: string;
    phoneVerified: boolean;
    available: boolean;
    roles: string[];
    permissions: string[];
  };
}
