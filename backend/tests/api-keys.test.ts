import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  apiKeyActiveLimitPerUser,
  apiKeyChecksumLength,
  apiKeyPlainKeyPatternSource,
  apiKeyPrefix,
} from '@tilty/shared/api-keys';
import { AuthVerificationPurpose } from '@tilty/shared/auth';

import { initModels } from '../src/composition/models';
import { createServices } from '../src/composition/services';
import { type RouteDefinition } from '../src/core/module';
import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { createAdminModule } from '../src/modules/admin';
import { createApiKeyModule } from '../src/modules/api-keys';
import { createAuthModule } from '../src/modules/auth';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.http';
import { defaultAuthSessionRequestContext } from '../src/modules/auth/auth.service';
import { createUsersModule } from '../src/modules/users';
import { registerTestUser } from './support/auth';
import { createTestContext, getTestRoute, runMiddlewares } from './support/http';
import { createTotpCode } from './support/totp';

interface ApiKeyRevealBody {
  data: {
    id: string;
    keyPrefix: string;
    keySuffix: string;
    plainKey: string;
  };
}

interface ApiKeyListBody {
  data: {
    keys: Array<{
      id: string;
      plainKey?: string;
      status: string;
    }>;
    limit: number;
  };
}

interface ProfileOptionsBody {
  data: {
    options: unknown[];
  };
}

interface CurrentUserBody {
  data: {
    bio?: string;
    displayName: string;
    email: string;
  };
}

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';
const authRoutesAllowedToIgnoreApiKeyAuthorization = new Set([
  'get /config',
  'get /sso/config',
  'get /sso/start',
  'get /sso/callback',
]);

