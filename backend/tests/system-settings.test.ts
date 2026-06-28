import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initModels } from '../src/composition/models';
import { createServices } from '../src/composition/services';
import { getSetupEnvironmentDefaults } from '../src/config/setup-environment';
import { type RouteDefinition } from '../src/core/module';
import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { errorMiddleware } from '../src/middleware/error';
import { defaultAuthCookieConfig } from '../src/modules/auth/auth.http';
import { defaultAuthSessionRequestContext } from '../src/modules/auth/auth.service';
import { createSystemSettingsModule } from '../src/modules/system-settings';
import { registerTestUser } from './support/auth';
import { createTestContext, getTestRoute, runMiddlewares } from './support/http';
import { createTotpCode } from './support/totp';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';

describe('system settings API', () => {
  let originalCwd: string;
  let models: ReturnType<typeof initModels>;
  let routes: RouteDefinition[];
  let sequelize: ReturnType<typeof createSequelize>;
  let services: ReturnType<typeof createServices>;
  let temporaryRoot: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-system-settings-'));
    process.chdir(temporaryRoot);

    sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    models = initModels(sequelize);

    services = createServices(models, { authTokenSecret });

    await createMigrator(sequelize).up();
    await services.accessControl.syncSystemAccessControl();

    routes = createSystemSettingsModule(services.auth, {
      cookies: defaultAuthCookieConfig,
    }).routes;
  });

  afterEach(async () => {
    await sequelize.close();
    process.chdir(originalCwd);
    await rm(temporaryRoot, { force: true, recursive: true });
  });

  it('loads current configuration for verified root users when setup is locked', async () => {
    const rootSession = await registerRootWithSystemSettingsAccess('Root User', 'root-settings-read@example.com');

    await writeFile(
      'config.toml',
      [
        'SETUP_LOCKED = true',
        'NODE_ENV = "production"',
        'AUTH_TOKEN_SECRET = "existing-auth-token-secret-minimum-32-characters"',
        'AUTH_COOKIE_SECURE = "true"',
        'DATABASE_STORAGE = "./data/system-settings.sqlite"',
        '',
      ].join('\n'),
      'utf8',
    );
    const readRoute = getTestRoute(routes, 'get', '/');
    const context = await runMiddlewares(
      [errorMiddleware(), ...readRoute.handlers],
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: rootSession.accessToken,
        },
      }),
    );
    const body = context.body as SystemSettingsBody;

    expect(body.data.environmentFileLoaded).toBe(true);
    expect(body.data.environment.NODE_ENV).toBe('production');
    expect(body.data.environment.AUTH_COOKIE_SECURE).toBe('true');
    expect(body.data.environment.DATABASE_STORAGE).toBe('./data/system-settings.sqlite');
    expect('SETUP_LOCKED' in body.data.environment).toBe(false);
  });

  it('rejects root users without a passkey or authenticator app', async () => {
    const rootSession = await registerTestUser(
      services.auth,
      'Root User',
      'root-settings-no-strong-verifier@example.com',
    );
    const readRoute = getTestRoute(routes, 'get', '/');
    const context = await runMiddlewares(
      [errorMiddleware(), ...readRoute.handlers],
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: rootSession.accessToken,
        },
      }),
    );

    expect(context.status).toBe(403);
    expect(context.body).toMatchObject({
      error: 'SYSTEM_SETTINGS_STRONG_VERIFICATION_REQUIRED',
    });
  });

  it('requires authenticator verification after password-based security setup', async () => {
    const rootSession = await registerTestUser(services.auth, 'Root User', 'root-settings-password-sudo@example.com');
    const setupChallenge = await services.auth.createVerificationChallenge(
      rootSession.accessToken,
      'manage_totp',
      defaultAuthSessionRequestContext,
    );

    if (!('verificationToken' in setupChallenge)) {
      throw new Error('Authenticator setup should require password verification.');
    }

    await services.auth.verifyAuthenticationChallenge(
      {
        method: 'password',
        password: 'password123',
        verificationToken: setupChallenge.verificationToken,
      },
      defaultAuthSessionRequestContext,
    );

    const setup = await services.auth.createTotpSetup(rootSession.accessToken);

    await services.auth.enableTotp(rootSession.accessToken, {
      code: createTotpCode(setup.secret),
      setupToken: setup.setupToken,
    });

    const systemSettingsChallenge = await services.auth.createVerificationChallenge(
      rootSession.accessToken,
      'system_settings',
      defaultAuthSessionRequestContext,
    );

    if (!('verificationToken' in systemSettingsChallenge)) {
      throw new Error('System settings should require authenticator verification.');
    }

    expect(systemSettingsChallenge.defaultMethod).toBe('totp');
    expect(systemSettingsChallenge.methods.map((method) => method.method)).toEqual(['totp']);
  });

  it('writes configuration updates and reports that a restart is required', async () => {
    const rootSession = await registerRootWithSystemSettingsAccess('Root User', 'root-settings-write@example.com');
    const updateRoute = getTestRoute(routes, 'put', '/');
    const environment = {
      ...getSetupEnvironmentDefaults().environment,
      DATABASE_STORAGE: './data/updated-system-settings.sqlite',
      SCHEDULER_ENABLED: 'false',
    };
    const context = await runMiddlewares(
      [errorMiddleware(), ...updateRoute.handlers],
      createTestContext(
        {
          environment,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );
    const configFile = await readFile('config.toml', 'utf8');

    expect(context.body).toMatchObject({
      data: {
        restartRequired: true,
        updated: true,
      },
    });
    expect(configFile).toContain('# Generated by the system settings page.');
    expect(configFile).toContain('SETUP_LOCKED = true');
    expect(configFile).toContain('DATABASE_STORAGE = "./data/updated-system-settings.sqlite"');
    expect(configFile).toContain('SCHEDULER_ENABLED = "false"');
  });

  it('rejects non-root users', async () => {
    await registerTestUser(services.auth, 'Root User', 'root-settings-forbidden@example.com');
    const regularSession = await registerTestUser(services.auth, 'Regular User', 'regular-settings@example.com');
    const readRoute = getTestRoute(routes, 'get', '/');
    const context = await runMiddlewares(
      [errorMiddleware(), ...readRoute.handlers],
      createTestContext(undefined, {}, undefined, {
        cookies: {
          tilty_scaffold_access_token: regularSession.accessToken,
        },
      }),
    );

    expect(context.status).toBe(403);
    expect(context.body).toMatchObject({
      error: 'AUTH_FORBIDDEN',
    });
  });

  it('rejects invalid updates without writing configuration', async () => {
    const rootSession = await registerRootWithSystemSettingsAccess('Root User', 'root-settings-invalid@example.com');
    const updateRoute = getTestRoute(routes, 'put', '/');
    const environment = {
      ...getSetupEnvironmentDefaults().environment,
      APP_CORS_ORIGINS: '',
    };
    const context = await runMiddlewares(
      [errorMiddleware(), ...updateRoute.handlers],
      createTestContext(
        {
          environment,
        },
        {},
        undefined,
        {
          cookies: {
            tilty_scaffold_access_token: rootSession.accessToken,
          },
        },
      ),
    );

    expect(context.status).toBe(400);
    expect(context.body).toMatchObject({
      error: 'SETUP_ENV_REQUIRED',
    });
    await expect(readFile('config.toml', 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  async function registerRootWithSystemSettingsAccess(displayName: string, email: string) {
    const session = await registerTestUser(services.auth, displayName, email);
    const user = await models.user.findOne({ where: { email } });

    if (!user) {
      throw new Error('Root user was not created.');
    }

    const setup = await services.totp.createSetup(user);

    await services.totp.enable(user, setup.setupToken, createTotpCode(setup.secret));

    const challenge = await services.auth.createVerificationChallenge(
      session.accessToken,
      'system_settings',
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

    return session;
  }
});

interface SystemSettingsBody {
  data: {
    environment: Record<string, string>;
    environmentFileLoaded: boolean;
  };
}
