import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type RouteDefinition } from '../src/core/module';
import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { createServices, initModels } from '../src/modules';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.controller';
import { createUsersModule } from '../src/modules/users';
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
    const rootSession = await registerUser('Root User', 'root-paged@example.com');
    await registerUser('Alpha User', 'alpha-paged@example.com');
    await registerUser('Beta User', 'beta-paged@example.com');
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

  async function registerUser(username: string, email: string) {
    return services.auth.register({
      username,
      email,
      password: 'password123',
      confirmPassword: 'password123',
    });
  }
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
