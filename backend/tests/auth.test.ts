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
      username: 'Test User',
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
      email: credentials.email,
    });
    expect(registerBody.data).not.toHaveProperty('accessToken');
    expect(registerBody.data).not.toHaveProperty('refreshToken');
    expect(registerContext.responseHeaders['set-cookie:tilty_scaffold_access_token']).toContain('httpOnly');
    expect(registerContext.responseHeaders['set-cookie:tilty_scaffold_refresh_token']).toContain('httpOnly');

    const loginContext = await runMiddleware(
      getTestRouteHandler(routes, 'post', '/login'),
      createTestContext({
        email: credentials.email,
        password: credentials.password,
      }),
    );
    const loginBody = loginContext.body as AuthSessionBody;
    const authCookie = getAuthCookie(loginContext, 'tilty_scaffold_access_token');

    expect(loginBody.data.user.email).toBe(credentials.email);
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
      email: credentials.email,
    });
  });

  it('clears the authenticated session cookie on logout', async () => {
    const session = await services.auth.register({
      username: 'Logout User',
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
      username: 'Refresh User',
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
      new UserService(models.user),
      services.accessControl,
      authTokenSecret,
      new EmailVerificationService(),
      fileStorage,
      defaultAuthTokenConfig,
      cacheStore,
    );
    const session = await authService.register({
      username: 'Refresh Race User',
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
      username: 'Cookie User',
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
      username: 'Avatar User',
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
    await expect(services.auth.getCurrentUser(session.accessToken)).resolves.toMatchObject({
      avatarUrl: user.avatarUrl,
    });
  });

  it('removes the previous avatar object after replacement', async () => {
    const session = await services.auth.register({
      username: 'Avatar Replace User',
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

  it('rejects duplicate email registration', async () => {
    const credentials = {
      username: 'Test User',
      email: 'duplicate@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    };

    await runMiddleware(getTestRouteHandler(routes, 'post', '/register'), createTestContext(credentials));

    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'post', '/register'),
        createTestContext({ ...credentials, username: 'Other User' }),
      ),
    ).rejects.toMatchObject({
      code: 'USER_EMAIL_EXISTS',
      status: 409,
    });
  });

  it('rejects mismatched registration password confirmation', async () => {
    await expect(
      runMiddleware(
        getTestRouteHandler(routes, 'post', '/register'),
        createTestContext({
          username: 'Test User',
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
        registrationEmailVerificationRequired: false,
      },
    });
  });

  it('requires a registration email verification code when email is enabled', async () => {
    let sentCode = '';
    const sender: EmailSender = {
      send: async (input) => {
        sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
      },
    };
    const userService = new UserService(models.user);
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
          username: 'Verified User',
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
        username: 'Verified User',
        email: 'verified@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        emailVerificationCode: sentCode,
      }),
    );
    const registerBody = registerContext.body as AuthSessionBody;

    expect(registerContext.status).toBe(201);
    expect(registerBody.data.user.email).toBe('verified@example.com');
  });

  it('resets passwords with emailed verification codes when email is enabled', async () => {
    let sentCode = '';
    const sender: EmailSender = {
      send: async (input) => {
        sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
      },
    };
    const userService = new UserService(models.user);
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
      username: 'Reset User',
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
          email: 'reset@example.com',
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
        email: 'reset@example.com',
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
      email: string;
      username: string;
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
    avatarUrl?: string;
    email: string;
    username: string;
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