describe('api keys API', () => {
  let adminRoutes: RouteDefinition[];
  let authRoutes: RouteDefinition[];
  let apiKeyRoutes: RouteDefinition[];
  let models: ReturnType<typeof initModels>;
  let sequelize: ReturnType<typeof createSequelize>;
  let services: ReturnType<typeof createServices>;
  let userRoutes: RouteDefinition[];

  beforeEach(async () => {
    sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    models = initModels(sequelize);

    services = createServices(models, { authTokenSecret });

    await createMigrator(sequelize).up();
    await services.accessControl.syncSystemAccessControl();

    apiKeyRoutes = createApiKeyModule(services.apiKey, services.auth, {
      cookies: defaultAuthCookieConfig,
    }).routes;
    authRoutes = createAuthModule(services.auth, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
    adminRoutes = createAdminModule(services.user, services.accessControl, services.auth, {
      apiKeyService: services.apiKey,
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
    userRoutes = createUsersModule(services.user, services.auth, {
      apiKeyService: services.apiKey,
      cookies: defaultAuthCookieConfig,
    }).routes;
  });

  afterEach(async () => {
    await sequelize.close();
  });

  it('creates API Keys with the shared format and never returns the plain key from list responses', async () => {
    const { session } = await registerUserWithApiKeyManagementAccess('Root User', 'root-api-key-create@example.com');
    const created = await createApiKey(session.accessToken, {
      name: 'CLI key',
    });
    const listRoute = getTestRoute(apiKeyRoutes, 'get', '/api-keys');
    const listContext = await runMiddlewares(
      [errorMiddleware(), ...listRoute.handlers],
      createCookieContext(undefined, session.accessToken),
    );
    const listBody = listContext.body as ApiKeyListBody;

    expect(created.plainKey).toMatch(new RegExp(apiKeyPlainKeyPatternSource));
    expect(created.keyPrefix).toBe(`${apiKeyPrefix}_${created.id}`);
    expect(created.keySuffix).toHaveLength(apiKeyChecksumLength);
    expect(listBody.data.limit).toBe(apiKeyActiveLimitPerUser);
    expect(listBody.data.keys[0]).toMatchObject({
      id: created.id,
      status: 'active',
    });
    expect(listBody.data.keys[0]?.plainKey).toBeUndefined();
  });

  it('limits each account to the configured active or disabled API Key count', async () => {
    const { session } = await registerUserWithApiKeyManagementAccess('Root User', 'root-api-key-limit@example.com');

    for (let index = 0; index < apiKeyActiveLimitPerUser; index += 1) {
      await createApiKey(session.accessToken, {
        name: `key-${index}`,
      });
    }

    const createRoute = getTestRoute(apiKeyRoutes, 'post', '/api-keys');
    const overflowContext = await runMiddlewares(
      [errorMiddleware(), ...createRoute.handlers],
      createCookieContext(
        {
          name: 'overflow',
        },
        session.accessToken,
      ),
    );

    expect(overflowContext.status).toBe(409);
    expect(overflowContext.body).toMatchObject({
      error: 'API_KEY_CREATE_LIMIT_EXCEEDED',
    });
  });

  it('keeps the active API Key limit under in-process concurrent create requests', async () => {
    const { session, user } = await registerUserWithApiKeyManagementAccess(
      'Root User',
      'root-api-key-concurrent-limit@example.com',
    );
    const createRoute = getTestRoute(apiKeyRoutes, 'post', '/api-keys');
    const contexts = await Promise.all(
      Array.from({ length: apiKeyActiveLimitPerUser + 1 }, (_, index) =>
        runMiddlewares(
          [errorMiddleware(), ...createRoute.handlers],
          createCookieContext(
            {
              name: `concurrent-key-${index}`,
            },
            session.accessToken,
          ),
        ),
      ),
    );
    const successes = contexts.filter((context) => context.status === 201);
    const failures = contexts.filter((context) => context.status === 409);
    const list = await services.apiKey.listForUser(user.id);

    expect(successes).toHaveLength(apiKeyActiveLimitPerUser);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.body).toMatchObject({
      error: 'API_KEY_CREATE_LIMIT_EXCEEDED',
    });
    expect(list.keys).toHaveLength(apiKeyActiveLimitPerUser);
  });

  it('allows API Keys to call non-admin authenticated APIs', async () => {
    const { session } = await registerUserWithApiKeyManagementAccess('Root User', 'root-api-key-access@example.com');
    const created = await createApiKey(session.accessToken, {
      name: 'profile options access',
    });
    const context = await runProfileOptionsWithApiKey(created.plainKey);
    const body = context.body as ProfileOptionsBody;

    expect(context.status).toBeUndefined();
    expect(body.data.options.length).toBeGreaterThan(0);
  });

  it('allows API Keys to read and update the current user profile', async () => {
    const { session } = await registerUserWithApiKeyManagementAccess(
      'Root User',
      'root-api-key-current-user@example.com',
    );
    const created = await createApiKey(session.accessToken, {
      name: 'current user profile access',
    });
    const meRoute = getTestRoute(userRoutes, 'get', '/me');
    const meContext = await runMiddlewares(
      [errorMiddleware(), ...meRoute.handlers],
      createBearerContext(undefined, created.plainKey),
    );
    const meBody = meContext.body as CurrentUserBody;
    const updateRoute = getTestRoute(userRoutes, 'patch', '/me');
    const updateContext = await runMiddlewares(
      [errorMiddleware(), ...updateRoute.handlers],
      createBearerContext(
        {
          bio: 'Updated through API Key',
          displayName: 'Updated API Key User',
        },
        created.plainKey,
      ),
    );
    const updateBody = updateContext.body as CurrentUserBody;

    expect(meContext.status).toBeUndefined();
    expect(meBody.data).toMatchObject({
      displayName: 'Root User',
      email: 'root-api-key-current-user@example.com',
    });
    expect(updateContext.status).toBeUndefined();
    expect(updateBody.data).toMatchObject({
      bio: 'Updated through API Key',
      displayName: 'Updated API Key User',
    });
  });

  it('does not allow API Keys to call current-user contact verification routes', async () => {
    const { session } = await registerUserWithApiKeyManagementAccess(
      'Root User',
      'root-api-key-contact-verification@example.com',
    );
    const created = await createApiKey(session.accessToken, {
      name: 'contact verification blocked',
    });

    for (const route of [
      getTestRoute(userRoutes, 'post', '/me/email-verification'),
      getTestRoute(userRoutes, 'post', '/me/email-verification/confirm'),
      getTestRoute(userRoutes, 'post', '/me/phone-verification'),
      getTestRoute(userRoutes, 'post', '/me/phone-verification/confirm'),
    ]) {
      const context = await runMiddlewares(
        [errorMiddleware(), ...route.handlers],
        createBearerContext(undefined, created.plainKey),
      );

      expect(context.status, formatRoute('/api/users', route)).toBe(403);
      expect(context.body).toMatchObject({
        error: 'API_KEY_NOT_SUPPORTED',
      });
    }
  });

  it('does not allow API Keys to clear contact fields that require session step-up verification', async () => {
    const { session, user } = await registerUserWithApiKeyManagementAccess(
      'Root User',
      'root-api-key-contact-update@example.com',
    );
    const created = await createApiKey(session.accessToken, {
      name: 'contact update blocked',
    });
    const updateRoute = getTestRoute(userRoutes, 'patch', '/me');

    user.phoneNumber = '+8613800138000';
    user.phoneVerified = true;
    await user.save();

    const context = await runMiddlewares(
      [errorMiddleware(), ...updateRoute.handlers],
      createBearerContext(
        {
          displayName: 'Root User',
          phoneNumber: null,
        },
        created.plainKey,
      ),
    );

    expect(context.status).toBe(403);
    expect(context.body).toMatchObject({
      error: 'API_KEY_NOT_SUPPORTED',
    });
  });

  it('records API Key request counts with atomic increments', async () => {
    const { session } = await registerUserWithApiKeyManagementAccess('Root User', 'root-api-key-count@example.com');
    const created = await createApiKey(session.accessToken, {
      name: 'counted access',
    });

    await Promise.all(Array.from({ length: 5 }, () => runProfileOptionsWithApiKey(created.plainKey)));

    const key = await models.apiKey.findByPk(created.id);

    expect(key?.lastUsedAt).toBeInstanceOf(Date);
    expect(key?.requestCount).toBe(5);
  });

  it('rejects disabled, revoked, expired, and disabled-user API Keys', async () => {
    const { session, user } = await registerUserWithApiKeyManagementAccess(
      'Root User',
      'root-api-key-state@example.com',
    );
    const disabledKey = await createApiKey(session.accessToken, {
      name: 'disabled key',
    });
    const revokedKey = await createApiKey(session.accessToken, {
      name: 'revoked key',
    });
    const expiredKey = await createApiKey(session.accessToken, {
      name: 'expired key',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    await postApiKeyAction(session.accessToken, disabledKey.id, 'disable');
    await postApiKeyAction(session.accessToken, revokedKey.id, 'revoke');

    await expectApiKeyFailure(disabledKey.plainKey, 401, 'API_KEY_DISABLED');
    await expectApiKeyFailure(revokedKey.plainKey, 401, 'API_KEY_REVOKED');
    await expectApiKeyFailure(expiredKey.plainKey, 401, 'API_KEY_EXPIRED');

    const userDisabledKey = await createApiKey(session.accessToken, {
      name: 'disabled user key',
    });

    await services.user.updateManagedUser(user, { available: false });
    await expectApiKeyFailure(userDisabledKey.plainKey, 401, 'API_KEY_INVALID');
  });

  it('does not allow API Keys to manage API Keys', async () => {
    const { session } = await registerUserWithApiKeyManagementAccess(
      'Root User',
      'root-api-key-self-manage@example.com',
    );
    const created = await createApiKey(session.accessToken, {
      name: 'self management',
    });
    for (const route of apiKeyRoutes) {
      const bearerContext = await runMiddlewares(
        [errorMiddleware(), ...route.handlers],
        createBearerContext(undefined, created.plainKey, createParamsForRoute(route.path, { id: created.id })),
      );

      expect(bearerContext.status, formatRoute('/api', route)).toBe(403);
      expect(bearerContext.body).toMatchObject({
        error: 'API_KEY_NOT_SUPPORTED',
      });
    }

    const listRoute = getTestRoute(apiKeyRoutes, 'get', '/api-keys');
    const conflictContext = await runMiddlewares(
      [errorMiddleware(), ...listRoute.handlers],
      createTestContext(
        undefined,
        {
          authorization: `Bearer ${created.plainKey}`,
        },
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );

    expect(conflictContext.status).toBe(400);
    expect(conflictContext.body).toMatchObject({
      error: 'API_KEY_AUTH_CONFLICT',
    });
  });

  it('does not allow API Keys to call credential and session-only auth routes', async () => {
    const { session } = await registerUserWithApiKeyManagementAccess(
      'Root User',
      'root-api-key-auth-routes@example.com',
    );
    const created = await createApiKey(session.accessToken, {
      name: 'blocked auth routes',
    });
    const sessionOnlyRoutes = authRoutes.filter(
      (route) => !authRoutesAllowedToIgnoreApiKeyAuthorization.has(routeKey(route)),
    );

    expect(sessionOnlyRoutes.length).toBeGreaterThan(0);

    for (const route of sessionOnlyRoutes) {
      const context = await runMiddlewares(
        [errorMiddleware(), ...route.handlers],
        createBearerContext(undefined, created.plainKey, createParamsForRoute(route.path)),
      );

      expect(context.status, formatRoute('/api/auth', route)).toBe(403);
      expect(context.body).toMatchObject({
        error: 'API_KEY_NOT_SUPPORTED',
      });
    }

    const passwordRoute = getTestRoute(authRoutes, 'patch', '/password');
    const conflictContext = await runMiddlewares(
      [errorMiddleware(), ...passwordRoute.handlers],
      createTestContext(
        undefined,
        {
          authorization: `Bearer ${created.plainKey}`,
        },
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );

    expect(conflictContext.status).toBe(400);
    expect(conflictContext.body).toMatchObject({
      error: 'API_KEY_AUTH_CONFLICT',
    });
  });

  it('does not allow API Keys to call session-only admin routes', async () => {
    const { session, user } = await registerUserWithApiKeyManagementAccess(
      'Root User',
      'root-api-key-user-admin-blocked@example.com',
    );
    const created = await createApiKey(session.accessToken, {
      name: 'blocked user admin',
    });

    expect(adminRoutes.length).toBeGreaterThan(0);

    for (const route of adminRoutes) {
      const id = route.path.startsWith('/api-keys/') ? created.id : user.id;
      const context = await runMiddlewares(
        [errorMiddleware(), ...route.handlers],
        createBearerContext(undefined, created.plainKey, createParamsForRoute(route.path, { id })),
      );

      expect(context.status, formatRoute('/api/admin', route)).toBe(403);
      expect(context.body).toMatchObject({
        error: 'API_KEY_NOT_SUPPORTED',
      });
    }
  });

  async function registerUserWithApiKeyManagementAccess(displayName: string, email: string) {
    const session = await registerTestUser(services.auth, displayName, email);
    const user = await services.user.findByEmail(email);

    if (!user) {
      throw new Error('User was not created.');
    }

    const setup = await services.totp.createSetup(user);

    await services.totp.enable(user, setup.setupToken, createTotpCode(setup.secret));

    const challenge = await services.auth.createVerificationChallenge(
      session.accessToken,
      AuthVerificationPurpose.ManageApiKey,
      defaultAuthSessionRequestContext,
    );

    if ('verificationToken' in challenge) {
      await services.auth.verifyAuthenticationChallenge(
        {
          code: createTotpCode(setup.secret),
          method: 'totp',
          verificationToken: challenge.verificationToken,
        },
        defaultAuthSessionRequestContext,
      );
    }

    return {
      session,
      user,
    };
  }

  async function createApiKey(
    accessToken: string,
    input: { expiresAt?: string; name: string },
  ): Promise<ApiKeyRevealBody['data']> {
    const createRoute = getTestRoute(apiKeyRoutes, 'post', '/api-keys');
    const context = await runMiddlewares(
      [errorMiddleware(), ...createRoute.handlers],
      createCookieContext(
        {
          name: input.name,
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        },
        accessToken,
      ),
    );
    const body = context.body as ApiKeyRevealBody;

    expect(context.status).toBe(201);

    return body.data;
  }

  async function postApiKeyAction(accessToken: string, keyId: string, action: 'disable' | 'revoke') {
    const route = getTestRoute(apiKeyRoutes, 'post', `/api-keys/:id/${action}`);

    await runMiddlewares(
      [errorMiddleware(), ...route.handlers],
      createCookieContext(undefined, accessToken, {
        id: keyId,
      }),
    );
  }

  async function runProfileOptionsWithApiKey(plainKey: string) {
    const profileOptionsRoute = getTestRoute(userRoutes, 'get', '/profile-options/genders');

    return runMiddlewares(
      [errorMiddleware(), ...profileOptionsRoute.handlers],
      createBearerContext(undefined, plainKey),
    );
  }

  async function expectApiKeyFailure(plainKey: string, status: number, error: string) {
    const context = await runProfileOptionsWithApiKey(plainKey);

    expect(context.status).toBe(status);
    expect(context.body).toMatchObject({
      error,
    });
  }

  function createCookieContext(body: unknown, accessToken: string, params?: Record<string, string>) {
    return createTestContext(body, {}, params, {
      cookies: {
        tilty_scaffold_access_token: accessToken,
      },
    });
  }

  function createBearerContext(body: unknown, plainKey: string, params?: Record<string, string>) {
    return createTestContext(
      body,
      {
        authorization: `Bearer ${plainKey}`,
      },
      params,
    );
  }

  function createParamsForRoute(path: string, overrides: Record<string, string> = {}) {
    const entries = Array.from(path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g), ([, name]) => [
      name,
      overrides[name] ?? `${name}-value`,
    ]);

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  function formatRoute(prefix: string, route: Pick<RouteDefinition, 'method' | 'path'>) {
    return `${route.method.toUpperCase()} ${prefix}${route.path}`;
  }

  function routeKey(route: Pick<RouteDefinition, 'method' | 'path'>) {
    return `${route.method} ${route.path}`;
  }
});
