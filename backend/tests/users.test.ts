import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initModels } from '../src/composition/models';
import { createServices } from '../src/composition/services';
import { type RouteDefinition } from '../src/core/module';
import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.http';
import { createUsersModule } from '../src/modules/users';
import { registerRootWithUserManagementAccess, registerTestUser } from './support/auth';
import { createTestContext, getTestRoute, runMiddlewares } from './support/http';
import { createTotpCode } from './support/totp';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';
const ssoProfile = {
  id: 'mahoutsukai',
  name: '魔法小屋',
  protocol: 'oauth2' as const,
  loginEnabled: true,
  bindingEnabled: true,
  clientId: 'sso-client-id',
  clientSecret: 'sso-client-secret',
  frontendCallbackUrl: 'http://localhost:8011/auth/sso/callback',
  redirectUri: 'http://localhost:3000/api/auth/sso/callback',
  requestTimeoutMs: 1000,
  scopes: ['openid', 'profile', 'email'],
  authorizationUrl: 'https://id.example.com/oauth/authorize',
  tokenUrl: 'https://id.example.com/oauth/token',
  userInfoUrl: 'https://id.example.com/oauth/userinfo',
  subjectField: 'sub',
  emailField: 'email',
  emailVerifiedField: 'email_verified',
  displayNameField: 'name',
  usernameField: 'preferred_username',
};

