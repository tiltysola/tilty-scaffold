import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthVerificationPurpose } from '@tilty/shared/auth';
import { defaultFileUploadMaxBytes } from '@tilty/shared/setup';

import { initModels } from '../src/composition/models';
import { createServices } from '../src/composition/services';
import { type RouteDefinition } from '../src/core/module';
import { MemoryCacheStore } from '../src/infra/cache';
import { createSequelize } from '../src/infra/database';
import { type FileStorage, type SaveFileInput } from '../src/infra/file-storage';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { createAuthModule } from '../src/modules/auth';
import { type EmailSender, EmailVerificationService } from '../src/modules/auth/auth.email';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.http';
import {
  AuthService,
  defaultAuthSessionRequestContext,
  defaultAuthTokenConfig,
} from '../src/modules/auth/auth.service';
import { type SmsSender, SmsVerificationService } from '../src/modules/auth/auth.sms';
import { TotpService } from '../src/modules/auth/auth.totp';
import { AuthVerificationService } from '../src/modules/auth/auth-verification.service';
import { createUsersModule } from '../src/modules/users';
import { UserService } from '../src/modules/users/user.service';
import { createTestContext, getTestRoute, getTestRouteHandler, runMiddleware, runMiddlewares } from './support/http';
import { createTotpCode } from './support/totp';

interface AuthSessionBody {
  data: {
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
    user: {
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
    };
  };
}

interface VerificationRequiredBody {
  data: {
    defaultMethod: string;
    expiresAt: string;
    methods: Array<{
      method: string;
      maskedTarget?: string;
    }>;
    purpose: string;
    remainingAttempts: number;
    requiresVerification: true;
    verificationToken: string;
  };
}

interface VerificationCodeSendBody {
  data: {
    cooldownSeconds: number;
    expiresInSeconds: number;
    maskedTarget?: string;
  };
}

interface AuthDeviceSessionsBody {
  data: {
    sessions: Array<{
      id: string;
      deviceName: string;
      deviceType: string;
      browser: string;
      os: string;
      ipAddress: string;
      lastActiveAt: string;
      createdAt: string;
      expiresAt: string;
      isCurrent: boolean;
    }>;
  };
}

interface AuthUserBody {
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
    avatarUrl?: string;
    profileBannerUrl?: string;
    profileBackgroundUrl?: string;
  };
}

interface CreateAuthServiceOptions {
  cacheStore?: MemoryCacheStore;
  emailVerification?: EmailVerificationService;
  fileStorage?: FileStorage;
  smsVerification?: SmsVerificationService;
}

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';

