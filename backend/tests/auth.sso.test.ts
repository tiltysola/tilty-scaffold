import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { createServices, initModels } from '../src/modules';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
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
    await new AccessControlService(models).syncSystemAccessControl();
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

  it('rejects discovery documents with non-http endpoint URLs', async () => {
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url === `${issuerUrl}/.well-known/openid-configuration`) {
          return jsonResponse({
            authorization_endpoint: 'ftp://identity.example.com/oauth2/authorize',
            issuer: issuerUrl,
            token_endpoint: `${issuerUrl}/oauth2/token`,
          });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    await expect(services.sso.createLoginUrl()).rejects.toMatchObject({
      code: 'SSO_DISCOVERY_INVALID',
      status: 502,
    });
  });

  it('rejects insecure discovery endpoints when the issuer uses HTTPS', async () => {
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url === `${issuerUrl}/.well-known/openid-configuration`) {
          return jsonResponse({
            authorization_endpoint: `${issuerUrl}/oauth2/authorize`,
            issuer: issuerUrl,
            jwks_uri: 'http://identity.example.com/oauth2/jwks',
            token_endpoint: `${issuerUrl}/oauth2/token`,
          });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    await expect(services.sso.createLoginUrl()).rejects.toMatchObject({
      code: 'SSO_DISCOVERY_INVALID',
      status: 502,
    });
  });

  it('rejects discovery endpoints outside the issuer origin', async () => {
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url === `${issuerUrl}/.well-known/openid-configuration`) {
          return jsonResponse({
            authorization_endpoint: `${issuerUrl}/oauth2/authorize`,
            issuer: issuerUrl,
            jwks_uri: 'https://keys.example.net/oauth2/jwks',
            token_endpoint: 'https://tokens.example.net/oauth2/token',
          });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    await expect(services.sso.createLoginUrl()).rejects.toMatchObject({
      code: 'SSO_DISCOVERY_INVALID',
      status: 502,
    });
  });

  it('uses official SSO provider error copy without reflecting provider descriptions', async () => {
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });

    await expect(
      services.sso.handleCallback({
        error: 'access_denied',
        errorDescription: 'Provider-specific user-facing copy.',
        state: 'unused-state',
      }),
    ).rejects.toMatchObject({
      code: 'SSO_PROVIDER_ERROR',
      details: {
        providerError: 'access_denied',
        providerErrorDescription: 'Provider-specific user-facing copy.',
      },
      message: 'SSO authentication could not be completed.',
      status: 401,
    });
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
      email_verified: true,
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

    const callbackUrl = new URL(
      await services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    );
    const callbackParams = getCallbackParams(callbackUrl);
    const bindToken = callbackParams.get('sso_bind_token');

    expect(callbackUrl.origin + callbackUrl.pathname).toBe(ssoConfig.frontendCallbackUrl);
    expect(callbackUrl.searchParams.get('sso_bind_token')).toBeNull();
    expect(callbackParams.get('redirect')).toBe('/reports');
    expect(callbackParams.get('sso_email')).toBe('sso@example.com');
    expect(callbackParams.get('sso_username')).toBe('SSO User');
    expect(callbackParams.get('sso_token')).toBeNull();
    expect(bindToken).toEqual(expect.any(String));

    const bind = await verifySsoBindToken(bindToken!, authTokenSecret);

    expect(bind).toMatchObject({
      email: 'sso@example.com',
      redirectPath: '/reports',
      ssoSubject: 'provider-user@identity.example.com',
      username: 'SSO User',
    });

    await expect(
      services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });

    await expect(
      services.sso.createSsoAccount({
        password: 'password123',
        confirmPassword: 'different123',
        token: bindToken!,
        username: 'Chosen Name',
      }),
    ).rejects.toMatchObject({
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

    await expect(
      services.sso.createSsoAccount({
        password: 'password123',
        confirmPassword: 'password123',
        token: bindToken!,
        username: 'Replay User',
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });

    await expect(
      services.auth.login({
        email: 'sso@example.com',
        password: 'password123',
      }),
    ).resolves.toMatchObject({
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
      email_verified: true,
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

    const nextCallbackUrl = new URL(
      await services.sso.handleCallback({
        code: 'authorization-code',
        state: nextStateToken!,
      }),
    );
    const nextCallbackParams = getCallbackParams(nextCallbackUrl);
    const handoffToken = nextCallbackParams.get('sso_token');

    expect(nextCallbackUrl.searchParams.get('sso_token')).toBeNull();
    expect(nextCallbackParams.get('sso_bind_token')).toBeNull();
    expect(nextCallbackParams.get('redirect')).toBe('/settings');
    expect(handoffToken).toEqual(expect.any(String));

    const nextSession = await services.sso.exchangeHandoffToken(handoffToken!);

    expect(nextSession.user).toMatchObject({
      email: 'changed@example.com',
      username: 'Changed User',
    });

    await expect(services.sso.exchangeHandoffToken(handoffToken!)).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });
  });

  it('accepts HS256 identity tokens signed with the SSO client secret when nonce matches', async () => {
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
    const state = await verifySsoStateToken(stateToken!, authTokenSecret);

    idToken = await new SignJWT({
      email: 'hs256@example.com',
      email_verified: true,
      name: 'HS User',
      nonce: state.nonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    const callbackUrl = new URL(
      await services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    );
    const session = await services.sso.createSsoAccount({
      password: 'password123',
      confirmPassword: 'password123',
      token: getCallbackParams(callbackUrl).get('sso_bind_token')!,
      username: 'Chosen HS User',
    });

    expect(session.user).toMatchObject({
      email: 'hs256@example.com',
      username: 'Chosen HS User',
    });
  });

  it('rejects HS identity tokens when discovery does not advertise the algorithm', async () => {
    const { SignJWT } = await import('jose');
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });
    let idToken = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);

        if (url === `${issuerUrl}/.well-known/openid-configuration`) {
          return jsonResponse({
            authorization_endpoint: `${issuerUrl}/oauth2/authorize`,
            issuer: issuerUrl,
            token_endpoint: `${issuerUrl}/oauth2/token`,
          });
        }

        if (url === `${issuerUrl}/oauth2/token`) {
          return jsonResponse({ id_token: idToken });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    const loginUrl = new URL(await services.sso.createLoginUrl('/dashboard'));
    const stateToken = loginUrl.searchParams.get('state');
    const state = await verifySsoStateToken(stateToken!, authTokenSecret);

    idToken = await new SignJWT({
      email: 'hs256@example.com',
      email_verified: true,
      name: 'HS User',
      nonce: state.nonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    await expect(
      services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    ).rejects.toMatchObject({
      code: 'SSO_ID_TOKEN_INVALID',
      status: 401,
    });
  });

  it('rejects identity tokens with unverified email addresses', async () => {
    const { SignJWT } = await import('jose');
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });
    let idToken = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
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
          return jsonResponse({ id_token: idToken });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    const loginUrl = new URL(await services.sso.createLoginUrl('/dashboard'));
    const stateToken = loginUrl.searchParams.get('state');
    const state = await verifySsoStateToken(stateToken!, authTokenSecret);

    idToken = await new SignJWT({
      email: 'unverified@example.com',
      email_verified: false,
      name: 'Unverified Email User',
      nonce: state.nonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('unverified-provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    await expect(
      services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    ).rejects.toMatchObject({
      code: 'SSO_EMAIL_UNVERIFIED',
      status: 401,
    });
  });

  it('rejects identity tokens that do not include the expected nonce', async () => {
    const { SignJWT } = await import('jose');
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });
    let idToken = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
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
          return jsonResponse({ id_token: idToken });
        }

        throw new Error(`Unexpected SSO request: ${url}`);
      }),
    );

    const loginUrl = new URL(await services.sso.createLoginUrl('/dashboard'));
    const stateToken = loginUrl.searchParams.get('state');

    idToken = await new SignJWT({
      email: 'missing-nonce@example.com',
      email_verified: true,
      name: 'Missing Nonce User',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('missing-nonce-provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    await expect(
      services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    ).rejects.toMatchObject({
      code: 'SSO_NONCE_INVALID',
      status: 401,
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
    const state = await verifySsoStateToken(stateToken!, authTokenSecret);

    idToken = await new SignJWT({
      email: 'provider-existing@example.com',
      email_verified: true,
      name: 'Provider User',
      nonce: state.nonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('existing-provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    const callbackUrl = new URL(
      await services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    );
    const bindToken = getCallbackParams(callbackUrl).get('sso_bind_token');

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

    await expect(
      services.sso.bindSsoAccount({
        email: 'existing@example.com',
        password: 'password123',
        token: bindToken!,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });

    const user = await models.user.findOne({
      where: { email: 'existing@example.com' },
    });

    expect(user?.ssoSubject).toBe('existing-provider-user@identity.example.com');
  });

  it('keeps the SSO bind token usable for binding when account creation hits an existing email', async () => {
    const { SignJWT } = await import('jose');
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });
    let idToken = '';

    await services.auth.register({
      confirmPassword: 'password123',
      email: 'conflict@example.com',
      password: 'password123',
      username: 'Existing Conflict User',
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
    const state = await verifySsoStateToken(stateToken!, authTokenSecret);

    idToken = await new SignJWT({
      email: 'conflict@example.com',
      email_verified: true,
      name: 'Provider Conflict User',
      nonce: state.nonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('conflict-provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    const callbackUrl = new URL(
      await services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    );
    const bindToken = getCallbackParams(callbackUrl).get('sso_bind_token');

    expect(bindToken).toEqual(expect.any(String));

    await expect(
      services.sso.createSsoAccount({
        password: 'password123',
        confirmPassword: 'password123',
        token: bindToken!,
        username: 'New Conflict User',
      }),
    ).rejects.toMatchObject({
      code: 'USER_EMAIL_EXISTS',
      status: 409,
    });

    const session = await services.sso.bindSsoAccount({
      email: 'conflict@example.com',
      password: 'password123',
      token: bindToken!,
    });

    expect(session.user).toMatchObject({
      email: 'conflict@example.com',
      username: 'Existing Conflict User',
    });

    await expect(
      services.sso.bindSsoAccount({
        email: 'conflict@example.com',
        password: 'password123',
        token: bindToken!,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });
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

function getCallbackParams(url: URL) {
  return new URLSearchParams(url.hash.replace(/^#/, ''));
}
