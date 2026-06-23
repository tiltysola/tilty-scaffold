import { randomBytes } from 'crypto';

import { SystemRole } from '@tilty/shared/access-control';

import { AppError } from '../../core/errors';
import { type CacheStore } from '../../infra/cache';
import { type AccessControlService } from '../access-control/access-control.service';
import { type UserModel } from '../users/user.model';
import { type UserService } from '../users/user.service';
import {
  createSsoBindToken,
  createSsoHandoffToken,
  createSsoStateToken,
  hashPassword,
  ssoBindTtlMs,
  ssoHandoffTtlMs,
  ssoStateTtlMs,
  verifyPassword,
  verifySsoBindToken,
  verifySsoHandoffToken,
  verifySsoStateToken,
} from './auth.crypto';
import { emailSchema } from './auth.schemas';
import { type AuthTokenConfig, createAuthSession } from './auth.service';
import { assertPasswordConfirmation } from './auth.validation';

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
  email_verified?: unknown;
  name?: unknown;
  nonce?: unknown;
  preferred_username?: unknown;
  sub?: unknown;
}

interface BindSsoAccountInput {
  identifier: string;
  password: string;
  token: string;
}

interface CreateSsoAccountInput {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  token: string;
}

interface IdTokenVerifier {
  algorithms: string[];
  requiresDiscoveryAlgorithmSupport?: boolean;
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

interface OneTimeTokenRecord {
  expiresAt: number;
  subject: string;
  used: boolean;
}

let joseModule: Promise<JoseModule> | undefined;

const idTokenVerifiers: IdTokenVerifier[] = [
  {
    algorithms: ['HS256', 'HS384', 'HS512'],
    requiresDiscoveryAlgorithmSupport: true,
    async verify({ algorithms, config, idToken, jose, verifyOptions }) {
      const { payload } = await jose.jwtVerify<OidcIdTokenPayload>(idToken, Buffer.from(config.clientSecret, 'utf8'), {
        ...verifyOptions,
        algorithms,
      });

      return payload;
    },
  },
  {
    algorithms: ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'],
    async verify({ algorithms, config, discovery, idToken, jose, verifyOptions }) {
      if (!isAllowedProviderUrl(discovery.jwks_uri, config)) {
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
const ssoDiscoveryCacheTtlMs = 60 * 60_000;
const ssoBindCacheKeyPrefix = 'auth:sso-bind:';
const ssoHandoffCacheKeyPrefix = 'auth:sso-handoff:';
const ssoStateCacheKeyPrefix = 'auth:sso-state:';
const maxTokenConsumeAttempts = 3;

export class SsoService {
  private discovery: Promise<OidcDiscoveryDocument> | undefined;
  private readonly cacheStore: CacheStore;

  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
    private readonly tokenSecret: string,
    private readonly config: SsoConfig | undefined,
    cacheStore: CacheStore,
    private readonly tokenConfig: AuthTokenConfig,
  ) {
    this.cacheStore = cacheStore;
  }

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

    await this.storeOneTimeToken(getSsoStateCacheKey(state.tokenId), nonce, ssoStateTtlMs);

    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scopes.join(' '));
    url.searchParams.set('state', state.token);
    url.searchParams.set('nonce', nonce);

    return url.toString();
  }

  async handleCallback(input: SsoCallbackInput) {
    this.requireConfig();

    if (input.error) {
      throw new AppError('SSO_PROVIDER_ERROR', 'SSO authentication could not be completed.', 401, {
        providerError: input.error,
        ...(input.errorDescription ? { providerErrorDescription: input.errorDescription } : {}),
      });
    }

    if (!input.code || !input.state) {
      throw new AppError('SSO_CALLBACK_INVALID', 'SSO callback is invalid.', 400);
    }

    const state = await verifySsoStateToken(input.state, this.tokenSecret);
    await this.consumeOneTimeToken(getSsoStateCacheKey(state.jti), state.nonce);
    const tokenResponse = await this.exchangeCode(input.code);

    if (!tokenResponse.id_token) {
      throw new AppError('SSO_ID_TOKEN_MISSING', 'SSO identity token is missing.', 401);
    }

    const claims = await this.verifyIdToken(tokenResponse.id_token, state.nonce);
    const discovery = await this.getDiscovery();
    const ssoSubject = getSsoSubject(claims, discovery.issuer);
    const email = getSsoEmail(claims);

    if (claims.email_verified !== true) {
      throw new AppError('SSO_EMAIL_UNVERIFIED', 'SSO profile email is not verified.', 401);
    }

    const displayName = getDisplayName(claims, email);
    const username = getUsername(claims, email);
    const user = await this.userService.findBySsoSubject(ssoSubject);

    if (user) {
      if (!user.available) {
        throw new AppError('USER_UNAVAILABLE', 'User is not available.', 403);
      }

      return this.createSessionCallbackUrl(user, state.redirectPath);
    }

    return this.createBindCallbackUrl({
      username,
      displayName,
      email,
      ssoSubject,
      redirectPath: state.redirectPath,
    });
  }

  async exchangeHandoffToken(token: string) {
    this.requireConfig();

    const handoff = await verifySsoHandoffToken(token, this.tokenSecret);
    const userId = await this.consumeOneTimeToken(getSsoHandoffCacheKey(handoff.jti));
    const user = await this.userService.findById(userId);

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'Authentication token is invalid.', 401);
    }

    return createAuthSession(user, this.tokenSecret, this.tokenConfig, this.cacheStore, this.accessControl);
  }

