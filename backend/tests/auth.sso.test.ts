import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSequelize } from '../src/infra/database';
import { createMigrator } from '../src/infra/migrator';
import { createServices, initModels } from '../src/modules';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { verifySsoBindToken, verifySsoHandoffToken, verifySsoStateToken } from '../src/modules/auth/auth.crypto';
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

    expect(services.sso.getPublicConfig()).toEqual({ enabled: false, loginEnabled: false, providers: [] });
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

    expect(services.sso.getPublicConfig()).toEqual({
      enabled: true,
      loginEnabled: true,
      providers: [
        {
          id: 'identity.example.com',
          name: 'SSO',
          protocol: 'oidc',
          loginEnabled: true,
          bindingEnabled: true,
        },
      ],
    });
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
      name: 'Provider User',
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
    expect(callbackParams.get('sso_display_name')).toBe('Provider User');
    expect(callbackParams.get('sso_username')).toBe('sso');
    expect(callbackParams.get('sso_token')).toBeNull();
    expect(bindToken).toEqual(expect.any(String));

    const bind = await verifySsoBindToken(bindToken!, authTokenSecret);

    expect(bind).toMatchObject({
      providerId: 'identity.example.com',
      providerSubject: 'provider-user',
      username: 'sso',
      displayName: 'Provider User',
      email: 'sso@example.com',
      redirectPath: '/reports',
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
        username: 'chosen_name',
        displayName: 'Chosen Name',
        password: 'password123',
        confirmPassword: 'different123',
        token: bindToken!,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_PASSWORD_CONFIRMATION_MISMATCH',
      status: 400,
    });

    const session = await services.sso.createSsoAccount({
      username: 'chosen_name',
      displayName: 'Chosen Name',
      password: 'password123',
      confirmPassword: 'password123',
      token: bindToken!,
    });

    expect(session.user).toMatchObject({
      username: 'chosen_name',
      displayName: 'Chosen Name',
      email: 'sso@example.com',
    });
    expect(session.accessToken).toEqual(expect.any(String));

    await expect(
      services.sso.createSsoAccount({
        username: 'replay_user',
        displayName: 'Replay User',
        password: 'password123',
        confirmPassword: 'password123',
        token: bindToken!,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });

    await expect(
      services.auth.login({
        identifier: 'chosen_name',
        password: 'password123',
      }),
    ).resolves.toMatchObject({
      user: {
        username: 'chosen_name',
        displayName: 'Chosen Name',
        email: 'sso@example.com',
      },
    });

    const identity = await models.ssoIdentity.findOne({
      where: {
        providerId: 'identity.example.com',
        providerSubject: 'provider-user',
      },
    });
    const user = identity ? await models.user.findByPk(identity.userId) : null;

    expect(user).toBeTruthy();
    await user!.update({
      username: 'changed_user',
      displayName: 'Changed User',
      email: 'changed@example.com',
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

    const handoff = await verifySsoHandoffToken(handoffToken!, authTokenSecret);

    expect(handoff).toMatchObject({
      type: 'sso_handoff',
    });
    expect(handoff).not.toHaveProperty('username');
    expect(handoff).not.toHaveProperty('displayName');
    expect(handoff).not.toHaveProperty('email');
    expect(handoff).not.toHaveProperty('sub');

    const nextSession = await services.sso.exchangeHandoffToken(handoffToken!);

    expect(nextSession.user).toMatchObject({
      username: 'changed_user',
      displayName: 'Changed User',
      email: 'changed@example.com',
    });

    await expect(services.sso.exchangeHandoffToken(handoffToken!)).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });
  });

  it('rejects disabled users matched through a secondary SSO identity', async () => {
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });
    await services.auth.register({
      username: 'disabled_sso',
      displayName: 'Disabled SSO',
      email: 'disabled-sso@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    const user = await models.user.findOne({
      where: {
        email: 'disabled-sso@example.com',
      },
    });

    expect(user).not.toBeNull();

    if (!user) {
      return;
    }

    await user.update({
      available: false,
    });
    await models.ssoIdentity.create({
      userId: user.id,
      providerId: 'identity.example.com',
      providerSubject: 'secondary-provider-subject',
      email: user.email,
    });

    await expect(
      handleHsSsoCallback(services, {
        email: user.email,
        name: user.displayName,
        subject: 'secondary-provider-subject',
      }),
    ).rejects.toMatchObject({
      code: 'USER_UNAVAILABLE',
      status: 403,
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
      username: 'chosen_hs_user',
      displayName: 'Chosen HS User',
      password: 'password123',
      confirmPassword: 'password123',
      token: getCallbackParams(callbackUrl).get('sso_bind_token')!,
    });

    expect(session.user).toMatchObject({
      username: 'chosen_hs_user',
      displayName: 'Chosen HS User',
      email: 'hs256@example.com',
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

  it('rejects identity tokens with invalid email addresses', async () => {
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
      email: 'not-an-email',
      email_verified: true,
      name: 'Invalid Email User',
      nonce: state.nonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuerUrl)
      .setAudience(ssoConfig.clientId)
      .setSubject('invalid-email-provider-user')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

    await expect(
      services.sso.handleCallback({
        code: 'authorization-code',
        state: stateToken!,
      }),
    ).rejects.toMatchObject({
      code: 'SSO_EMAIL_INVALID',
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
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });

    await services.auth.register({
      username: 'existing_user',
      displayName: 'Existing User',
      email: 'existing@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });
    await services.auth.register({
      username: 'occupied_user',
      displayName: 'Occupied User',
      email: 'occupied@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    const occupiedUser = await models.user.findOne({
      where: { email: 'occupied@example.com' },
    });

    await models.ssoIdentity.create({
      userId: occupiedUser!.id,
      providerId: 'identity.example.com',
      providerSubject: 'other-provider-user',
      email: occupiedUser!.email,
    });

    const bindToken = await createHsSsoBindToken(services, {
      email: 'provider-existing@example.com',
      name: 'Provider User',
      subject: 'existing-provider-user',
    });

    await expect(
      services.sso.bindSsoAccount({
        identifier: 'occupied_user',
        password: 'password123',
        token: bindToken,
      }),
    ).rejects.toMatchObject({
      code: 'USER_SSO_SUBJECT_EXISTS',
      status: 409,
    });

    await expect(
      services.sso.bindSsoAccount({
        identifier: 'existing_user',
        password: 'wrong-password',
        token: bindToken,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
      status: 401,
    });

    const session = await services.sso.bindSsoAccount({
      identifier: 'existing_user',
      password: 'password123',
      token: bindToken,
    });

    expect(session.user).toMatchObject({
      username: 'existing_user',
      displayName: 'Existing User',
      email: 'existing@example.com',
    });

    await expect(
      services.sso.bindSsoAccount({
        identifier: 'existing_user',
        password: 'password123',
        token: bindToken,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });

    const user = await models.user.findOne({
      where: { email: 'existing@example.com' },
    });
    const identity = user
      ? await models.ssoIdentity.findOne({
          where: {
            userId: user.id,
            providerId: 'identity.example.com',
          },
        })
      : null;

    expect(identity?.providerSubject).toBe('existing-provider-user');
  });

  it('keeps the SSO bind token usable when account creation hits an existing username', async () => {
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });

    await services.auth.register({
      username: 'taken_name',
      displayName: 'Taken Name',
      email: 'taken@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    const bindToken = await createHsSsoBindToken(services, {
      email: 'username-conflict@example.com',
      name: 'Provider Username Conflict User',
      subject: 'username-conflict-provider-user',
    });

    await expect(
      services.sso.createSsoAccount({
        username: 'taken_name',
        displayName: 'Taken Name',
        password: 'password123',
        confirmPassword: 'password123',
        token: bindToken,
      }),
    ).rejects.toMatchObject({
      code: 'USER_USERNAME_EXISTS',
      status: 409,
    });

    const session = await services.sso.createSsoAccount({
      username: 'available_name',
      displayName: 'Available Name',
      password: 'password123',
      confirmPassword: 'password123',
      token: bindToken,
    });

    expect(session.user).toMatchObject({
      username: 'available_name',
      displayName: 'Available Name',
      email: 'username-conflict@example.com',
    });
  });

  it('keeps the SSO bind token usable for binding when account creation hits an existing email', async () => {
    const services = createServices(models, {
      authTokenSecret,
      sso: ssoConfig,
    });

    await services.auth.register({
      username: 'existing_conflict_user',
      displayName: 'Existing Conflict User',
      email: 'conflict@example.com',
      password: 'password123',
      confirmPassword: 'password123',
    });

    const bindToken = await createHsSsoBindToken(services, {
      email: 'conflict@example.com',
      name: 'Provider Conflict User',
      subject: 'conflict-provider-user',
    });

    await expect(
      services.sso.createSsoAccount({
        username: 'new_conflict_user',
        displayName: 'New Conflict User',
        password: 'password123',
        confirmPassword: 'password123',
        token: bindToken,
      }),
    ).rejects.toMatchObject({
      code: 'USER_EMAIL_EXISTS',
      status: 409,
    });

    const session = await services.sso.bindSsoAccount({
      identifier: 'existing_conflict_user',
      password: 'password123',
      token: bindToken,
    });

    expect(session.user).toMatchObject({
      username: 'existing_conflict_user',
      displayName: 'Existing Conflict User',
      email: 'conflict@example.com',
    });

    await expect(
      services.sso.bindSsoAccount({
        identifier: 'existing_conflict_user',
        password: 'password123',
        token: bindToken,
      }),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });
  });
});

async function createHsSsoBindToken(
  services: ReturnType<typeof createServices>,
  input: {
    email: string;
    name: string;
    subject: string;
  },
) {
  const callbackUrl = new URL(await handleHsSsoCallback(services, input));
  const bindToken = getCallbackParams(callbackUrl).get('sso_bind_token');

  expect(bindToken).toEqual(expect.any(String));

  return bindToken!;
}

async function handleHsSsoCallback(
  services: ReturnType<typeof createServices>,
  input: {
    email: string;
    name: string;
    subject: string;
  },
) {
  const { SignJWT } = await import('jose');
  let idToken = '';

  vi.stubGlobal(
    'fetch',
    vi.fn(async (request: string | URL, init?: RequestInit) => {
      const url = String(request);

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
    email: input.email,
    email_verified: true,
    name: input.name,
    nonce: state.nonce,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuerUrl)
    .setAudience(ssoConfig.clientId)
    .setSubject(input.subject)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(Buffer.from(ssoConfig.clientSecret, 'utf8'));

  return services.sso.handleCallback({
    code: 'authorization-code',
    state: stateToken!,
  });
}

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
