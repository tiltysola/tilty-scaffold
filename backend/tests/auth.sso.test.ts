import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { createServices, initModels } from '../src/modules';
import { verifySsoBindToken, verifySsoStateToken } from '../src/modules/auth/auth.crypto';
import { type SsoConfig } from '../src/modules/auth/auth.sso';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';
const issuerUrl = 'https://identity.example.com';
const ssoConfig: SsoConfig = {
  clientId: 'test-client',
  clientSecret: 'test-secret',
  frontendCallbackUrl: 'http://localhost:8011/login',
  issuerUrl,
  redirectUri: 'http://localhost:3000/api/auth/sso/callback',
  requestTimeoutMs: 10_000,
  scopes: ['openid', 'profile', 'email'],
};

describe('OIDC SSO service', () => {
  let models: ReturnType<typeof initModels>;
  let sequelize: ReturnType<typeof createSequelize>;

  beforeEach(async () => {
    sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    models = initModels(sequelize);
    await createMigrator(sequelize).up();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await sequelize.close();
  });

  it('reports disabled public config and rejects login start when unconfigured', async () => {
    const services = createServices(models, { authTokenSecret });

    expect(services.sso.getPublicConfig()).toEqual({ enabled: false });
    await expect(services.sso.createLoginUrl()).rejects.toMatchObject({
      code: 'SSO_DISABLED',
      status: 404,
    });
  });

  it('reports enabled public config without exposing a client login URL', () => {
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });

    expect(services.sso.getPublicConfig()).toEqual({ enabled: true });
  });

  it('creates an SSO account on first login and uses the stable SSO subject afterwards', async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import('jose');
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = {
      ...(await exportJWK(publicKey)),
      alg: 'RS256',
      kid: 'test-key',
      use: 'sig',
    };
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });
    let idToken = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === `${issuerUrl}/.well-known/openid-configuration`) {
          return jsonResponse({
            authorization_endpoint: `${issuerUrl}/oauth2/authorize`,
            issuer: issuerUrl,
            jwks_uri: `${issuerUrl}/oauth2/jwks`,
            token_endpoint: `${issuerUrl}/oauth2/token`,
          });
        }

        if (url === `${issuerUrl}/oauth2/token`) {
          expect(init?.method).toBe('POST');
          expect(String(init?.body)).toContain('grant_type=authorization_code');
          return jsonResponse({ id_token: idToken });
        }

        if (url === `${issuerUrl}/oauth2/jwks`) {
          return jsonResponse({ keys: [jwk] });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    const loginUrl = new URL(await services.sso.createLoginUrl('/reports'));
    const stateToken = loginUrl.searchParams.get('state');

    expect(loginUrl.origin + loginUrl.pathname).toBe(`${issuerUrl}/oauth2/authorize`);
    expect(loginUrl.searchParams.get('client_id')).toBe(ssoConfig.clientId);
    expect(loginUrl.searchParams.get('redirect_uri')).toBe(ssoConfig.redirectUri);
    expect(loginUrl.searchParams.get('scope')).toBe('openid profile email');
    expect(loginUrl.searchParams.get('response_type')).toBe('code');
    expect(stateToken).toEqual(expect.any(String));

    const state = await verifySsoStateToken(stateToken!, authTokenSecret);

    idToken = await new SignJWT({
      email: 'sso@example.com',
      name: 'SSO User',
      nonce: state.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    const callbackUrl = new URL(await services.sso.handleCallback({
      code: 'authorization-code',
      state: stateToken!,
    }));
    const bindToken = callbackUrl.searchParams.get('sso_bind_token');

    expect(callbackUrl.origin + callbackUrl.pathname).toBe(ssoConfig.frontendCallbackUrl);
    expect(callbackUrl.searchParams.get('redirect')).toBe('/reports');
    expect(callbackUrl.searchParams.get('sso_email')).toBe('sso@example.com');
    expect(callbackUrl.searchParams.get('sso_username')).toBe('SSO User');
    expect(callbackUrl.searchParams.get('sso_token')).toBeNull();
    expect(bindToken).toEqual(expect.any(String));

    const bind = await verifySsoBindToken(bindToken!, authTokenSecret);

    expect(bind).toMatchObject({
      email: 'sso@example.com',
      redirectPath: '/reports',
      ssoSubject: 'provider-user@identity.example.com',
      username: 'SSO User',
    });

    await expect(services.sso.createSsoAccount({
      password: 'password123',
      confirmPassword: 'different123',
      token: bindToken!,
      username: 'Chosen Name',
    })).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_CONFIRMATION_MISMATCH',
      status: 400,
    });

    const session = await services.sso.createSsoAccount({
      password: 'password123',
      confirmPassword: 'password123',
      token: bindToken!,
      username: 'Chosen Name',
    });

    expect(session.user).toMatchObject({
      email: 'sso@example.com',
      username: 'Chosen Name',
    });
    expect(session.accessToken).toEqual(expect.any(String));

    await expect(services.auth.login({
      email: 'sso@example.com',
      password: 'password123',
    })).resolves.toMatchObject({
      user: {
        email: 'sso@example.com',
        username: 'Chosen Name',
      },
    });

    const user = await models.user.findOne({
      where: { ssoSubject: 'provider-user@identity.example.com' },
    });

    expect(user).toBeTruthy();
    await user!.update({
      email: 'changed@example.com',
      username: 'Changed User',
    });

    const nextLoginUrl = new URL(await services.sso.createLoginUrl('/settings'));
    const nextStateToken = nextLoginUrl.searchParams.get('state');
    const nextState = await verifySsoStateToken(nextStateToken!, authTokenSecret);

    idToken = await new SignJWT({
      email: 'provider-change@example.com',
      name: 'Provider Changed User',
      nonce: nextState.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    const nextCallbackUrl = new URL(await services.sso.handleCallback({
      code: 'authorization-code',
      state: nextStateToken!,
    }));
    const handoffToken = nextCallbackUrl.searchParams.get('sso_token');

    expect(nextCallbackUrl.searchParams.get('sso_bind_token')).toBeNull();
    expect(nextCallbackUrl.searchParams.get('redirect')).toBe('/settings');
    expect(handoffToken).toEqual(expect.any(String));

    const nextSession = await services.sso.exchangeHandoffToken(handoffToken!);

    expect(nextSession.user).toMatchObject({
      email: 'changed@example.com',
      username: 'Changed User',
    });
  });

  it('accepts HS256 identity tokens signed with the SSO client secret without nonce claims', async () => {
    const { SignJWT } = await import('jose');
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });
    let idToken = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === `${issuerUrl}/.well-known/openid-configuration`) {
          return jsonResponse({
            authorization_endpoint: `${issuerUrl}/oauth2/authorize`,
            id_token_signing_alg_values_supported: ['HS256'],
            issuer: issuerUrl,
            token_endpoint: `${issuerUrl}/oauth2/token`,
          });
        }

        if (url === `${issuerUrl}/oauth2/token`) {
          expect(init?.method).toBe('POST');
          return jsonResponse({ id_token: idToken });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    const loginUrl = new URL(await services.sso.createLoginUrl('/dashboard'));
    const stateToken = loginUrl.searchParams.get('state');

    idToken = await new SignJWT({
      email: 'hs256@example.com',
      name: 'HS User',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    const callbackUrl = new URL(await services.sso.handleCallback({
      code: 'authorization-code',
      state: stateToken!,
    }));
    const session = await services.sso.createSsoAccount({
      password: 'password123',
      confirmPassword: 'password123',
      token: callbackUrl.searchParams.get('sso_bind_token')!,
      username: 'Chosen HS User',
    });

    expect(session.user).toMatchObject({
      email: 'hs256@example.com',
      username: 'Chosen HS User',
    });
  });

  it('binds first-time SSO login to an existing account after password verification', async () => {
    const { SignJWT } = await import('jose');
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });
    let idToken = '';

    await services.auth.register({
      confirmPassword: 'password123',
      email: 'existing@example.com',
      password: 'password123',
      username: 'Existing User',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === `${issuerUrl}/.well-known/openid-configuration`) {
          return jsonResponse({
            authorization_endpoint: `${issuerUrl}/oauth2/authorize`,
            id_token_signing_alg_values_supported: ['HS256'],
            issuer: issuerUrl,
            token_endpoint: `${issuerUrl}/oauth2/token`,
          });
        }

        if (url === `${issuerUrl}/oauth2/token`) {
          expect(init?.method).toBe('POST');
          return jsonResponse({ id_token: idToken });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    const loginUrl = new URL(await services.sso.createLoginUrl('/dashboard'));
    const stateToken = loginUrl.searchParams.get('state');

    idToken = await new SignJWT({
      email: 'provider-existing@example.com',
      name: 'Provider User',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('existing-provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    const callbackUrl = new URL(await services.sso.handleCallback({
      code: 'authorization-code',
      state: stateToken!,
    }));
    const bindToken = callbackUrl.searchParams.get('sso_bind_token');

    expect(bindToken).toEqual(expect.any(String));

    await expect(
      services.sso.bindSsoAccount({
        email: 'existing@example.com',
        password: 'wrong-password',
        token: bindToken!,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
    });

    const session = await services.sso.bindSsoAccount({
      email: 'existing@example.com',
      password: 'password123',
      token: bindToken!,
    });

    expect(session.user).toMatchObject({
      email: 'existing@example.com',
      username: 'Existing User',
    });

    const user = await models.user.findOne({
      where: { email: 'existing@example.com' },
    });

    expect(user?.ssoSubject).toBe('existing-provider-user@identity.example.com');
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
  });
}