  async createSsoAccount(input: CreateSsoAccountInput) {
    this.requireConfig();
    assertPasswordConfirmation(input);

    const bind = await verifySsoBindToken(input.token, this.tokenSecret);
    const tokenKey = getSsoBindCacheKey(bind.jti);

    await this.requireOneTimeToken(tokenKey, bind.ssoSubject);

    const existingBySubject = await this.userService.findBySsoSubject(bind.ssoSubject);

    if (existingBySubject) {
      throw new AppError('SSO_SUBJECT_EXISTS', 'The SSO identity is already associated with an account.', 409);
    }

    const existingByEmail = await this.userService.findByEmail(bind.email);

    if (existingByEmail) {
      throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
    }

    const existingByUsername = await this.userService.findByUsername(input.username);

    if (existingByUsername) {
      throw new AppError('USER_USERNAME_EXISTS', 'The username is already registered.', 409);
    }

    await this.consumeOneTimeToken(tokenKey, bind.ssoSubject);
    const credentials = await hashPassword(input.password);
    const user = await this.userService.createWithSso({
      username: input.username,
      displayName: input.displayName,
      email: bind.email,
      ...credentials,
      ssoSubject: bind.ssoSubject,
    });

    await this.bootstrapRootRoleForFirstUser(user);

    return createAuthSession(user, this.tokenSecret, this.tokenConfig, this.cacheStore, this.accessControl);
  }

  async bindSsoAccount(input: BindSsoAccountInput) {
    this.requireConfig();

    const bind = await verifySsoBindToken(input.token, this.tokenSecret);
    const tokenKey = getSsoBindCacheKey(bind.jti);

    await this.requireOneTimeToken(tokenKey, bind.ssoSubject);

    const user = await this.userService.findByLoginIdentifier(input.identifier);

    if (!user || !user.available || !user.passwordHash || !user.passwordSalt) {
      throwInvalidCredentials();
    }

    const valid = await verifyPassword(input.password, user.passwordHash, user.passwordSalt);

    if (!valid) {
      throwInvalidCredentials();
    }

    if (user.ssoSubject && user.ssoSubject !== bind.ssoSubject) {
      throw new AppError('USER_SSO_SUBJECT_EXISTS', 'The user is already associated with another SSO identity.', 409);
    }

    await this.consumeOneTimeToken(tokenKey, bind.ssoSubject);

    const boundUser = await this.userService.bindSsoSubject(user, bind.ssoSubject);

    return createAuthSession(boundUser, this.tokenSecret, this.tokenConfig, this.cacheStore, this.accessControl);
  }

