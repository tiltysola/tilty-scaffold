import { randomBytes } from 'crypto';

import { AppError } from '../../core/errors';
import { type UserModel } from '../users/user.model';
import { UserService } from '../users/user.service';
import {
  createSsoBindToken,
  createSsoHandoffToken,
  createSsoStateToken,
  hashPassword,
  verifyPassword,
  verifySsoBindToken,
  verifySsoHandoffToken,
  verifySsoStateToken,
} from './auth.crypto';
import { createAuthSession } from './auth.service';

type JoseModule = typeof import('jose', { with: { 'resolution-mode': 'import' } });

export interface SsoConfig {
  clientId: string;
  clientSecret: string;
  frontendCallbackUrl: string;
  issuerUrl: string;
  redirectUri: string;
  requestTimeoutMs: number;
  scopes: string[];
}

export interface SsoCallbackInput {
  code?: string | undefined;
  error?: string | undefined;
  errorDescription?: string | undefined;
  state?: string | undefined;
}

export interface BindSsoAccountInput {
  email: string;
  password: string;
  token: string;
}

export interface CreateSsoAccountInput {
  confirmPassword: string;
  password: string;
  token: string;
  username: string;
}

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  id_token_signing_alg_values_supported?: string[];
  issuer: string;
  jwks_uri?: string;
  token_endpoint: string;
}

interface OidcTokenResponse {
  id_token?: string;
}

interface OidcIdTokenPayload {
  email?: unknown;
  name?: unknown;
  nonce?: unknown;
  preferred_username?: unknown;
  sub?: unknown;
}

interface IdTokenVerifier {
  algorithms: string[];
  verify(input: IdTokenVerifierInput): Promise<OidcIdTokenPayload>;
}

interface IdTokenVerifierInput {
  algorithms: string[];
  config: SsoConfig;
  discovery: OidcDiscoveryDocument;
  idToken: string;
  jose: JoseModule;
  verifyOptions: {
    audience: string;
    issuer: string;
    requiredClaims: string[];
  };
}

let joseModule: Promise<JoseModule> | undefined;

const idTokenVerifiers: IdTokenVerifier[] = [
  {
    algorithms: ['HS256', 'HS384', 'HS512'],
    async verify({ algorithms, config, idToken, jose, verifyOptions }) {
      const { payload } = await jose.jwtVerify<OidcIdTokenPayload>(
        idToken,
        Buffer.from(config.clientSecret, 'utf8'),
        {
          ...verifyOptions,
          algorithms,
        },
      );

      return payload;
    },
  },
  {
    algorithms: [
      'RS256',
      'RS384',
      'RS512',
      'PS256',
      'PS384',
      'PS512',
      'ES256',
      'ES384',
      'ES512',
      'EdDSA',
    ],
    async verify({ algorithms, config, discovery, idToken, jose, verifyOptions }) {
      if (!isUrl(discovery.jwks_uri)) {
        throw new AppError('SSO_DISCOVERY_INVALID', 'SSO discovery document is invalid.', 502);
      }

      const { payload } = await jose.jwtVerify<OidcIdTokenPayload>(
        idToken,
        jose.createRemoteJWKSet(new URL(discovery.jwks_uri), {
          timeoutDuration: config.requestTimeoutMs,
        }),
        {
          ...verifyOptions,
          algorithms,
        },
      );

      return payload;
    },
  },
];

export class SsoService {
  private discovery?: Promise<OidcDiscoveryDocument>;

  constructor(
    private readonly userService: UserService,
    private readonly tokenSecret: string,
    private readonly config?: SsoConfig,
  ) {}

  getPublicConfig() {
    return this.config
      ? {
          enabled: true,
        }
      : {
          enabled: false,
        };
  }

  async createLoginUrl(redirectPath = '/dashboard') {
    const config = this.requireConfig();
    const discovery = await this.getDiscovery();
    const nonce = randomBytes(16).toString('base64url');
    const state = await createSsoStateToken(
      {
        nonce,
        redirectPath,
      },
      this.tokenSecret,
    );
    const url = new URL(discovery.authorization_endpoint);

    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);