describe('users API', () => {
  let models: ReturnType<typeof initModels>;
  let routes: RouteDefinition[];
  let sequelize: ReturnType<typeof createSequelize>;
  let services: ReturnType<typeof createServices>;

  beforeEach(async () => {
    sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    models = initModels(sequelize);

    services = createServices(models, {
      authTokenSecret,
      sso: {
        profiles: [ssoProfile],
      },
    });

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

  it('rejects user list access without a passkey or authenticator app', async () => {
    const rootSession = await registerTestUser(services.auth, 'Root User', 'root-no-user-management-mfa@example.com');
    const listRoute = getTestRoute(routes, 'get', '/');
    const context = await runMiddlewares(
      [errorMiddleware(), ...listRoute.handlers],
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: rootSession.accessToken,
        },
      }),
    );

    expect(context.status).toBe(403);
    expect(context.body).toMatchObject({
      error: 'USER_MANAGEMENT_STRONG_VERIFICATION_REQUIRED',
    });
  });

  it('paginates user list responses', async () => {
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-paged@example.com');
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
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-update@example.com');
    const targetSession = await registerTestUser(services.auth, 'Target User', 'target-update@example.com');
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
    await expect(services.auth.getCurrentUser(targetSession.accessToken)).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
      status: 401,
    });
  });

  it('loads managed user details for administrator tabs', async () => {
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-details@example.com');
    await registerTestUser(services.auth, 'Target User', 'target-details@example.com');
    await services.auth.login(
      {
        identifier: 'target-details@example.com',
        password: 'password123',
      },
      {
        deviceId: 'target-details-secondary',
        ipAddress: '203.0.113.20',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      },
    );
    const targetUser = await services.user.findByEmail('target-details@example.com');

    expect(targetUser).not.toBeNull();

    if (!targetUser) {
      return;
    }

    const setup = await services.totp.createSetup(targetUser);

    await services.totp.enable(targetUser, setup.setupToken, createTotpCode(setup.secret));
    await models.authPasskey.create({
      userId: targetUser.id,
      name: 'Admin passkey',
      credentialId: 'target-details-passkey',
      publicKey: Buffer.from('public-key'),
      webauthnUserId: 'target-details-webauthn-user',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      transports: null,
      lastUsedAt: null,
    });
    await services.user.bindSsoIdentity(targetUser, {
      email: targetUser.email,
      providerId: ssoProfile.id,
      providerSubject: 'mahoutsukai-target-details',
    });

    const detailsRoute = getTestRoute(routes, 'get', '/:id/details');
    const context = await runMiddlewares(
      [errorMiddleware(), ...detailsRoute.handlers],
      createTestContext(
        undefined,
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
    const body = context.body as ManagedUserDetailsBody;

    expect(body.data.user).toMatchObject({
      id: targetUser.id,
      email: 'target-details@example.com',
    });
    expect(body.data.security.totpStatus).toMatchObject({
      enabled: true,
      recoveryCodesRemaining: 10,
    });
    expect(body.data.security.passkeys).toHaveLength(1);
    expect(body.data.security.mfaSettings).toMatchObject({
      passkeyCount: 1,
      twoStepEnabled: true,
    });
    expect(body.data.devices.length).toBeGreaterThanOrEqual(2);
    expect(body.data.ssoIdentities).toEqual([
      expect.objectContaining({
        providerId: ssoProfile.id,
        providerName: ssoProfile.name,
        providerSubject: 'mahoutsukai-target-details',
      }),
    ]);
  });

  it('removes managed user security bindings', async () => {
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-security@example.com');
    await registerTestUser(services.auth, 'Target User', 'target-security@example.com');
    const targetUser = await services.user.findByEmail('target-security@example.com');

    expect(targetUser).not.toBeNull();

    if (!targetUser) {
      return;
    }

    const setup = await services.totp.createSetup(targetUser);

    await services.totp.enable(targetUser, setup.setupToken, createTotpCode(setup.secret));
    const passkey = await models.authPasskey.create({
      userId: targetUser.id,
      name: 'Security passkey',
      credentialId: 'target-security-passkey',
      publicKey: Buffer.from('public-key'),
      webauthnUserId: 'target-security-webauthn-user',
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      transports: null,
      lastUsedAt: null,
    });

    const deletePasskeyRoute = getTestRoute(routes, 'delete', '/:id/passkeys/:passkeyId');
    const passkeyContext = await runMiddlewares(
      [errorMiddleware(), ...deletePasskeyRoute.handlers],
      createTestContext(
        undefined,
        {},
        {
          id: targetUser.id,
          passkeyId: passkey.id,
        },
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );
    const passkeyBody = passkeyContext.body as ManagedSecurityBody;

    expect(passkeyBody.data.passkeys).toHaveLength(0);
    expect(passkeyBody.data.mfaSettings.passkeyCount).toBe(0);

    const disableTotpRoute = getTestRoute(routes, 'post', '/:id/totp/disable');
    const totpContext = await runMiddlewares(
      [errorMiddleware(), ...disableTotpRoute.handlers],
      createTestContext(
        undefined,
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
    const totpBody = totpContext.body as ManagedSecurityBody;
    const updatedUser = await services.user.findManagedById(targetUser.id);

    expect(totpBody.data.totpStatus).toMatchObject({
      enabled: false,
      recoveryCodesRemaining: 0,
    });
    expect(updatedUser?.totpEnabled).toBe(false);
  });

  it('updates managed MFA settings and removes SSO bindings', async () => {
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-sso@example.com');
    await registerTestUser(services.auth, 'Target User', 'target-sso@example.com');
    const targetUser = await services.user.findByEmail('target-sso@example.com');

    expect(targetUser).not.toBeNull();

    if (!targetUser) {
      return;
    }

    await services.user.bindSsoIdentity(targetUser, {
      email: targetUser.email,
      providerId: ssoProfile.id,
      providerSubject: 'mahoutsukai-target-sso',
    });

    const mfaRoute = getTestRoute(routes, 'patch', '/:id/mfa');
    const mfaContext = await runMiddlewares(
      [errorMiddleware(), ...mfaRoute.handlers],
      createTestContext(
        {
          requiredForSso: false,
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
    const mfaBody = mfaContext.body as ManagedSecurityBody;

    expect(mfaBody.data.mfaSettings.mfaRequiredForSso).toBe(false);

    const deleteSsoRoute = getTestRoute(routes, 'delete', '/:id/sso-identities/:providerId');
    const ssoContext = await runMiddlewares(
      [errorMiddleware(), ...deleteSsoRoute.handlers],
      createTestContext(
        undefined,
        {},
        {
          id: targetUser.id,
          providerId: ssoProfile.id,
        },
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );
    const ssoBody = ssoContext.body as ManagedSsoIdentitiesBody;

    expect(ssoBody.data.identities).toEqual([]);
    await expect(services.user.listSsoIdentities(targetUser.id)).resolves.toEqual([]);
  });

  it('leaves omitted user details unchanged during partial updates', async () => {
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-partial@example.com');
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
          gender: 'Custom',
          birthday: '2001-05-23',
          bio: 'Managed profile bio.',
          location: 'Tokyo',
          websiteUrl: 'https://managed.example.com/',
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
      gender: 'Custom',
      birthday: '2001-05-23',
      bio: 'Managed profile bio.',
      location: 'Tokyo',
      websiteUrl: 'https://managed.example.com/',
      email: targetUser.email,
      emailVerified: targetUser.emailVerified,
      phoneVerified: targetUser.phoneVerified,
    });
    expect(updatedUser).toMatchObject({
      username: targetUser.username,
      displayName: 'Partial User',
      gender: 'Custom',
      birthday: '2001-05-23',
      bio: 'Managed profile bio.',
      location: 'Tokyo',
      websiteUrl: 'https://managed.example.com/',
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
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-disable@example.com');
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
    const rootSession = await registerRootWithUserManagementAccess(services, 'Root User', 'root-rollback@example.com');
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
    gender?: string;
    birthday?: string;
    bio?: string;
    location?: string;
    websiteUrl?: string;
    email: string;
    emailVerified: boolean;
    phoneNumber?: string;
    phoneVerified: boolean;
    available: boolean;
    roles: string[];
    permissions: string[];
  };
}

interface ManagedUserDetailsBody {
  data: {
    user: {
      id: string;
      email: string;
    };
    security: ManagedSecurityBody['data'];
    devices: unknown[];
    ssoIdentities: Array<{
      providerId: string;
      providerName: string;
      providerSubject: string;
    }>;
  };
}

interface ManagedSecurityBody {
  data: {
    mfaSettings: {
      mfaRequiredForSso: boolean;
      passkeyCount: number;
      twoStepEnabled: boolean;
    };
    passkeys: unknown[];
    totpStatus: {
      enabled: boolean;
      recoveryCodesRemaining: number;
    };
  };
}

interface ManagedSsoIdentitiesBody {
  data: {
    identities: unknown[];
  };
}