  private async bootstrapRootRoleForFirstUser(user: UserModel) {
    if (await this.userService.hasMultipleAvailableUsers()) {
      return;
    }

    await this.accessControl.assignSystemRoleToUser(user.id, SystemRole.Root);
  }

  private async storeOneTimeToken(key: string, subject: string, ttlMs: number) {
    await this.cacheStore.set<OneTimeTokenRecord>(
      key,
      {
        expiresAt: Date.now() + ttlMs,
        subject,
        used: false,
      },
      ttlMs,
    );
  }

  private async requireOneTimeToken(key: string, subject: string) {
    const record = await this.cacheStore.get<OneTimeTokenRecord>(key);

    if (!record || record.subject !== subject || record.used) {
      throwInvalidSsoToken();
    }

    if (record.expiresAt <= Date.now()) {
      await this.cacheStore.delete(key);
      throwInvalidSsoToken();
    }
  }

  private async consumeOneTimeToken(key: string, subject?: string) {
    for (let attempt = 0; attempt < maxTokenConsumeAttempts; attempt += 1) {
      const record = await this.cacheStore.get<OneTimeTokenRecord>(key);
      const now = Date.now();

      if (!record || record.used || (subject !== undefined && record.subject !== subject)) {
        throwInvalidSsoToken();
      }

      if (record.expiresAt <= now) {
        await this.cacheStore.delete(key);
        throwInvalidSsoToken();
      }

      const consumed = await this.cacheStore.compareAndSet(
        key,
        record,
        {
          ...record,
          used: true,
        },
        record.expiresAt - now,
      );

      if (consumed) {
        return record.subject;
      }
    }

    throw new AppError('SSO_TOKEN_CONFLICT', 'SSO token state changed. Try again.', 409);
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

      if (payload.nonce !== expectedNonce) {
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
    const cacheKey = getDiscoveryCacheKey(config);
    const cached = await this.cacheStore.get<OidcDiscoveryDocument>(cacheKey);

    if (cached) {
      validateDiscovery(cached, config);
      return cached;
    }

    this.discovery ??= this.fetchAndCacheDiscovery(config, cacheKey);

    try {
      return await this.discovery;
    } finally {
      this.discovery = undefined;
    }
  }

  private async fetchAndCacheDiscovery(config: SsoConfig, cacheKey: string) {
    const discovery = await fetchDiscovery(config);

    await this.cacheStore.set(cacheKey, discovery, ssoDiscoveryCacheTtlMs);

    return discovery;
  }

  private requireConfig() {
    if (!this.config) {
      throw new AppError('SSO_DISABLED', 'SSO authentication is disabled.', 404);
    }

    return this.config;
  }

  private async createSessionCallbackUrl(user: UserModel, redirectPath: string) {
    const config = this.requireConfig();
    const handoffToken = await createSsoHandoffToken(this.tokenSecret);
    const callbackUrl = new URL(config.frontendCallbackUrl);

    await this.storeOneTimeToken(getSsoHandoffCacheKey(handoffToken.tokenId), user.id, ssoHandoffTtlMs);

    setCallbackFragment(callbackUrl, {
      redirect: redirectPath,
      sso_token: handoffToken.token,
    });

    return callbackUrl.toString();
  }

  private async createBindCallbackUrl(input: {
    username: string;
    displayName: string;
    email: string;
    ssoSubject: string;
    redirectPath: string;
  }) {
    const config = this.requireConfig();
    const bindToken = await createSsoBindToken(input, this.tokenSecret);
    const callbackUrl = new URL(config.frontendCallbackUrl);

    await this.storeOneTimeToken(getSsoBindCacheKey(bindToken.tokenId), input.ssoSubject, ssoBindTtlMs);

    setCallbackFragment(callbackUrl, {
      redirect: input.redirectPath,
      sso_bind_token: bindToken.token,
      sso_display_name: input.displayName,
      sso_email: input.email,
      sso_username: input.username,
    });

    return callbackUrl.toString();
  }
}

export async function testSsoDiscovery(config: SsoConfig) {
  await fetchDiscovery(config);

  return {
    connected: true,
  } as const;
}

function setCallbackFragment(url: URL, values: Record<string, string>) {
  const params = new URLSearchParams(values);

  url.hash = params.toString();
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
    return verifier.requiresDiscoveryAlgorithmSupport ? [] : verifier.algorithms;
  }

