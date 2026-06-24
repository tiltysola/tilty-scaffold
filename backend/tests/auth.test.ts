import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RouteDefinition } from '../src/core/module';
import { MemoryCacheStore } from '../src/infra/cache';
import { createSequelize } from '../src/infra/database';
import { type FileStorage, type SaveFileInput } from '../src/infra/file-storage';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { createServices, initModels } from '../src/modules';
import { createAuthModule } from '../src/modules/auth';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.controller';
import { type EmailSender, EmailVerificationService } from '../src/modules/auth/auth.email';
import { AuthService, defaultAuthTokenConfig } from '../src/modules/auth/auth.service';
import { type SmsSender, SmsVerificationService } from '../src/modules/auth/auth.sms';
import { UserService } from '../src/modules/users/user.service';
import { createTestContext, getTestRouteHandler, runMiddleware, runMiddlewares } from './support/http';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';

describe('auth API', () => {
  let models: ReturnType<typeof initModels>;
  let routes: RouteDefinition[];
  let sequelize: ReturnType<typeof createSequelize>;
  let services: ReturnType<typeof createServices>;
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
  });

  afterEach(async () => {
    await sequelize.close();
  });

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
    expect(authCookie).toEqual(expect.any(String));

    const meContext = await runMiddleware(
      getTestRouteHandler(routes, 'get', '/me'),
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
    const refreshCookie = getAuthCookie(context, 'tilty_scaffold_refresh_token');

    expect(body.data.user.email).toBe('refresh@example.com');
    expect(body.data.user).not.toHaveProperty('id');
    expect(body.data).not.toHaveProperty('accessToken');
    expect(body.data).not.toHaveProperty('refreshToken');
    expect(refreshCookie).toEqual(expect.any(String));
    expect(refreshCookie).not.toBe(session.refreshToken);
    expect(context.responseHeaders['set-cookie:tilty_scaffold_access_token']).toContain('httpOnly');
    expect(context.responseHeaders['set-cookie:tilty_scaffold_refresh_token']).toContain('httpOnly');
    await expect(services.auth.refreshSession(session.refreshToken)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_TOKEN_INVALID',
    });
  });

  it('rejects refresh tokens when cache consumption loses a race', async () => {
    const cacheStore = new RejectingCompareAndSetCacheStore();
    const authService = new AuthService(
      new UserService(models.user, models.ssoIdentity),
      services.accessControl,
      authTokenSecret,
      new EmailVerificationService(),
      fileStorage,
      defaultAuthTokenConfig,
      cacheStore,
    );
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

  it('updates the current user display name', async () => {
    const session = await services.auth.register({
      username: 'profile_user',
      displayName: 'Profile User',
      email: 'profile@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const context = await runMiddleware(
      getTestRouteHandler(routes, 'patch', '/me'),
      createTestContext(
        {
          displayName: 'Updated Profile User',
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
      email: 'profile@example.com',
    });
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.toMatchObject({
      displayName: 'Updated Profile User',
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
      runMiddleware(
        getTestRouteHandler(routes, 'patch', '/me'),
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
    const avatarRoute = createAuthModule(services.auth, {
      cookies: defaultAuthCookieConfig,
      rateLimit,
      ssoService: services.sso,
    }).routes.find((route) => route.method === 'post' && route.path === '/avatar');

    expect(avatarRoute?.handlers[0]).toBe(rateLimit);
  });

  it('applies rate limiting middleware to profile updates', () => {
    const rateLimit = vi.fn(async (_ctx, next) => {
      await next();
    });
    const profileRoute = createAuthModule(services.auth, {
      cookies: defaultAuthCookieConfig,
      rateLimit,
      ssoService: services.sso,
    }).routes.find((route) => route.method === 'patch' && route.path === '/me');

    expect(profileRoute?.handlers[0]).toBe(rateLimit);
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
    const authService = new AuthService(
      new UserService(models.user, models.ssoIdentity),
      services.accessControl,
      authTokenSecret,
      new EmailVerificationService(),
      undefined,
      defaultAuthTokenConfig,
      new MemoryCacheStore(),
      new SmsVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        phoneCountryCodes: ['+86'],
        sender: smsSender,
      }),
    );
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
    const userService = new UserService(models.user, models.ssoIdentity);
    const authService = new AuthService(
      userService,
      services.accessControl,
      authTokenSecret,
      new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender,
      }),
      undefined,
      defaultAuthTokenConfig,
      new MemoryCacheStore(),
    );
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;

    const configContext = await runMiddleware(getTestRouteHandler(routes, 'get', '/config'), createTestContext());

    expect(configContext.body).toEqual({
      code: 200,
      error: null,
      data: {
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
    const authService = new AuthService(
      new UserService(models.user, models.ssoIdentity),
      services.accessControl,
      authTokenSecret,
      new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender,
      }),
      undefined,
      defaultAuthTokenConfig,
      new MemoryCacheStore(),
    );
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;

    const sendContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/me/email-verification'),
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

    const verifyContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/me/email-verification/confirm'),
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
    const authService = new AuthService(
      new UserService(models.user, models.ssoIdentity),
      services.accessControl,
      authTokenSecret,
      new EmailVerificationService(),
      undefined,
      defaultAuthTokenConfig,
      new MemoryCacheStore(),
      new SmsVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        phoneCountryCodes: ['+86'],
        sender,
      }),
    );
    routes = createAuthModule(authService, {
      cookies: defaultAuthCookieConfig,
      ssoService: services.sso,
    }).routes;

    const sendContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/me/phone-verification'),
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

    const verifyContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/me/phone-verification/confirm'),
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
    const user = await models.user.findOne({ where: { email: 'profile-phone@example.com' } });

    expect(verifyBody.data.phoneNumber).toBe('+8613800138000');
    expect(verifyBody.data.phoneVerified).toBe(true);
    expect(user?.phoneNumber).toBe('+8613800138000');
    expect(user?.phoneVerified).toBe(true);
  });

  it('resets passwords with emailed verification codes when email is enabled', async () => {
    let sentCode = '';
    const sender: EmailSender = {
      send: async (input) => {
        sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
      },
    };
    const userService = new UserService(models.user, models.ssoIdentity);
    const authService = new AuthService(
      userService,
      services.accessControl,
      authTokenSecret,
      new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender,
      }),
      undefined,
      defaultAuthTokenConfig,
      new MemoryCacheStore(),
    );
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

interface AuthSessionBody {
  data: {
    accessTokenExpiresAt: string;
    refreshTokenExpiresAt: string;
    user: {
      username: string;
      displayName: string;
      email: string;
      emailVerified: boolean;
      phoneNumber?: string;
      phoneVerified: boolean;
    };
  };
}

function getAuthCookie(context: Awaited<ReturnType<typeof runMiddleware>>, name: string) {
  const rawCookie = context.responseHeaders[`set-cookie:${name}`];
  const parsed = rawCookie ? (JSON.parse(rawCookie) as { value?: unknown }) : undefined;

  return typeof parsed?.value === 'string' ? parsed.value : '';
}

interface AuthUserBody {
  data: {
    username: string;
    displayName: string;
    email: string;
    emailVerified: boolean;
    phoneNumber?: string;
    phoneVerified: boolean;
    avatarUrl?: string;
  };
}

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