    return url.toString();
  }

  async handleCallback(input: SsoCallbackInput) {
    this.requireConfig();

    if (input.error) {
      throw new AppError(
        'SSO_PROVIDER_ERROR',
        input.errorDescription || input.error,
        401,
      );
    }

    if (!input.code || !input.state) {
      throw new AppError('SSO_CALLBACK_INVALID', 'SSO callback is invalid.', 400);
    }

    const state = await verifySsoStateToken(input.state, this.tokenSecret);
    const tokenResponse = await this.exchangeCode(input.code);

    if (!tokenResponse.id_token) {
      throw new AppError('SSO_ID_TOKEN_MISSING', 'SSO identity token is missing.', 401);
    }

    const claims = await this.verifyIdToken(tokenResponse.id_token, state.nonce);
    const discovery = await this.getDiscovery();
    const ssoSubject = getSsoSubject(claims, discovery.issuer);
    const email = getClaimString(claims.email)?.toLowerCase();

    if (!email) {
      throw new AppError('SSO_EMAIL_MISSING', 'SSO profile email is missing.', 401);
    }

    const username = getUsername(claims, email);
    const user = await this.userService.findBySsoSubject(ssoSubject);

    if (user) {
      if (!user.available) {
        throw new AppError('USER_UNAVAILABLE', 'User is not available.', 403);
      }

      return await this.createSessionCallbackUrl(user, state.redirectPath);
    }

    return await this.createBindCallbackUrl({
      email,
      redirectPath: state.redirectPath,
      ssoSubject,
      username,
    });
  }

  async exchangeHandoffToken(token: string) {
    this.requireConfig();

    const handoff = await verifySsoHandoffToken(token, this.tokenSecret);
    const user = await this.userService.findById(handoff.sub);

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'Authentication token is invalid.', 401);
    }

    return await createAuthSession(user, this.tokenSecret);
  }

  async createSsoAccount(input: CreateSsoAccountInput) {
    this.requireConfig();

    if (input.password !== input.confirmPassword) {
      throw new AppError('AUTH_PASSWORD_CONFIRMATION_MISMATCH', 'Password confirmation does not match.', 400);
    }

    const bind = await verifySsoBindToken(input.token, this.tokenSecret);
    const credentials = await hashPassword(input.password);
    const user = await this.userService.createWithSso({
      email: bind.email,
      ...credentials,
      ssoSubject: bind.ssoSubject,
      username: input.username,
    });

    return await createAuthSession(user, this.tokenSecret);
  }

  async bindSsoAccount(input: BindSsoAccountInput) {
    this.requireConfig();

    const bind = await verifySsoBindToken(input.token, this.tokenSecret);
    const user = await this.userService.findByEmail(input.email);

    if (!user || !user.available || !user.passwordHash || !user.passwordSalt) {
      throwInvalidCredentials();
    }

    const valid = await verifyPassword(input.password, user.passwordHash, user.passwordSalt);

    if (!valid) {
      throwInvalidCredentials();
    }

    const boundUser = await this.userService.bindSsoSubject(user, bind.ssoSubject);

    return await createAuthSession(boundUser, this.tokenSecret);
  }

  private async exchangeCode(code: string) {
    const config = this.requireConfig();
    const discovery = await this.getDiscovery();
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    });

    try {
      const response = await fetch(discovery.token_endpoint, {
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });

      return await readJson<OidcTokenResponse>(response, 'SSO_TOKEN_EXCHANGE_FAILED');
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('SSO_TOKEN_EXCHANGE_FAILED', 'SSO token exchange could not be completed.', 502);
    }
  }

  private async verifyIdToken(idToken: string, expectedNonce: string) {
    const config = this.requireConfig();
    const discovery = await this.getDiscovery();
    const jose = await loadJose();

    try {
      const protectedHeader = jose.decodeProtectedHeader(idToken);
      const algorithm = protectedHeader.alg;

      if (!algorithm) {
        throw new AppError('SSO_ID_TOKEN_INVALID', 'SSO identity token is invalid.', 401);
      }

      const verifier = findIdTokenVerifier(algorithm);
      const algorithms = getVerifierAlgorithms(discovery, verifier);

      if (!algorithms.includes(algorithm)) {
        throw new AppError('SSO_ID_TOKEN_INVALID', 'SSO identity token is invalid.', 401);
      }

      const payload = await verifier.verify({
        algorithms,
        config,
        discovery,
        idToken,
        jose,
        verifyOptions: {
          audience: config.clientId,
          issuer: discovery.issuer,
          requiredClaims: ['sub'],
        },
      });

      if (payload.nonce !== undefined && payload.nonce !== expectedNonce) {
        throw new AppError('SSO_NONCE_INVALID', 'SSO nonce is invalid.', 401);
      }

      return payload;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('SSO_ID_TOKEN_INVALID', 'SSO identity token is invalid.', 401);
    }
  }

  private async getDiscovery() {
    const config = this.requireConfig();

    this.discovery ??= fetchDiscovery(config);

    return await this.discovery;
  }

  private requireConfig() {
    if (!this.config) {
      throw new AppError('SSO_DISABLED', 'SSO authentication is disabled.', 404);
    }

    return this.config;
  }

  private async createSessionCallbackUrl(user: UserModel, redirectPath: string) {
    const config = this.requireConfig();
    const handoffToken = await createSsoHandoffToken(
      {
        sub: user.id,
        email: user.email,
        username: user.username,
      },
      this.tokenSecret,
    );
    const callbackUrl = new URL(config.frontendCallbackUrl);

    callbackUrl.searchParams.set('sso_token', handoffToken);
    callbackUrl.searchParams.set('redirect', redirectPath);

    return callbackUrl.toString();
  }

  private async createBindCallbackUrl(input: {
    email: string;
    redirectPath: string;
    ssoSubject: string;
    username: string;
  }) {
    const config = this.requireConfig();
    const bindToken = await createSsoBindToken(input, this.tokenSecret);
    const callbackUrl = new URL(config.frontendCallbackUrl);

    callbackUrl.searchParams.set('sso_bind_token', bindToken);
    callbackUrl.searchParams.set('sso_email', input.email);
    callbackUrl.searchParams.set('sso_username', input.username);
    callbackUrl.searchParams.set('redirect', input.redirectPath);

    return callbackUrl.toString();
  }
}

