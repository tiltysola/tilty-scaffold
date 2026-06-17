import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RouteDefinition } from '../src/core/module';
import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { createServices, initModels } from '../src/modules';
import { createAuthModule } from '../src/modules/auth';
import { AuthService } from '../src/modules/auth/auth.service';
import { EmailSender, EmailVerificationService } from '../src/modules/auth/auth.email';
import { UserService } from '../src/modules/users/user.service';
import { createTestContext, runMiddleware, runMiddlewares } from './support/http';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';

describe('auth API', () => {
  let models: ReturnType<typeof initModels>;
  let routes: RouteDefinition[];
  let sequelize: ReturnType<typeof createSequelize>;
  let services: ReturnType<typeof createServices>;

  beforeEach(async () => {
    sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    models = initModels(sequelize);
    services = createServices(models, { authTokenSecret });

    await createMigrator(sequelize).up();

    routes = createAuthModule(services.auth, { ssoService: services.sso }).routes;
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

    const registerContext = await runMiddleware(getRoute('post', '/register'), createTestContext(credentials));
    const registerBody = registerContext.body as AuthSessionBody;

    expect(registerContext.status).toBe(201);
    expect(registerBody.data.user).toMatchObject({
      username: credentials.username,
      email: credentials.email,
    });
    expect(registerBody.data.accessToken).toEqual(expect.any(String));

    const loginContext = await runMiddleware(
      getRoute('post', '/login'),
      createTestContext({
        email: credentials.email,
        password: credentials.password,
      }),
    );
    const loginBody = loginContext.body as AuthSessionBody;

    expect(loginBody.data.user.email).toBe(credentials.email);

    const meContext = await runMiddleware(
      getRoute('get', '/me'),
      createTestContext(undefined, {
        authorization: `Bearer ${loginBody.data.accessToken}`,
      }),
    );
    const meBody = meContext.body as AuthUserBody;

    expect(meBody.data).toMatchObject({
      username: credentials.username,
      email: credentials.email,
    });
  });

  it('rejects duplicate email registration', async () => {
    const credentials = {
      username: 'Test User',
      email: 'duplicate@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    };

    await runMiddleware(getRoute('post', '/register'), createTestContext(credentials));

    await expect(
      runMiddleware(
        getRoute('post', '/register'),
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
        getRoute('post', '/register'),
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
    const context = await runMiddleware(getRoute('get', '/config'), createTestContext());

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
      authTokenSecret,
      new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender,
      }),
    );
    routes = createAuthModule(authService, { ssoService: services.sso }).routes;

    const configContext = await runMiddleware(getRoute('get', '/config'), createTestContext());

    expect(configContext.body).toEqual({
      code: 200,
      error: null,
      data: {
        passwordRecoveryEnabled: true,
        registrationEmailVerificationRequired: true,
      },
    });

    await runMiddleware(
      getRoute('post', '/register/email-verification'),
      createTestContext({
        email: 'verified@example.com',
      }),
    );

    expect(sentCode).toMatch(/^\d{6}$/);

    await expect(
      runMiddleware(
        getRoute('post', '/register'),
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
      getRoute('post', '/register'),
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
      authTokenSecret,
      new EmailVerificationService({
        codeCooldownMs: 60_000,
        codeExpiresInMs: 10 * 60_000,
        sender,
      }),
    );
    routes = createAuthModule(authService, { ssoService: services.sso }).routes;

    await models.user.create({
      username: 'Reset User',
      email: 'reset@example.com',
      passwordHash: 'old-password-hash',
      passwordSalt: 'old-password-salt',
    });

    await runMiddleware(
      getRoute('post', '/password-reset/email-verification'),
      createTestContext({
        email: 'reset@example.com',
      }),
    );

    expect(sentCode).toMatch(/^\d{6}$/);

    await runMiddleware(
      getRoute('post', '/password-reset'),
      createTestContext({
        email: 'reset@example.com',
        emailVerificationCode: sentCode,
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      }),
    );

    await expect(
      runMiddleware(
        getRoute('post', '/login'),
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
      getRoute('post', '/login'),
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
        getRoute('post', '/password-reset/email-verification'),
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
    const context = await runMiddleware(getRoute('get', '/sso/config'), createTestContext());

    expect(context.body).toEqual({
      code: 200,
      error: null,
      data: {
        enabled: false,
      },
    });
  });

  it('rejects unsafe SSO redirect paths at the request boundary', async () => {
    for (const redirect of ['//evil.example.com', '/\\evil']) {
      const context = await runMiddlewares(
        [errorMiddleware(), getRoute('get', '/sso/start')],
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

  function getRoute(method: RouteDefinition['method'], path: string) {
    const route = routes.find((item) => item.method === method && item.path === path);

    if (!route) {
      throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
    }

    return route.handlers[0]!;
  }
});

interface AuthSessionBody {
  data: {
    accessToken: string;
    user: {
      email: string;
      username: string;
    };
  };
}

interface AuthUserBody {
  data: {
    email: string;
    username: string;
  };
}