describe('auth API', () => {
  let models: ReturnType<typeof initModels>;
  let routes: RouteDefinition[];
  let sequelize: ReturnType<typeof createSequelize>;
  let services: ReturnType<typeof createServices>;
  let userRoutes: RouteDefinition[];
  let fileStorage: CapturingFileStorage;

  beforeEach(async () => {
    sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    models = initModels(sequelize);
    fileStorage = new CapturingFileStorage();
    services = createServices(models, { authTokenSecret, fileStorage });

    await createMigrator(sequelize).up();
    await services.accessControl.syncSystemAccessControl();

    routes = createAuthModule(services.auth, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
    userRoutes = createCurrentUserRoutes();
  });

  afterEach(async () => {
    await sequelize.close();
  });

  function createAuthService(options: CreateAuthServiceOptions = {}) {
    const cacheStore = options.cacheStore ?? new MemoryCacheStore();
    const emailVerification = options.emailVerification ?? new EmailVerificationService();
    const smsVerification = options.smsVerification ?? new SmsVerificationService();
    const totpService = new TotpService(models.user, cacheStore, authTokenSecret);

    return new AuthService(
      new UserService(models.user, models.ssoIdentity),
      services.accessControl,
      authTokenSecret,
      emailVerification,
      options.fileStorage,
      defaultAuthTokenConfig,
      cacheStore,
      services.authSession,
      totpService,
      services.authPasskey,
      new AuthVerificationService(
        cacheStore,
        authTokenSecret,
        services.authPasskey,
        totpService,
        emailVerification,
        smsVerification,
      ),
      smsVerification,
    );
  }

  function createCurrentUserRoutes(
    authService: AuthService = services.auth,
    rateLimit?: RouteDefinition['handlers'][number],
  ) {
    return createUsersModule(services.user, authService, {
      cookies: defaultAuthCookieConfig,
      ...(rateLimit ? { rateLimit } : {}),
    }).routes;
  }

  function runRoute(
    routeSource: RouteDefinition[],
    method: RouteDefinition['method'],
    path: string,
    context: Parameters<typeof runMiddlewares>[1],
  ) {
    return runMiddlewares(getTestRoute(routeSource, method, path).handlers, context);
  }

  it('registers, logs in, and returns the current user', async () => {
    const credentials = {
      username: 'test_user',
      displayName: 'Test User',
      email: 'user@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    };

    const registerContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/register'),
      createTestContext(credentials),
    );
    const registerBody = registerContext.body as AuthSessionBody;

    expect(registerContext.status).toBe(201);
    expect(registerBody.data.user).toMatchObject({
      username: credentials.username,
      displayName: credentials.displayName,
      email: credentials.email,
      emailVerified: false,
      phoneVerified: false,
    });
    expect(registerBody.data.user).not.toHaveProperty('id');
    expect(registerBody.data).not.toHaveProperty('accessToken');
    expect(registerBody.data).not.toHaveProperty('refreshToken');
    expect(registerContext.responseHeaders['cache-control']).toBe('no-store');
    expect(registerContext.responseHeaders.pragma).toBe('no-cache');
    expect(registerContext.responseHeaders['set-cookie:tilty_scaffold_access_token']).toContain('httpOnly');
    expect(registerContext.responseHeaders['set-cookie:tilty_scaffold_refresh_token']).toContain('httpOnly');

    const loginContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/login'),
      createTestContext({
        identifier: credentials.username,
        password: credentials.password,
      }),
    );
    const loginBody = loginContext.body as AuthSessionBody;
    const authCookie = getAuthCookie(loginContext, 'tilty_scaffold_access_token');

    expect(loginBody.data.user.email).toBe(credentials.email);
    expect(loginBody.data.user).not.toHaveProperty('id');
    expect(loginBody.data).not.toHaveProperty('accessToken');
    expect(loginBody.data).not.toHaveProperty('refreshToken');
    expect(loginContext.responseHeaders['cache-control']).toBe('no-store');
    expect(authCookie).toEqual(expect.any(String));

    const meContext = await runRoute(
      userRoutes,
      'get',
      '/me',
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: authCookie,
        },
      }),
    );
    const meBody = meContext.body as AuthUserBody;

    expect(meBody.data).toMatchObject({
      username: credentials.username,
      displayName: credentials.displayName,
      email: credentials.email,
      emailVerified: false,
      phoneVerified: false,
    });
    expect(meBody.data).not.toHaveProperty('id');
  });

  it('clears the authenticated session cookie on logout', async () => {
    const session = await services.auth.register({
      username: 'logout_user',
      displayName: 'Logout User',
      email: 'logout@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const context = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/logout'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_refresh_token: session.refreshToken,
        },
      }),
    );
    const accessCookie = context.responseHeaders['set-cookie:tilty_scaffold_access_token'];
    const refreshCookie = context.responseHeaders['set-cookie:tilty_scaffold_refresh_token'];

    expect(context.body).toEqual({
      code: 200,
      error: null,
      data: {
        signedOut: true,
      },
    });
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
    expect(JSON.parse(accessCookie!)).toMatchObject({
      httpOnly: true,
      maxAge: 0,
      value: '',
    });
    expect(JSON.parse(refreshCookie!)).toMatchObject({
      httpOnly: true,
      maxAge: 0,
      value: '',
    });
    await expect(services.auth.refreshSession(session.refreshToken)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
    await expect(services.auth.getCurrentUser(session.accessToken)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
  });

  it('refreshes authenticated sessions with a refresh token cookie', async () => {
    const session = await services.auth.register({
      username: 'refresh_user',
      displayName: 'Refresh User',
      email: 'refresh@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const context = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/refresh'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_refresh_token: session.refreshToken,
        },
      }),
    );
    const body = context.body as AuthSessionBody;
    const accessCookie = getAuthCookie(context, 'tilty_scaffold_access_token');
    const refreshCookie = getAuthCookie(context, 'tilty_scaffold_refresh_token');

    expect(body.data.user.email).toBe('refresh@example.com');
    expect(body.data.user).not.toHaveProperty('id');
    expect(body.data).not.toHaveProperty('accessToken');
    expect(body.data).not.toHaveProperty('refreshToken');
    expect(refreshCookie).toEqual(expect.any(String));
    expect(refreshCookie).not.toBe(session.refreshToken);
    expect(context.responseHeaders['cache-control']).toBe('no-store');
    expect(context.responseHeaders['set-cookie:tilty_scaffold_access_token']).toContain('httpOnly');
    expect(context.responseHeaders['set-cookie:tilty_scaffold_refresh_token']).toContain('httpOnly');
    await expect(services.auth.refreshSession(session.refreshToken)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
    await expect(services.auth.refreshSession(refreshCookie)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
    await expect(services.auth.getCurrentUser(accessCookie)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
  });

  it('clears authentication cookies when refresh token validation fails', async () => {
    const context = createTestContext(undefined, {}, undefined, {
      cookies: {
        tilty_scaffold_refresh_token: 'invalid-refresh-token',
      },
    });

    await expect(runMiddleware(getTestRouteHandler(routes, 'post', '/refresh'), context)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      status: 401,
    });

    expect(context.responseHeaders['cache-control']).toBe('no-store');
    expect(JSON.parse(context.responseHeaders['set-cookie:tilty_scaffold_access_token']!)).toMatchObject({
      maxAge: 0,
      value: '',
    });
    expect(JSON.parse(context.responseHeaders['set-cookie:tilty_scaffold_refresh_token']!)).toMatchObject({
      maxAge: 0,
      value: '',
    });
  });

  it('rejects refresh tokens when cache consumption loses a race', async () => {
    const cacheStore = new RejectingCompareAndSetCacheStore();
    const authService = createAuthService({
      fileStorage,
      cacheStore,
    });
    const session = await authService.register({
      username: 'refresh_race_user',
      displayName: 'Refresh Race User',
      email: 'refresh-race@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    await expect(authService.refreshSession(session.refreshToken)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
      status: 401,
    });
    expect(cacheStore.compareAndSetCalls).toBe(1);
  });

  it('sets auto secure cookies only for secure requests', async () => {
    const session = await services.auth.register({
      username: 'cookie_user',
      displayName: 'Cookie User',
      email: 'cookie@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const insecureContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/refresh'),
      createTestContext(undefined, { 'x-forwarded-proto': 'https' }, undefined, {
        cookies: {
          tilty_scaffold_refresh_token: session.refreshToken,
        },
      }),
    );
    const insecureAccessCookie = JSON.parse(
      insecureContext.responseHeaders['set-cookie:tilty_scaffold_access_token']!,
    ) as { secure?: boolean };
    const secureContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/refresh'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_refresh_token: getAuthCookie(insecureContext, 'tilty_scaffold_refresh_token'),
        },
        secure: true,
      }),
    );
    const secureAccessCookie = JSON.parse(secureContext.responseHeaders['set-cookie:tilty_scaffold_access_token']!) as {
      secure?: boolean;
    };

    expect(insecureAccessCookie.secure).toBe(false);
    expect(secureAccessCookie.secure).toBe(true);
  });

  it('uploads the current user avatar', async () => {
    const session = await services.auth.register({
      username: 'avatar_user',
      displayName: 'Avatar User',
      email: 'avatar@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await services.auth.uploadAvatar(session.accessToken, {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'avatar.png',
    });

    expect(user.avatarUrl).toMatch(/^\/uploads\/avatars\/.+\.png$/);
    expect(fileStorage.saved?.contentType).toBe('image/png');
    expect(fileStorage.saved?.key).toMatch(/^avatars\/[^/]+\.png$/);
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.toMatchObject({
      avatarUrl: user.avatarUrl,
    });
  });

  it('uploads the current user profile banner', async () => {
    const session = await services.auth.register({
      username: 'profile_banner_user',
      displayName: 'Profile Banner User',
      email: 'profile-banner@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await services.auth.uploadProfileBanner(session.accessToken, {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'profile-banner.png',
    });

    expect(user.profileBannerUrl).toMatch(/^\/uploads\/profile-banners\/.+\.png$/);
    expect(fileStorage.saved?.contentType).toBe('image/png');
    expect(fileStorage.saved?.key).toMatch(/^profile-banners\/[^/]+\.png$/);
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.toMatchObject({
      profileBannerUrl: user.profileBannerUrl,
    });
  });

  it('uploads the current user profile background', async () => {
    const session = await services.auth.register({
      username: 'profile_background_user',
      displayName: 'Profile Background User',
      email: 'profile-background@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await services.auth.uploadProfileBackground(session.accessToken, {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'profile-background.png',
    });

    expect(user.profileBackgroundUrl).toMatch(/^\/uploads\/profile-backgrounds\/.+\.png$/);
    expect(fileStorage.saved?.contentType).toBe('image/png');
    expect(fileStorage.saved?.key).toMatch(/^profile-backgrounds\/[^/]+\.png$/);
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.toMatchObject({
      profileBackgroundUrl: user.profileBackgroundUrl,
    });
  });

  it('removes the previous profile banner object after replacement', async () => {
    const session = await services.auth.register({
      username: 'profile_banner_replace_user',
      displayName: 'Profile Banner Replace User',
      email: 'profile-banner-replace@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const upload = {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'profile-banner.png',
    };

    await services.auth.uploadProfileBanner(session.accessToken, upload);
    const firstKey = fileStorage.saved?.key;
    await services.auth.uploadProfileBanner(session.accessToken, upload);

    expect(firstKey).toEqual(expect.any(String));
    expect(fileStorage.deletedKeys).toEqual([firstKey]);
  });

  it('removes the previous profile background object after replacement', async () => {
    const session = await services.auth.register({
      username: 'profile_background_replace_user',
      displayName: 'Profile Background Replace User',
      email: 'profile-background-replace@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const upload = {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'profile-background.png',
    };

    await services.auth.uploadProfileBackground(session.accessToken, upload);
    const firstKey = fileStorage.saved?.key;
    await services.auth.uploadProfileBackground(session.accessToken, upload);

    expect(firstKey).toEqual(expect.any(String));
    expect(fileStorage.deletedKeys).toEqual([firstKey]);
  });

  it('deletes the current user avatar', async () => {
    const session = await services.auth.register({
      username: 'avatar_delete_user',
      displayName: 'Avatar Delete User',
      email: 'avatar-delete@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    await services.auth.uploadAvatar(session.accessToken, {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'avatar.png',
    });
    const avatarKey = fileStorage.saved?.key;
    const user = await services.auth.deleteAvatar(session.accessToken);

    expect(avatarKey).toEqual(expect.any(String));
    expect(fileStorage.deletedKeys).toEqual([avatarKey]);
    expect(user).not.toHaveProperty('avatarUrl');
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.not.toHaveProperty('avatarUrl');
  });

  it('deletes the current user profile banner', async () => {
    const session = await services.auth.register({
      username: 'profile_banner_delete_user',
      displayName: 'Profile Banner Delete User',
      email: 'profile-banner-delete@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    await services.auth.uploadProfileBanner(session.accessToken, {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'profile-banner.png',
    });
    const profileBannerKey = fileStorage.saved?.key;
    const user = await services.auth.deleteProfileBanner(session.accessToken);

    expect(profileBannerKey).toEqual(expect.any(String));
    expect(fileStorage.deletedKeys).toEqual([profileBannerKey]);
    expect(user).not.toHaveProperty('profileBannerUrl');
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.not.toHaveProperty('profileBannerUrl');
  });

  it('deletes the current user profile background', async () => {
    const session = await services.auth.register({
      username: 'profile_background_delete_user',
      displayName: 'Profile Background Delete User',
      email: 'profile-background-delete@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    await services.auth.uploadProfileBackground(session.accessToken, {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'profile-background.png',
    });
    const profileBackgroundKey = fileStorage.saved?.key;
    const user = await services.auth.deleteProfileBackground(session.accessToken);

    expect(profileBackgroundKey).toEqual(expect.any(String));
    expect(fileStorage.deletedKeys).toEqual([profileBackgroundKey]);
    expect(user).not.toHaveProperty('profileBackgroundUrl');
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.not.toHaveProperty('profileBackgroundUrl');
  });

  it('updates the current user profile details', async () => {
    const session = await services.auth.register({
      username: 'profile_user',
      displayName: 'Profile User',
      email: 'profile@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const context = await runRoute(
      userRoutes,
      'patch',
      '/me',
      createTestContext(
        {
          displayName: 'Updated Profile User',
          gender: 'Wuzhuang Helicopter',
          birthday: '2008-05-23',
          bio: 'Frontend is waking up.',
          location: 'Chaoyang, Beijing',
          websiteUrl: 'https://www.tiltysola.com/',
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const body = context.body as AuthUserBody;

    expect(body.data).toMatchObject({
      username: 'profile_user',
      displayName: 'Updated Profile User',
      gender: 'Wuzhuang Helicopter',
      birthday: '2008-05-23',
      bio: 'Frontend is waking up.',
      location: 'Chaoyang, Beijing',
      websiteUrl: 'https://www.tiltysola.com/',
      email: 'profile@example.com',
    });
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.toMatchObject({
      displayName: 'Updated Profile User',
      gender: 'Wuzhuang Helicopter',
      birthday: '2008-05-23',
      bio: 'Frontend is waking up.',
      location: 'Chaoyang, Beijing',
      websiteUrl: 'https://www.tiltysola.com/',
    });
  });

  it('changes the current user password and revokes other device sessions', async () => {
    const credentials = {
      username: 'change_password_user',
      displayName: 'Change Password User',
      email: 'change-password@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    };
    const currentSession = await services.auth.register(credentials);
    const otherSession = await services.auth.login({
      identifier: credentials.email,
      password: credentials.password,
    });
    const context = await runMiddleware(
      getTestRouteHandler(routes, 'patch', '/password'),
      createTestContext(
        {
          currentPassword: 'password123',
          password: 'newpassword123',
          confirmPassword: 'newpassword123',
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: currentSession.accessToken,
          },
        },
      ),
    );

    expect(context.body).toEqual({
      code: 200,
      error: null,
      data: {
        changed: true,
      },
    });
    expect(context.responseHeaders['cache-control']).toBe('no-store');
    await expect(services.auth.getCurrentUser(currentSession.accessToken)).resolves.toMatchObject({
      email: credentials.email,
    });
    await expect(services.auth.getCurrentUser(otherSession.accessToken)).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
      status: 401,
    });
    await expect(
      services.auth.login({
        identifier: credentials.email,
        password: 'password123',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
    });
    await expect(
      services.auth.login({
        identifier: credentials.email,
        password: 'newpassword123',
      }),
    ).resolves.toMatchObject({
      user: {
        email: credentials.email,
      },
    });
  });

  it('requires step-up verification for password changes when an email verifier is available', async () => {
    let sentCode = '';
    const emailVerification = new EmailVerificationService({
      codeCooldownMs: 60_000,
      codeExpiresInMs: 10 * 60_000,
      sender: {
        send: async (input) => {
          sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
        },
      },
    });
    const authService = createAuthService({ emailVerification });
    const session = await services.auth.register({
      username: 'change_password_email_user',
      displayName: 'Change Password Email User',
      email: 'change-password-email@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await models.user.findOne({
      where: {
        email: 'change-password-email@example.com',
      },
    });

    expect(user).toBeTruthy();
    user!.emailVerified = true;
    await user!.save();

    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
    userRoutes = createCurrentUserRoutes(authService);

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'patch', '/password'),
        createTestContext(
          {
            currentPassword: 'password123',
            password: 'newpassword123',
            confirmPassword: 'newpassword123',
          },
          {},
          undefined,
          {
            cookies: {
              tilty_scaffold_access_token: session.accessToken,
            },
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_VERIFICATION_REQUIRED',
      status: 403,
    });

    const challengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/challenges'),
      createTestContext(
        {
          purpose: AuthVerificationPurpose.ChangePassword,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const challengeBody = challengeContext.body as VerificationRequiredBody;

    expect(challengeBody.data).toMatchObject({
      requiresVerification: true,
      defaultMethod: 'email',
      purpose: AuthVerificationPurpose.ChangePassword,
    });
    expect(challengeBody.data.methods.map((method) => method.method)).toEqual(['email']);

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/code'),
      createTestContext({
        method: 'email',
        verificationToken: challengeBody.data.verificationToken,
      }),
    );

    expect(sentCode).toMatch(/^\d{6}$/);

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/confirm'),
      createTestContext({
        code: sentCode,
        method: 'email',
        verificationToken: challengeBody.data.verificationToken,
      }),
    );

    const changeContext = await runMiddleware(
      getTestRouteHandler(routes, 'patch', '/password'),
      createTestContext(
        {
          currentPassword: 'password123',
          password: 'newpassword123',
          confirmPassword: 'newpassword123',
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );

    expect(changeContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        changed: true,
      },
    });
    await expect(
      authService.login({
        identifier: 'change-password-email@example.com',
        password: 'newpassword123',
      }),
    ).resolves.toMatchObject({
      user: {
        email: 'change-password-email@example.com',
      },
    });
  });

  it('rejects current user password changes with an invalid current password', async () => {
    const session = await services.auth.register({
      username: 'change_password_invalid_user',
      displayName: 'Change Password Invalid User',
      email: 'change-password-invalid@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'patch', '/password'),
        createTestContext(
          {
            currentPassword: 'wrongpassword',
            password: 'newpassword123',
            confirmPassword: 'newpassword123',
          },
          {},
          undefined,
          {
            cookies: {
              tilty_scaffold_access_token: session.accessToken,
            },
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
    });
    await expect(
      services.auth.login({
        identifier: 'change-password-invalid@example.com',
        password: 'password123',
      }),
    ).resolves.toMatchObject({
      user: {
        email: 'change-password-invalid@example.com',
      },
    });
  });

  it('rejects current user password changes when the new password matches the current password', async () => {
    const session = await services.auth.register({
      username: 'change_password_same_user',
      displayName: 'Change Password Same User',
      email: 'change-password-same@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'patch', '/password'),
        createTestContext(
          {
            currentPassword: 'password123',
            password: 'password123',
            confirmPassword: 'password123',
          },
          {},
          undefined,
          {
            cookies: {
              tilty_scaffold_access_token: session.accessToken,
            },
          },
        ),
      ),
    ).rejects.toMatchObject({
      name: 'ZodError',
    });
  });

  it('rejects direct phone number binding without SMS verification', async () => {
    const session = await services.auth.register({
      username: 'phone_user',
      displayName: 'Phone User',
      email: 'phone@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    await expect(
      runRoute(
        userRoutes,
        'patch',
        '/me',
        createTestContext(
          {
            displayName: 'Phone User',
            phoneNumber: '+86 138-0013-8000',
          },
          {},
          undefined,
          {
            cookies: {
              tilty_scaffold_access_token: session.accessToken,
            },
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'PHONE_VERIFICATION_REQUIRED',
      status: 400,
    });
  });

  it('removes the previous avatar object after replacement', async () => {
    const session = await services.auth.register({
      username: 'avatar_replace_user',
      displayName: 'Avatar Replace User',
      email: 'avatar-replace@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const upload = {
      content: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      contentType: 'image/png',
      filename: 'avatar.png',
    };

    await services.auth.uploadAvatar(session.accessToken, upload);
    const firstKey = fileStorage.saved?.key;
    await services.auth.uploadAvatar(session.accessToken, upload);

    expect(firstKey).toEqual(expect.any(String));
    expect(fileStorage.deletedKeys).toEqual([firstKey]);
  });

  it('applies rate limiting middleware to avatar uploads', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const avatarRoute = createCurrentUserRoutes(services.auth, rateLimit).find(
      (route) => route.method === 'post' && route.path === '/me/avatar',
    );

    expect(avatarRoute?.handlers[1]).toBe(rateLimit);
  });

  it('applies rate limiting middleware to avatar deletion', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const avatarRoute = createCurrentUserRoutes(services.auth, rateLimit).find(
      (route) => route.method === 'delete' && route.path === '/me/avatar',
    );

    expect(avatarRoute?.handlers[1]).toBe(rateLimit);
  });

  it('applies rate limiting middleware to profile banner uploads', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const profileBannerRoute = createCurrentUserRoutes(services.auth, rateLimit).find(
      (route) => route.method === 'post' && route.path === '/me/profile-banner',
    );

    expect(profileBannerRoute?.handlers[1]).toBe(rateLimit);
  });

  it('applies rate limiting middleware to profile banner deletion', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const profileBannerRoute = createCurrentUserRoutes(services.auth, rateLimit).find(
      (route) => route.method === 'delete' && route.path === '/me/profile-banner',
    );

    expect(profileBannerRoute?.handlers[1]).toBe(rateLimit);
  });

  it('applies rate limiting middleware to profile background uploads', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const profileBackgroundRoute = createCurrentUserRoutes(services.auth, rateLimit).find(
      (route) => route.method === 'post' && route.path === '/me/profile-background',
    );

    expect(profileBackgroundRoute?.handlers[1]).toBe(rateLimit);
  });

  it('applies rate limiting middleware to profile background deletion', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const profileBackgroundRoute = createCurrentUserRoutes(services.auth, rateLimit).find(
      (route) => route.method === 'delete' && route.path === '/me/profile-background',
    );

    expect(profileBackgroundRoute?.handlers[1]).toBe(rateLimit);
  });

  it('applies rate limiting middleware to profile updates', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const profileRoute = createCurrentUserRoutes(services.auth, rateLimit).find(
      (route) => route.method === 'patch' && route.path === '/me',
    );

    expect(profileRoute?.handlers[1]).toBe(rateLimit);
  });

  it('applies rate limiting middleware to password changes', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const passwordRoute = createAuthModule(services.auth, {
      cookies: defaultAuthCookieConfig,
      rateLimit,
      ssoService: services.sso,
    }).routes.find((route) => route.method === 'patch' && route.path === '/password');

    expect(passwordRoute?.handlers[0]).toBe(rateLimit);
  });

  it('rejects duplicate email registration', async () => {
    const credentials = {
      username: 'duplicate_user',
      displayName: 'Test User',
      email: 'duplicate@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    };

    await runMiddleware(getTestRouteHandler(routes, 'post', '/register'), createTestContext(credentials));

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'post', '/register'),
        createTestContext({ ...credentials, username: 'other_user', displayName: 'Other User' }),
      ),
    ).rejects.toMatchObject({
      code: 'USER_EMAIL_EXISTS',
      status: 409,
    });
  });

  it('rejects duplicate username registration', async () => {
    const credentials = {
      username: 'duplicate_username',
      displayName: 'Duplicate Username',
      email: 'duplicate-username@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    };

    await runMiddleware(getTestRouteHandler(routes, 'post', '/register'), createTestContext(credentials));

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'post', '/register'),
        createTestContext({
          ...credentials,
          displayName: 'Other User',
          email: 'other-duplicate-username@example.com',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'USER_USERNAME_EXISTS',
      status: 409,
    });
  });

  it('rejects mismatched registration password confirmation', async () => {
    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'post', '/register'),
        createTestContext({
          username: 'test_user',
          displayName: 'Test User',
          email: 'mismatch@example.com',
          password: 'password123',
          confirmPassword: 'different123',
        }),
      ),
    ).rejects.toMatchObject({
      name: 'ZodError',
    });
  });

  it('returns disabled auth public configuration by default', async () => {
    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/config'), createTestContext());

    expect(context.body).toEqual({
      code: 200,
      error: null,
      data: {
        fileUploadMaxBytes: defaultFileUploadMaxBytes,
        passwordRecoveryEnabled: false,
        phoneCountryCodes: [],
        profileEmailVerificationEnabled: false,
        registrationEmailVerificationRequired: false,
      },
    });
  });

  it('returns SMS country codes in auth public configuration when SMS is enabled', async () => {
    const smsSender: SmsSender = {
      send: async () => undefined,
    };
    const authService = createAuthService({
      smsVerification: new SmsVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        phoneCountryCodes: ['+86'],
        sender: smsSender,
      }),
    });
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;

    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/config'), createTestContext());

    expect(context.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        phoneCountryCodes: ['+86'],
      },
    });
  });

  it('returns the configured upload limit in auth public configuration', async () => {
    routes = createAuthModule(services.auth, {
      fileUploadMaxBytes: 1_048_576,
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;

    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/config'), createTestContext());

    expect(context.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        fileUploadMaxBytes: 1_048_576,
      },
    });
  });

  it('wires Aliyun SMS configuration into the auth service', () => {
    const configuredServices = createServices(models, {
      authTokenSecret,
      sms: {
        aliyunProfiles: [
          {
            phoneCountryCode: '+852',
            apiVersion: '2018-05-01',
            operation: 'SendMessageToGlobe',
            regionId: 'ap-southeast-1',
            endpoint: 'dysmsapi.ap-southeast-1.aliyuncs.com',
            accessKeyId: 'sms-access-key-id',
            accessKeySecret: 'sms-access-key-secret',
            messageTemplate: 'Your verification code is ${code}.',
            type: 'OTP',
          },
        ],
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
      },
    });

    expect(configuredServices.auth.getPublicConfig().phoneCountryCodes).toEqual(['+852']);
  });

  it('requires a registration email verification code when email is enabled', async () => {
    let sentCode = '';
    const sender: EmailSender = {
      send: async (input) => {
        sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
      },
    };
    const authService = createAuthService({
      emailVerification: new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender,
      }),
    });
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;

    const configContext = await runMiddleware(getTestRouteHandler(routes, 'get', '/config'), createTestContext());

    expect(configContext.body).toEqual({
      code: 200,
      error: null,
      data: {
        fileUploadMaxBytes: defaultFileUploadMaxBytes,
        passwordRecoveryEnabled: true,
        phoneCountryCodes: [],
        profileEmailVerificationEnabled: true,
        registrationEmailVerificationRequired: true,
      },
    });

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/register/email-verification'),
      createTestContext({
        email: 'verified@example.com',
      }),
    );

    expect(sentCode).toMatch(/^\d{6}$/);

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'post', '/register'),
        createTestContext({
          username: 'verified_user',
          displayName: 'Verified User',
          email: 'verified@example.com',
          password: 'password123',
          confirmPassword: 'password123',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      status: 400,
    });

    const registerContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/register'),
      createTestContext({
        username: 'verified_user',
        displayName: 'Verified User',
        email: 'verified@example.com',
        emailVerificationCode: sentCode,
        password: 'password123',
        confirmPassword: 'password123',
      }),
    );
    const registerBody = registerContext.body as AuthSessionBody;

    expect(registerContext.status).toBe(201);
    expect(registerBody.data.user.email).toBe('verified@example.com');
    expect(registerBody.data.user.emailVerified).toBe(true);
  });

  it('verifies the current profile email with an emailed verification code', async () => {
    let sentCode = '';
    const sender: EmailSender = {
      send: async (input) => {
        sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
      },
    };
    const session = await services.auth.register({
      username: 'profile_email_user',
      displayName: 'Profile Email User',
      email: 'profile-email@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const authService = createAuthService({
      emailVerification: new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender,
      }),
    });
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
    userRoutes = createCurrentUserRoutes(authService);

    const challengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/challenges'),
      createTestContext(
        {
          purpose: AuthVerificationPurpose.UpdateContact,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const challengeBody = challengeContext.body as VerificationRequiredBody;

    expect(challengeBody.data).toMatchObject({
      requiresVerification: true,
      defaultMethod: 'password',
      purpose: AuthVerificationPurpose.UpdateContact,
    });

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/confirm'),
      createTestContext({
        method: 'password',
        password: 'password123',
        verificationToken: challengeBody.data.verificationToken,
      }),
    );

    const sendContext = await runRoute(
      userRoutes,
      'post',
      '/me/email-verification',
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: session.accessToken,
        },
      }),
    );

    expect(sendContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        cooldownSeconds: 60,
        expiresInSeconds: 600,
      },
    });
    expect(sentCode).toMatch(/^\d{6}$/);

    const verifyContext = await runRoute(
      userRoutes,
      'post',
      '/me/email-verification/confirm',
      createTestContext(
        {
          emailVerificationCode: sentCode,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const verifyBody = verifyContext.body as AuthUserBody;
    const user = await models.user.findOne({ where: { email: 'profile-email@example.com' } });

    expect(verifyBody.data.emailVerified).toBe(true);
    expect(user?.emailVerified).toBe(true);
  });

  it('verifies the current profile phone with an SMS verification code', async () => {
    let sentCode = '';
    const emailSender: EmailSender = {
      send: async () => undefined,
    };
    const sender: SmsSender = {
      send: async (input) => {
        sentCode = input.code;
      },
    };
    const session = await services.auth.register({
      username: 'profile_phone_user',
      displayName: 'Profile Phone User',
      email: 'profile-phone@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await models.user.findOne({ where: { email: 'profile-phone@example.com' } });
    user!.emailVerified = true;
    await user!.save();
    const authService = createAuthService({
      emailVerification: new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender: emailSender,
      }),
      smsVerification: new SmsVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        phoneCountryCodes: ['+86'],
        sender,
      }),
    });
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
    userRoutes = createCurrentUserRoutes(authService);

    const challengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/challenges'),
      createTestContext(
        {
          purpose: AuthVerificationPurpose.UpdateContact,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const challengeBody = challengeContext.body as VerificationRequiredBody;

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/confirm'),
      createTestContext({
        method: 'password',
        password: 'password123',
        verificationToken: challengeBody.data.verificationToken,
      }),
    );

    const sendContext = await runRoute(
      userRoutes,
      'post',
      '/me/phone-verification',
      createTestContext(
        {
          phoneNumber: '+8613800138000',
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );

    expect(sendContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        cooldownSeconds: 60,
        expiresInSeconds: 600,
      },
    });
    expect(sentCode).toMatch(/^\d{6}$/);

    const verifyContext = await runRoute(
      userRoutes,
      'post',
      '/me/phone-verification/confirm',
      createTestContext(
        {
          phoneNumber: '+8613800138000',
          phoneVerificationCode: sentCode,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const verifyBody = verifyContext.body as AuthUserBody;
    const verifiedUser = await models.user.findOne({ where: { email: 'profile-phone@example.com' } });

    expect(verifyBody.data.phoneNumber).toBe('+8613800138000');
    expect(verifyBody.data.phoneVerified).toBe(true);
    expect(verifiedUser?.phoneNumber).toBe('+8613800138000');
    expect(verifiedUser?.phoneVerified).toBe(true);
  });

  it('resets passwords with emailed verification codes when email is enabled', async () => {
    let sentCode = '';
    const sender: EmailSender = {
      send: async (input) => {
        sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
      },
    };
    const authService = createAuthService({
      emailVerification: new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender,
      }),
    });
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;

    await models.user.create({
      username: 'reset_user',
      displayName: 'Reset User',
      email: 'reset@example.com',
      passwordHash: 'old-password-hash',
      passwordSalt: 'old-password-salt',
    });

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/password-reset/email-verification'),
      createTestContext({
        email: 'reset@example.com',
      }),
    );

    expect(sentCode).toMatch(/^\d{6}$/);

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/password-reset'),
      createTestContext({
        email: 'reset@example.com',
        emailVerificationCode: sentCode,
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      }),
    );

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'post', '/login'),
        createTestContext({
          identifier: 'reset@example.com',
          password: 'password123',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
    });

    const loginContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/login'),
      createTestContext({
        identifier: 'reset@example.com',
        password: 'newpassword123',
      }),
    );
    const loginBody = loginContext.body as AuthSessionBody;

    expect(loginBody.data.user.email).toBe('reset@example.com');
  });

  it('rejects password recovery when email verification is disabled', async () => {
    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'post', '/password-reset/email-verification'),
        createTestContext({
          email: 'user@example.com',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_DISABLED',
      status: 404,
    });
  });

  it('returns disabled SSO public configuration by default', async () => {
    const context = await runMiddleware(getTestRouteHandler(routes, 'get', '/sso/config'), createTestContext());

    expect(context.body).toEqual({
      code: 200,
      error: null,
      data: {
        enabled: false,
        loginEnabled: false,
        providers: [],
      },
    });
  });

  it('requires step-up verification before starting profile SSO binding', async () => {
    const session = await services.auth.register({
      username: 'sso_bind_user',
      displayName: 'SSO Bind User',
      email: 'sso-bind@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const bindStartRoute = getTestRoute(routes, 'get', '/sso/bind/start');
    const blockedContext = await runMiddlewares(
      [errorMiddleware(), ...bindStartRoute.handlers],
      createTestContext(undefined, { accept: 'text/html' }, undefined, {
        cookies: {
          tilty_scaffold_access_token: session.accessToken,
        },
        query: {
          redirect: '/profile',
        },
      }),
    );

    expect(blockedContext.status).toBe(403);
    expect(blockedContext.body).toMatchObject({
      error: 'AUTH_VERIFICATION_REQUIRED',
      details: {
        purpose: AuthVerificationPurpose.ManageSso,
      },
    });

    const challenge = await services.auth.createVerificationChallenge(
      session.accessToken,
      AuthVerificationPurpose.ManageSso,
      defaultAuthSessionRequestContext,
    );

    if (!('verificationToken' in challenge)) {
      throw new Error('SSO binding should require password verification when no MFA method exists.');
    }

    await services.auth.verifyAuthenticationChallenge(
      {
        method: 'password',
        password: 'password123',
        verificationToken: challenge.verificationToken,
      },
      defaultAuthSessionRequestContext,
    );

    const verifiedContext = await runMiddlewares(
      [errorMiddleware(), ...bindStartRoute.handlers],
      createTestContext(undefined, { accept: 'text/html' }, undefined, {
        cookies: {
          tilty_scaffold_access_token: session.accessToken,
        },
        query: {
          redirect: '/profile',
        },
      }),
    );

    expect(verifiedContext.status).toBe(404);
    expect(verifiedContext.body).toMatchObject({
      error: 'SSO_DISABLED',
    });
  });

  it('requires two-step verification for enabled accounts before issuing session cookies', async () => {
    await services.auth.register({
      username: 'totp_user',
      displayName: 'TOTP User',
      email: 'totp@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await models.user.findOne({
      where: {
        email: 'totp@example.com',
      },
    });

    expect(user).toBeTruthy();

    const setup = await services.totp.createSetup(user!);
    const setupCode = createTotpCode(setup.secret);
    const enableResult = await services.totp.enable(user!, setup.setupToken, setupCode);

    expect(services.totp.getStatus(user!)).toMatchObject({
      enabled: true,
      recoveryCodesRemaining: 10,
    });
    expect(enableResult.recoveryCodes).toHaveLength(10);

    const loginContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/login'),
      createTestContext({
        identifier: 'totp@example.com',
        password: 'password123',
      }),
    );
    const loginBody = loginContext.body as VerificationRequiredBody;

    expect(loginBody.data).toMatchObject({
      requiresVerification: true,
      defaultMethod: 'totp',
      purpose: AuthVerificationPurpose.Login,
      remainingAttempts: 5,
    });
    expect(loginBody.data.verificationToken).toEqual(expect.any(String));
    expect(loginBody.data.methods.map((method) => method.method)).toEqual(['totp']);
    expect(loginContext.responseHeaders['set-cookie:tilty_scaffold_access_token']).toBeUndefined();
    expect(loginContext.responseHeaders['set-cookie:tilty_scaffold_refresh_token']).toBeUndefined();

    const verifyContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/confirm'),
      createTestContext({
        code: createTotpCode(setup.secret),
        method: 'totp',
        verificationToken: loginBody.data.verificationToken,
      }),
    );
    const verifyBody = verifyContext.body as AuthSessionBody;

    expect(verifyBody.data.user.email).toBe('totp@example.com');
    expect(getAuthCookie(verifyContext, 'tilty_scaffold_access_token')).toEqual(expect.any(String));
    expect(getAuthCookie(verifyContext, 'tilty_scaffold_refresh_token')).toEqual(expect.any(String));
  });

  it('omits presentation labels from verification method descriptors', async () => {
    await services.auth.register({
      username: 'totp_locale_user',
      displayName: 'TOTP Locale User',
      email: 'totp-locale@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await models.user.findOne({
      where: {
        email: 'totp-locale@example.com',
      },
    });

    expect(user).toBeTruthy();

    const setup = await services.totp.createSetup(user!);
    await services.totp.enable(user!, setup.setupToken, createTotpCode(setup.secret));

    const loginContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/login'),
      createTestContext({
        identifier: 'totp-locale@example.com',
        password: 'password123',
      }),
    );
    const loginBody = loginContext.body as VerificationRequiredBody;

    expect(loginBody.data.methods).toMatchObject([
      {
        method: 'totp',
      },
    ]);
    expect(loginBody.data.methods[0]).not.toHaveProperty('label');
  });

  it('keeps the authenticator setup token valid after an invalid setup code', async () => {
    await services.auth.register({
      username: 'totp_retry_user',
      displayName: 'TOTP Retry User',
      email: 'totp-retry@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await models.user.findOne({
      where: {
        email: 'totp-retry@example.com',
      },
    });

    expect(user).toBeTruthy();

    const setup = await services.totp.createSetup(user!);
    const validCode = createTotpCode(setup.secret);
    const invalidCode = validCode === '000000' ? '000001' : '000000';

    await expect(services.totp.enable(user!, setup.setupToken, invalidCode)).rejects.toMatchObject({
      code: 'TOTP_CODE_INVALID',
      status: 401,
    });

    const enableResult = await services.totp.enable(user!, setup.setupToken, validCode);

    expect(enableResult.recoveryCodes).toHaveLength(10);
    expect(services.totp.getStatus(user!)).toMatchObject({
      enabled: true,
      recoveryCodesRemaining: 10,
    });
  });

  it('toggles contact-method MFA and falls back to password verification when disabled', async () => {
    const authService = createAuthService({
      emailVerification: new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender: {
          send: async () => undefined,
        },
      }),
      smsVerification: new SmsVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        phoneCountryCodes: ['+86'],
        sender: {
          send: async () => undefined,
        },
      }),
    });
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
    const session = await services.auth.register({
      username: 'contact_mfa_user',
      displayName: 'Contact MFA User',
      email: 'contact-mfa@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await models.user.findOne({ where: { email: 'contact-mfa@example.com' } });

    user!.emailVerified = true;
    user!.phoneNumber = '+8613800138000';
    user!.phoneVerified = true;
    await user!.save();

    const unverifiedContactSession = await services.auth.login({
      identifier: 'contact-mfa@example.com',
      password: 'password123',
    });

    const settingsContext = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/mfa'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: session.accessToken,
        },
      }),
    );

    expect(settingsContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        availableMethods: ['sms', 'email'],
        effectiveMethods: [],
        mfaRequiredForSso: true,
        passkeyCount: 0,
        twoStepCanDisable: true,
        twoStepCanEnable: true,
        twoStepEnabled: false,
      },
    });

    const loginContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/login'),
      createTestContext({
        identifier: 'contact-mfa@example.com',
        password: 'password123',
      }),
    );
    const loginBody = loginContext.body as AuthSessionBody;

    expect(loginBody.data.user.email).toBe('contact-mfa@example.com');

    const sudoChallengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/challenges'),
      createTestContext(
        {
          purpose: AuthVerificationPurpose.ManageMfa,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const sudoChallengeBody = sudoChallengeContext.body as VerificationRequiredBody;

    expect(sudoChallengeBody.data.defaultMethod).toBe('password');

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/confirm'),
      createTestContext({
        method: 'password',
        password: 'password123',
        verificationToken: sudoChallengeBody.data.verificationToken,
      }),
    );

    const updateContext = await runMiddleware(
      getTestRouteHandler(routes, 'patch', '/mfa'),
      createTestContext(
        {
          enabled: true,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );

    expect(updateContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        availableMethods: ['sms', 'email'],
        effectiveMethods: ['sms', 'email'],
        twoStepCanDisable: true,
        twoStepCanEnable: true,
        twoStepEnabled: true,
      },
    });

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'patch', '/password'),
        createTestContext(
          {
            currentPassword: 'password123',
            password: 'newpassword123',
            confirmPassword: 'newpassword123',
          },
          {},
          undefined,
          {
            cookies: {
              tilty_scaffold_access_token: unverifiedContactSession.accessToken,
            },
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_VERIFICATION_REQUIRED',
      status: 403,
    });

    const changePasswordChallengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/challenges'),
      createTestContext(
        {
          purpose: AuthVerificationPurpose.ChangePassword,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: unverifiedContactSession.accessToken,
          },
        },
      ),
    );
    const changePasswordChallengeBody = changePasswordChallengeContext.body as VerificationRequiredBody;

    expect(changePasswordChallengeBody.data.defaultMethod).toBe('sms');
    expect(changePasswordChallengeBody.data.methods.map((method) => method.method)).toEqual(['sms', 'email']);

    const mfaRoutes = routes;

    routes = createAuthModule(
      createAuthService({
        emailVerification: new EmailVerificationService({
          codeCooldownMs: 60_000,
          codeExpiresInMs: 10 * 60_000,
          sender: {
            send: async () => undefined,
          },
        }),
        smsVerification: new SmsVerificationService({
          codeCooldownMs: 60_000,
          codeExpiresInMs: 10 * 60_000,
          phoneCountryCodes: ['+86'],
          sender: {
            send: async () => undefined,
          },
        }),
      }),
      {
        cookies: defaultAuthCookieConfig,
        ssoService: services.sso,
      },
    ).routes;

    const contactChallengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/login'),
      createTestContext({
        identifier: 'contact-mfa@example.com',
        password: 'password123',
      }),
    );
    const contactChallengeBody = contactChallengeContext.body as VerificationRequiredBody;

    expect(contactChallengeBody.data.defaultMethod).toBe('sms');
    expect(contactChallengeBody.data.methods.map((method) => method.method)).toEqual(['sms', 'email']);

    const smsCodeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/code'),
      createTestContext({
        method: 'sms',
        verificationToken: contactChallengeBody.data.verificationToken,
      }),
    );
    const smsCodeBody = smsCodeContext.body as VerificationCodeSendBody;

    expect(smsCodeBody.data).toMatchObject({
      cooldownSeconds: expect.any(Number),
      expiresInSeconds: expect.any(Number),
      maskedTarget: '+86138****8000',
    });

    const emailCodeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/code'),
      createTestContext({
        method: 'email',
        verificationToken: contactChallengeBody.data.verificationToken,
      }),
    );
    const emailCodeBody = emailCodeContext.body as VerificationCodeSendBody;

    expect(emailCodeBody.data).toMatchObject({
      cooldownSeconds: expect.any(Number),
      expiresInSeconds: expect.any(Number),
      maskedTarget: '***@example.com',
    });

    const disableContext = await runMiddleware(
      getTestRouteHandler(mfaRoutes, 'patch', '/mfa'),
      createTestContext(
        {
          enabled: false,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );

    expect(disableContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        availableMethods: ['sms', 'email'],
        effectiveMethods: [],
        twoStepCanDisable: true,
        twoStepCanEnable: true,
        twoStepEnabled: false,
      },
    });
  });

  it('toggles strong-method MFA and prefers passkey before authenticator app', async () => {
    const authService = createAuthService({
      emailVerification: new EmailVerificationService({
        sender: {
          send: async () => undefined,
        },
      }),
      smsVerification: new SmsVerificationService({
        phoneCountryCodes: ['+86'],
        sender: {
          send: async () => undefined,
        },
      }),
    });
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;
    const session = await services.auth.register({
      username: 'strong_mfa_user',
      displayName: 'Strong MFA User',
      email: 'strong-mfa@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await models.user.findOne({ where: { email: 'strong-mfa@example.com' } });

    user!.emailVerified = true;
    user!.phoneNumber = '+8613800138001';
    user!.phoneVerified = true;
    await user!.save();

    const unverifiedSession = await services.auth.login({
      identifier: 'strong-mfa@example.com',
      password: 'password123',
    });

    const setup = await services.totp.createSetup(user!);
    await services.totp.enable(user!, setup.setupToken, createTotpCode(setup.secret));

    const settingsContext = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/mfa'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: session.accessToken,
        },
      }),
    );

    expect(settingsContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        availableMethods: ['totp', 'sms', 'email'],
        effectiveMethods: ['totp'],
        passkeyCount: 0,
        twoStepCanDisable: false,
        twoStepCanEnable: true,
        twoStepEnabled: true,
      },
    });

    const sudoChallengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/challenges'),
      createTestContext(
        {
          purpose: AuthVerificationPurpose.ManageMfa,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const sudoChallengeBody = sudoChallengeContext.body as VerificationRequiredBody;

    expect(sudoChallengeBody.data.defaultMethod).toBe('totp');
    expect(sudoChallengeBody.data.methods.map((method) => method.method)).toEqual(['totp']);

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/confirm'),
      createTestContext({
        code: createTotpCode(setup.secret),
        method: 'totp',
        verificationToken: sudoChallengeBody.data.verificationToken,
      }),
    );

    const updateContext = await runMiddleware(
      getTestRouteHandler(routes, 'patch', '/mfa'),
      createTestContext(
        {
          enabled: true,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );

    expect(updateContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        availableMethods: ['totp', 'sms', 'email'],
        effectiveMethods: ['totp'],
        twoStepCanDisable: false,
        twoStepCanEnable: true,
        twoStepEnabled: true,
      },
    });
    await user!.reload();
    expect(user!.mfaAllowedMethods).toBe('[]');

    await models.authPasskey.create({
      userId: user!.id,
      name: 'Strong MFA passkey',
      credentialId: 'strong-mfa-credential',
      publicKey: Buffer.from('public-key'),
      webauthnUserId: 'strong-mfa-webauthn-user',
      deviceType: 'singleDevice',
      backedUp: false,
      transports: '[]',
    });

    const mfaRoutes = routes;

    const passkeySettingsContext = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/mfa'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: session.accessToken,
        },
      }),
    );

    expect(passkeySettingsContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        availableMethods: ['passkey', 'totp', 'sms', 'email'],
        effectiveMethods: ['passkey', 'totp'],
        passkeyCount: 1,
        twoStepCanDisable: false,
        twoStepCanEnable: true,
        twoStepEnabled: true,
      },
    });

    routes = createAuthModule(
      createAuthService({
        emailVerification: new EmailVerificationService({
          sender: {
            send: async () => undefined,
          },
        }),
        smsVerification: new SmsVerificationService({
          phoneCountryCodes: ['+86'],
          sender: {
            send: async () => undefined,
          },
        }),
      }),
      {
        cookies: defaultAuthCookieConfig,
        ssoService: services.sso,
      },
    ).routes;

    const passkeyChallengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/login'),
      createTestContext({
        identifier: 'strong-mfa@example.com',
        password: 'password123',
      }),
    );
    const passkeyChallengeBody = passkeyChallengeContext.body as VerificationRequiredBody;

    expect(passkeyChallengeBody.data.defaultMethod).toBe('passkey');
    expect(passkeyChallengeBody.data.methods.map((method) => method.method)).toEqual(['passkey', 'totp']);

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'patch', '/password'),
        createTestContext(
          {
            currentPassword: 'password123',
            password: 'newpassword123',
            confirmPassword: 'newpassword123',
          },
          {},
          undefined,
          {
            cookies: {
              tilty_scaffold_access_token: unverifiedSession.accessToken,
            },
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_VERIFICATION_REQUIRED',
      status: 403,
    });

    const changePasswordChallengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/challenges'),
      createTestContext(
        {
          purpose: AuthVerificationPurpose.ChangePassword,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: unverifiedSession.accessToken,
          },
        },
      ),
    );
    const changePasswordChallengeBody = changePasswordChallengeContext.body as VerificationRequiredBody;

    expect(changePasswordChallengeBody.data.defaultMethod).toBe('passkey');
    expect(changePasswordChallengeBody.data.methods.map((method) => method.method)).toEqual(['passkey', 'totp']);

    await expect(
      runMiddleware(
        getTestRouteHandler(mfaRoutes, 'patch', '/mfa'),
        createTestContext(
          {
            enabled: false,
          },
          {},
          undefined,
          {
            cookies: {
              tilty_scaffold_access_token: session.accessToken,
            },
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: 'MFA_REQUIRED_FOR_STRONG_VERIFIER',
      status: 409,
    });
  });

  it('counts invalid passkey verification responses against challenge attempts', async () => {
    await services.auth.register(
      {
        username: 'passkey_attempt_user',
        displayName: 'Passkey Attempt User',
        email: 'passkey-attempt@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      },
      {
        deviceId: 'passkey-attempt-device',
        ipAddress: '203.0.113.50',
        userAgent: 'Mozilla/5.0 Passkey Attempt Browser',
      },
    );
    const user = await models.user.findOne({ where: { email: 'passkey-attempt@example.com' } });

    await models.authPasskey.create({
      userId: user!.id,
      name: 'Registered passkey',
      credentialId: 'registered-passkey-credential',
      publicKey: Buffer.from('public-key'),
      webauthnUserId: 'registered-webauthn-user',
      deviceType: 'singleDevice',
      backedUp: false,
      transports: '[]',
    });

    const context = {
      deviceId: 'passkey-attempt-device',
      ipAddress: '203.0.113.50',
      userAgent: 'Mozilla/5.0 Passkey Attempt Browser',
    };
    const loginResult = await services.auth.login(
      {
        identifier: 'passkey-attempt@example.com',
        password: 'password123',
      },
      context,
    );

    if (!('requiresVerification' in loginResult)) {
      throw new Error('Passkey challenge was expected for this account.');
    }

    await services.auth.createPasskeyVerificationOptions(loginResult.verificationToken, context);
    const invalidPasskeyResponse = {
      id: 'missing-passkey-credential',
      rawId: 'missing-passkey-credential',
      response: {},
      type: 'public-key',
    } as NonNullable<Parameters<typeof services.auth.verifyAuthenticationChallenge>[0]['passkeyResponse']>;

    await expect(
      services.auth.verifyAuthenticationChallenge(
        {
          method: 'passkey',
          passkeyResponse: invalidPasskeyResponse,
          verificationToken: loginResult.verificationToken,
        },
        context,
      ),
    ).rejects.toMatchObject({
      code: 'AUTH_VERIFICATION_INVALID',
      details: {
        remainingAttempts: 4,
      },
      status: 401,
    });
  });

  it('uses password verification for first-time sensitive security setup when no verification method exists', async () => {
    const session = await services.auth.register({
      username: 'first_mfa_user',
      displayName: 'First MFA User',
      email: 'first-mfa@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    const challengeContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/challenges'),
      createTestContext(
        {
          purpose: AuthVerificationPurpose.ManageTotp,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: session.accessToken,
          },
        },
      ),
    );
    const challengeBody = challengeContext.body as VerificationRequiredBody;

    expect(challengeBody.data).toMatchObject({
      requiresVerification: true,
      defaultMethod: 'password',
      purpose: AuthVerificationPurpose.ManageTotp,
    });
    expect(challengeBody.data.methods.map((method) => method.method)).toEqual(['password']);

    await runMiddleware(
      getTestRouteHandler(routes, 'post', '/verification/confirm'),
      createTestContext({
        method: 'password',
        password: 'password123',
        verificationToken: challengeBody.data.verificationToken,
      }),
    );

    const setupContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/totp/setup'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: session.accessToken,
        },
      }),
    );

    expect(setupContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        setupToken: expect.any(String),
        secret: expect.any(String),
      },
    });
  });

  it('lists active login devices and revokes other sessions server-side', async () => {
    const primarySession = await services.auth.register(
      {
        username: 'device_user',
        displayName: 'Device User',
        email: 'devices@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      },
      {
        deviceId: 'primary-device',
        ipAddress: '203.0.113.10',
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      },
    );
    const secondaryResult = await services.auth.login(
      {
        identifier: 'devices@example.com',
        password: 'password123',
      },
      {
        deviceId: 'secondary-device',
        ipAddress: '203.0.113.20',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
      },
    );

    if ('requiresVerification' in secondaryResult) {
      throw new Error('Verification challenge was not expected for this account.');
    }

    const listContext = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/devices'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: primarySession.accessToken,
        },
      }),
    );
    const listBody = listContext.body as AuthDeviceSessionsBody;

    expect(listBody.data.sessions).toHaveLength(2);
    expect(listBody.data.sessions.filter((device) => device.isCurrent)).toHaveLength(1);
    expect(listBody.data.sessions.map((device) => device.deviceType).sort()).toEqual(['desktop', 'desktop']);
    expect(listBody.data.sessions.map((device) => device.ipAddress).sort()).toEqual(['203.0.113.10', '203.0.113.20']);

    const revokeContext = await runMiddleware(
      getTestRouteHandler(routes, 'delete', '/devices/others'),
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: primarySession.accessToken,
        },
      }),
    );

    expect(revokeContext.body).toMatchObject({
      code: 200,
      error: null,
      data: {
        revoked: true,
      },
    });
    await expect(services.auth.getCurrentUser(secondaryResult.accessToken)).rejects.toMatchObject({
      code: 'AUTH_SESSION_INVALID',
      status: 401,
    });
    await expect(services.auth.getCurrentUser(primarySession.accessToken)).resolves.toMatchObject({
      email: 'devices@example.com',
    });
  });

  it('rejects unsafe SSO redirect paths at the request boundary', async () => {
    for (const redirect of ['//evil.example.com', '/\\evil', '/dashboard\nx']) {
      const context = await runMiddlewares(
        [errorMiddleware(), getTestRouteHandler(routes, 'get', '/sso/start')],
        createTestContext(undefined, {}, undefined, {
          query: { redirect },
        }),
      );

      expect(context.status).toBe(400);
      expect(context.body).toMatchObject({
        code: 400,
        error: 'FIELD_VALIDATE_ERROR',
        message: 'Request fields are invalid.',
      });
    }
  });
});

class CapturingFileStorage implements FileStorage {
  deletedKeys: string[] = [];
  saved?: SaveFileInput;

  async delete(key: string) {
    this.deletedKeys.push(key);
  }

  async save(input: SaveFileInput) {
    this.saved = input;

    return {
      key: input.key,
      url: `/uploads/${input.key}`,
    };
  }
}

class RejectingCompareAndSetCacheStore extends MemoryCacheStore {
  compareAndSetCalls = 0;

  override async compareAndSet<T>(_key: string, _expected: T, _value: T, _ttlMs: number) {
    this.compareAndSetCalls += 1;

    return false;
  }
}

function getAuthCookie(context: Awaited<ReturnType<typeof runMiddleware>>, name: string) {
  const rawCookie = context.responseHeaders[`set-cookie:${name}`];
  const parsed = rawCookie ? (JSON.parse(rawCookie) as { value?: unknown }) : undefined;

  return typeof parsed?.value === 'string' ? parsed.value : '';
}