function findIdTokenVerifier(algorithm: string) {
  const verifier = idTokenVerifiers.find((candidate) => candidate.algorithms.includes(algorithm));

  if (!verifier) {
    throw new AppError('SSO_ID_TOKEN_INVALID', 'SSO identity token is invalid.', 401);
  }

  return verifier;
}

function getVerifierAlgorithms(discovery: OidcDiscoveryDocument, verifier: IdTokenVerifier) {
  if (!discovery.id_token_signing_alg_values_supported?.length) {
    return verifier.algorithms;
  }

  return verifier.algorithms.filter((algorithm) =>
    discovery.id_token_signing_alg_values_supported?.includes(algorithm),
  );
}

async function fetchDiscovery(config: SsoConfig) {
  let discovery: OidcDiscoveryDocument;

  try {
    const response = await fetch(`${config.issuerUrl.replace(/\/+$/, '')}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });

    discovery = await readJson<OidcDiscoveryDocument>(response, 'SSO_DISCOVERY_FAILED');
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('SSO_DISCOVERY_FAILED', 'SSO discovery could not be completed.', 502);
  }

  if (
    discovery.issuer !== config.issuerUrl ||
    !isUrl(discovery.authorization_endpoint) ||
    !isUrl(discovery.token_endpoint)
  ) {
    throw new AppError('SSO_DISCOVERY_INVALID', 'SSO discovery document is invalid.', 502);
  }

  return discovery;
}

async function readJson<T>(response: Response, code: string): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new AppError(code, 'The SSO provider request could not be completed.', 502, { status: response.status });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError(code, 'SSO provider response is invalid.', 502);
  }
}

function getUsername(claims: OidcIdTokenPayload, email: string) {
  return (
    getClaimString(claims.name) ??
    getClaimString(claims.preferred_username) ??
    email.split('@')[0] ??
    'SSO User'
  ).slice(0, 32);
}

function getSsoSubject(claims: OidcIdTokenPayload, issuer: string) {
  const providerSubject = getClaimString(claims.sub);

  if (!providerSubject) {
    throw new AppError('SSO_SUBJECT_MISSING', 'SSO profile subject is missing.', 401);
  }

  return `${providerSubject}@${new URL(issuer).host.toLowerCase()}`;
}

function getClaimString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function loadJose() {
  joseModule ??= import('jose');
  return joseModule;
}

function throwInvalidCredentials(): never {
  throw new AppError('AUTH_INVALID_CREDENTIALS', 'The email address or password is invalid.', 401);
}