  return verifier.algorithms.filter((algorithm) =>
    discovery.id_token_signing_alg_values_supported?.includes(algorithm),
  );
}

async function fetchDiscovery(config: SsoConfig) {
  let discovery: OidcDiscoveryDocument;

  try {
    const response = await fetch(`${config.issuerUrl}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });

    discovery = await readJson<OidcDiscoveryDocument>(response, 'SSO_DISCOVERY_FAILED');
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('SSO_DISCOVERY_FAILED', 'SSO discovery could not be completed.', 502);
  }

  validateDiscovery(discovery, config);

  return discovery;
}

function validateDiscovery(discovery: OidcDiscoveryDocument, config: SsoConfig) {
  if (
    discovery.issuer !== config.issuerUrl ||
    !isAllowedProviderUrl(discovery.authorization_endpoint, config) ||
    !isAllowedProviderUrl(discovery.token_endpoint, config) ||
    (discovery.jwks_uri !== undefined && !isAllowedProviderUrl(discovery.jwks_uri, config))
  ) {
    throw new AppError('SSO_DISCOVERY_INVALID', 'SSO discovery document is invalid.', 502);
  }
}

function getDiscoveryCacheKey(config: SsoConfig) {
  return `sso:discovery:${config.issuerUrl}`;
}

function getSsoStateCacheKey(tokenId: string) {
  return `${ssoStateCacheKeyPrefix}${tokenId}`;
}

function getSsoHandoffCacheKey(tokenId: string) {
  return `${ssoHandoffCacheKeyPrefix}${tokenId}`;
}

function getSsoBindCacheKey(tokenId: string) {
  return `${ssoBindCacheKeyPrefix}${tokenId}`;
}

async function readJson<T>(response: Response, code: string): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new AppError(code, 'The SSO provider request could not be completed.', 502, {
      status: response.status,
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError(code, 'SSO provider response is invalid.', 502);
  }
}

function getUsername(claims: OidcIdTokenPayload, email: string) {
  return normalizeUsername(getClaimString(claims.preferred_username) ?? email.split('@')[0] ?? '');
}

function getDisplayName(claims: OidcIdTokenPayload, email: string) {
  return (getClaimString(claims.name) ?? getClaimString(claims.preferred_username) ?? email.split('@')[0] ?? '')
    .slice(0, 64)
    .trim();
}

function getSsoEmail(claims: OidcIdTokenPayload) {
  const email = getClaimString(claims.email);

  if (!email) {
    throw new AppError('SSO_EMAIL_MISSING', 'SSO profile email is missing.', 401);
  }

  const parsed = emailSchema.safeParse(email);

  if (!parsed.success) {
    throw new AppError('SSO_EMAIL_INVALID', 'SSO profile email is invalid.', 401);
  }

  return parsed.data;
}

function normalizeUsername(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .slice(0, 32)
    .replace(/[^a-z0-9]+$/g, '');

  return normalized.length >= 3 ? normalized : '';
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

function isAllowedProviderUrl(value: unknown, config: SsoConfig): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);
    const issuer = new URL(config.issuerUrl);

    if (url.username || url.password) {
      return false;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    if (url.origin !== issuer.origin) {
      return false;
    }

    return issuer.protocol !== 'https:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function loadJose() {
  joseModule ??= import('jose');
  return joseModule;
}

function throwInvalidCredentials(): never {
  throw new AppError('AUTH_INVALID_CREDENTIALS', 'The account identifier or password is invalid.', 401);
}

function throwInvalidSsoToken(): never {
  throw new AppError('AUTH_INVALID_TOKEN', 'Authentication token is invalid.', 401);
}
