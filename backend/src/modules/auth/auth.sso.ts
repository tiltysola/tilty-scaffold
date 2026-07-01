import { randomBytes } from 'crypto';

import { SystemRole } from '@tilty/shared/access-control';
import { AuthVerificationPurpose } from '@tilty/shared/auth';
import { SetupSsoProtocol, type SetupSsoProtocolValue } from '@tilty/shared/setup';

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
import { type AuthTokenConfig, createAuthSession, defaultAuthSessionRequestContext } from './auth.service';
import { assertPasswordConfirmation } from './auth.validation';
import { type AuthSessionRequestContext, AuthSessionService } from './auth-session.service';
import { AuthVerificationService, type SsoBindVerificationIdentity } from './auth-verification.service';

type JoseModule = typeof import('jose', { with: { 'resolution-mode': 'import' } });
type SsoCallbackMode = 'bind' | 'login';
type SsoProviderPurpose = 'binding' | 'login';
export type SsoProtocol = SetupSsoProtocolValue;

export interface SsoProviderConfig {
  id: string;
  name: string;
  iconUrl?: string | undefined;
  protocol: SsoProtocol;
  loginEnabled: boolean;
  bindingEnabled: boolean;
  clientId: string;
  clientSecret: string;
  frontendCallbackUrl: string;
  redirectUri: string;
  requestTimeoutMs: number;
  scopes: string[];
  issuerUrl?: string | undefined;
  authorizationUrl?: string | undefined;
  tokenUrl?: string | undefined;
  userInfoUrl?: string | undefined;
  subjectField?: string | undefined;
  emailField?: string | undefined;
  emailVerifiedField?: string | undefined;
  displayNameField?: string | undefined;
  usernameField?: string | undefined;
}

export interface SsoProfilesConfig {
  profiles: SsoProviderConfig[];
}

export type SsoServiceConfig = SsoProfilesConfig;

export interface SsoCallbackInput {
  code?: string | undefined;
  error?: string | undefined;
  errorDescription?: string | undefined;
  state?: string | undefined;
}

interface SsoPublicProvider {
  id: string;
  name: string;
  iconUrl?: string | undefined;
  protocol: SsoProtocol;
  loginEnabled: boolean;
  bindingEnabled: boolean;
}

interface NormalizedSsoConfig {
  loginEnabled: boolean;
  profiles: NormalizedSsoProviderConfig[];
}

interface BaseSsoProviderConfig {
  id: string;
  name: string;
  iconUrl?: string | undefined;
  protocol: SsoProtocol;
  loginEnabled: boolean;
  bindingEnabled: boolean;
  clientId: string;
  clientSecret: string;
  frontendCallbackUrl: string;
  redirectUri: string;
  requestTimeoutMs: number;
  scopes: string[];
}

interface OidcProviderConfig extends BaseSsoProviderConfig {
  protocol: typeof SetupSsoProtocol.Oidc;
  issuerUrl: string;
}

interface OAuth2ProviderConfig extends BaseSsoProviderConfig {
  protocol: typeof SetupSsoProtocol.Oauth2;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  subjectField: string;
  emailField: string;
  emailVerifiedField: string;
  displayNameField: string;
  usernameField: string;
}

type NormalizedSsoProviderConfig = OAuth2ProviderConfig | OidcProviderConfig;

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  id_token_signing_alg_values_supported?: string[];
  issuer: string;
  jwks_uri?: string;
  token_endpoint: string;
}

interface SsoTokenResponse {
  access_token?: string;
  id_token?: string;
}

interface SsoClaims {
  email: string;
  emailVerified: boolean;
  displayName: string;
  providerSubject: string;
  username: string;
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
  config: OidcProviderConfig;
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

type VerifiedSsoIdentity = SsoBindVerificationIdentity;

interface SsoIdentityListItem {
  providerId: string;
  providerName: string;
  providerSubject: string;
  email: string;
  createdAt: string;
  iconUrl?: string | undefined;
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
      if (!discovery.jwks_uri || !isAllowedProviderUrl(discovery.jwks_uri, config)) {
        throw new AppError('SSO_DISCOVERY_INVALID', 'error.SSO_DISCOVERY_INVALID', 502);
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
const defaultOAuth2SubjectField = 'sub';
const defaultOAuth2EmailField = 'email';
const defaultOAuth2EmailVerifiedField = 'email_verified';
const defaultOAuth2DisplayNameField = 'name';
const defaultOAuth2UsernameField = 'preferred_username';

export class SsoService {
  private readonly cacheStore: CacheStore;
  private readonly config: NormalizedSsoConfig | undefined;
  private readonly discoveryByProviderId = new Map<string, Promise<OidcDiscoveryDocument>>();

  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
    private readonly tokenSecret: string,
    config: SsoServiceConfig | undefined,
    cacheStore: CacheStore,
    private readonly tokenConfig: AuthTokenConfig,
    private readonly sessionService: AuthSessionService,
    private readonly verificationService: AuthVerificationService,
  ) {
    this.cacheStore = cacheStore;
    this.config = normalizeSsoConfig(config);
  }

  getPublicConfig() {
    if (!this.config) {
      return {
        enabled: false,
        loginEnabled: false,
        providers: [],
      };
    }

    return {
      enabled: this.config.profiles.length > 0,
      loginEnabled: this.config.loginEnabled,
      providers: this.config.profiles.map(toPublicProvider),
    };
  }

  async createLoginUrl(redirectPath = '/dashboard', providerId?: string | undefined) {
    const provider = this.requireProvider(providerId, 'login');

    return this.createAuthorizationUrl(provider, {
      mode: 'login',
      redirectPath,
    });
  }

  async createBindUrl(userId: string, redirectPath = '/profile', providerId?: string | undefined) {
    const provider = this.requireProvider(providerId, 'binding');

    return this.createAuthorizationUrl(provider, {
      mode: 'bind',
      redirectPath,
      userId,
    });
  }

  async handleCallback(input: SsoCallbackInput, context: AuthSessionRequestContext = defaultAuthSessionRequestContext) {
    this.requireConfig();

    if (input.error) {
      throw new AppError('SSO_PROVIDER_ERROR', 'error.SSO_PROVIDER_ERROR', 401, {
        providerError: input.error,
        ...(input.errorDescription ? { providerErrorDescription: input.errorDescription } : {}),
      });
    }

    if (!input.code || !input.state) {
      throw new AppError('SSO_CALLBACK_INVALID', 'error.SSO_CALLBACK_INVALID', 400);
    }

    const state = await verifySsoStateToken(input.state, this.tokenSecret);
    const mode = state.mode ?? 'login';
    const provider = this.requireProvider(state.providerId, mode === 'bind' ? 'binding' : 'login');

    await this.consumeOneTimeToken(getSsoStateCacheKey(state.jti), getSsoStateSubject(provider.id, state.nonce));

    const claims = await this.fetchSsoClaims(provider, input.code, state.nonce);

    if (claims.emailVerified !== true) {
      throw new AppError('SSO_EMAIL_UNVERIFIED', 'error.SSO_EMAIL_UNVERIFIED', 401);
    }

    const identity = toVerifiedIdentity(provider, claims);

    if (mode === 'bind') {
      if (!state.userId) {
        throwInvalidSsoToken();
      }

      const user = await this.userService.findById(state.userId);

      if (!user || !user.available) {
        throwInvalidSsoToken();
      }

      await this.userService.bindSsoIdentity(user, identity);

      return this.createProfileBindCallbackUrl(provider, state.redirectPath);
    }

    const user = await this.findUserBySsoIdentity(identity);

    if (user) {
      if (!user.available) {
        throw new AppError('USER_UNAVAILABLE', 'error.USER_UNAVAILABLE', 403);
      }

      return this.createSessionCallbackUrl(provider, user, state.redirectPath, context);
    }

    return this.createBindCallbackUrl(provider, {
      ...identity,
      username: claims.username,
      displayName: claims.displayName,
      email: claims.email,
      redirectPath: state.redirectPath,
    });
  }

  async exchangeHandoffToken(token: string, context: AuthSessionRequestContext = defaultAuthSessionRequestContext) {
    this.requireConfig();

    const handoff = await verifySsoHandoffToken(token, this.tokenSecret);
    const userId = await this.consumeOneTimeToken(getSsoHandoffCacheKey(handoff.jti));
    const user = await this.userService.findById(userId);

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'error.AUTH_INVALID_TOKEN', 401);
    }

    return createAuthSession(
      user,
      this.tokenSecret,
      this.tokenConfig,
      this.cacheStore,
      this.accessControl,
      this.sessionService,
      context,
    );
  }

  async createSsoAccount(
    input: CreateSsoAccountInput,
    context: AuthSessionRequestContext = defaultAuthSessionRequestContext,
  ) {
    this.requireConfig();
    assertPasswordConfirmation(input);

    const bind = await verifySsoBindToken(input.token, this.tokenSecret);
    const identity = getVerifiedIdentityFromBindToken(bind);
    const tokenKey = getSsoBindCacheKey(bind.jti);
    const tokenSubject = getSsoBindTokenSubject(identity);

    await this.requireOneTimeToken(tokenKey, tokenSubject);

    const existingBySubject = await this.findUserBySsoIdentity(identity);

    if (existingBySubject) {
      throw new AppError('SSO_SUBJECT_EXISTS', 'error.SSO_SUBJECT_EXISTS', 409);
    }

    const existingByEmail = await this.userService.findByEmail(bind.email);

    if (existingByEmail) {
      throw new AppError('USER_EMAIL_EXISTS', 'error.USER_EMAIL_EXISTS', 409);
    }

    const existingByUsername = await this.userService.findByUsername(input.username);

    if (existingByUsername) {
      throw new AppError('USER_USERNAME_EXISTS', 'error.USER_USERNAME_EXISTS', 409);
    }

    await this.consumeOneTimeToken(tokenKey, tokenSubject);
    const credentials = await hashPassword(input.password);
    const user = await this.userService.createWithSso({
      username: input.username,
      displayName: input.displayName,
      email: bind.email,
      emailVerified: true,
      ...credentials,
      providerId: identity.providerId,
      providerSubject: identity.providerSubject,
    });

    await this.bootstrapRootRoleForFirstUser(user);

    return createAuthSession(
      user,
      this.tokenSecret,
      this.tokenConfig,
      this.cacheStore,
      this.accessControl,
      this.sessionService,
      context,
    );
  }

  async bindSsoAccount(
    input: BindSsoAccountInput,
    context: AuthSessionRequestContext = defaultAuthSessionRequestContext,
  ) {
    this.requireConfig();

    const bind = await verifySsoBindToken(input.token, this.tokenSecret);
    const identity = getVerifiedIdentityFromBindToken(bind);
    const tokenKey = getSsoBindCacheKey(bind.jti);
    const tokenSubject = getSsoBindTokenSubject(identity);

    await this.requireOneTimeToken(tokenKey, tokenSubject);

    const user = await this.userService.findByLoginIdentifier(input.identifier);

    if (!user || !user.available || !user.passwordHash || !user.passwordSalt) {
      throwInvalidCredentials();
    }

    const valid = await verifyPassword(input.password, user.passwordHash, user.passwordSalt);

    if (!valid) {
      throwInvalidCredentials();
    }

    await this.userService.assertCanBindSsoIdentity(user, identity);

    if (user.mfaRequiredForSso && (await this.verificationService.shouldRequireLoginVerification(user))) {
      await this.consumeOneTimeToken(tokenKey, tokenSubject);
      return this.verificationService.createSsoBindChallenge(user, context, identity);
    }

    await this.consumeOneTimeToken(tokenKey, tokenSubject);
    const boundUser = await this.userService.bindSsoIdentity(user, identity);

    return createAuthSession(
      boundUser,
      this.tokenSecret,
      this.tokenConfig,
      this.cacheStore,
      this.accessControl,
      this.sessionService,
      context,
    );
  }

  async listUserIdentities(userId: string): Promise<SsoIdentityListItem[]> {
    const identities = await this.userService.listSsoIdentities(userId);

    return identities.map((identity) => {
      const provider = this.config?.profiles.find((profile) => profile.id === identity.providerId);

      return {
        providerId: identity.providerId,
        providerName: provider?.name ?? identity.providerId,
        providerSubject: identity.providerSubject,
        email: identity.email,
        createdAt: identity.createdAt.toISOString(),
        ...(provider?.iconUrl ? { iconUrl: provider.iconUrl } : {}),
      };
    });
  }

  private async createAuthorizationUrl(
    provider: NormalizedSsoProviderConfig,
    input: {
      mode: SsoCallbackMode;
      redirectPath: string;
      userId?: string | undefined;
    },
  ) {
    const authorizationUrl =
      provider.protocol === SetupSsoProtocol.Oidc
        ? (await this.getDiscovery(provider)).authorization_endpoint
        : provider.authorizationUrl;
    const nonce = randomBytes(16).toString('base64url');
    const state = await createSsoStateToken(
      {
        mode: input.mode,
        nonce,
        providerId: provider.id,
        redirectPath: input.redirectPath,
        ...(input.userId ? { userId: input.userId } : {}),
      },
      this.tokenSecret,
    );
    const url = new URL(authorizationUrl);

    await this.storeOneTimeToken(
      getSsoStateCacheKey(state.tokenId),
      getSsoStateSubject(provider.id, nonce),
      ssoStateTtlMs,
    );

    url.searchParams.set('client_id', provider.clientId);
    url.searchParams.set('redirect_uri', provider.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', provider.scopes.join(' '));
    url.searchParams.set('state', state.token);

    if (provider.protocol === SetupSsoProtocol.Oidc) {
      url.searchParams.set('nonce', nonce);
    }

    return url.toString();
  }

  private async fetchSsoClaims(provider: NormalizedSsoProviderConfig, code: string, expectedNonce: string) {
    const tokenResponse = await this.exchangeCode(provider, code);

    if (provider.protocol === SetupSsoProtocol.Oidc) {
      if (!tokenResponse.id_token) {
        throw new AppError('SSO_ID_TOKEN_MISSING', 'error.SSO_ID_TOKEN_MISSING', 401);
      }

      return this.verifyOidcClaims(provider, tokenResponse.id_token, expectedNonce);
    }

    if (!tokenResponse.access_token) {
      throw new AppError('SSO_ACCESS_TOKEN_MISSING', 'error.SSO_ACCESS_TOKEN_MISSING', 401);
    }

    return this.fetchOAuth2Claims(provider, tokenResponse.access_token);
  }

  private async verifyOidcClaims(
    provider: OidcProviderConfig,
    idToken: string,
    expectedNonce: string,
  ): Promise<SsoClaims> {
    const discovery = await this.getDiscovery(provider);
    const jose = await loadJose();

    try {
      const protectedHeader = jose.decodeProtectedHeader(idToken);
      const algorithm = protectedHeader.alg;

      if (!algorithm) {
        throw new AppError('SSO_ID_TOKEN_INVALID', 'error.SSO_ID_TOKEN_INVALID', 401);
      }

      const verifier = findIdTokenVerifier(algorithm);
      const algorithms = getVerifierAlgorithms(discovery, verifier);

      if (!algorithms.includes(algorithm)) {
        throw new AppError('SSO_ID_TOKEN_INVALID', 'error.SSO_ID_TOKEN_INVALID', 401);
      }

      const payload = await verifier.verify({
        algorithms,
        config: provider,
        discovery,
        idToken,
        jose,
        verifyOptions: {
          audience: provider.clientId,
          issuer: discovery.issuer,
          requiredClaims: ['sub'],
        },
      });

      if (payload.nonce !== expectedNonce) {
        throw new AppError('SSO_NONCE_INVALID', 'error.SSO_NONCE_INVALID', 401);
      }

      return {
        providerSubject: getProviderSubject(payload.sub),
        email: getSsoEmail(payload.email),
        emailVerified: payload.email_verified === true,
        displayName: getDisplayName(payload.name, payload.preferred_username, payload.email),
        username: getUsername(payload.preferred_username, payload.email),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('SSO_ID_TOKEN_INVALID', 'error.SSO_ID_TOKEN_INVALID', 401);
    }
  }

  private async fetchOAuth2Claims(provider: OAuth2ProviderConfig, accessToken: string): Promise<SsoClaims> {
    let profile: unknown;

    try {
      const response = await fetch(provider.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(provider.requestTimeoutMs),
      });

      profile = await readJson<unknown>(response, 'SSO_USERINFO_FAILED');
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('SSO_USERINFO_FAILED', 'error.SSO_USERINFO_FAILED', 502);
    }

    return {
      providerSubject: getProviderSubject(getMappedValue(profile, provider.subjectField)),
      email: getSsoEmail(getMappedValue(profile, provider.emailField)),
      emailVerified: getMappedValue(profile, provider.emailVerifiedField) === true,
      displayName: getDisplayName(
        getMappedValue(profile, provider.displayNameField),
        getMappedValue(profile, provider.usernameField),
        getMappedValue(profile, provider.emailField),
      ),
      username: getUsername(
        getMappedValue(profile, provider.usernameField),
        getMappedValue(profile, provider.emailField),
      ),
    };
  }

  private async exchangeCode(provider: NormalizedSsoProviderConfig, code: string) {
    const tokenEndpoint =
      provider.protocol === SetupSsoProtocol.Oidc
        ? (await this.getDiscovery(provider)).token_endpoint
        : provider.tokenUrl;
    const body = new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: provider.redirectUri,
    });

    try {
      const response = await fetch(tokenEndpoint, {
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        signal: AbortSignal.timeout(provider.requestTimeoutMs),
      });

      return await readJson<SsoTokenResponse>(response, 'SSO_TOKEN_EXCHANGE_FAILED');
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('SSO_TOKEN_EXCHANGE_FAILED', 'error.SSO_TOKEN_EXCHANGE_FAILED', 502);
    }
  }

  private async getDiscovery(provider: OidcProviderConfig) {
    const cacheKey = getDiscoveryCacheKey(provider);
    const cached = await this.cacheStore.get<OidcDiscoveryDocument>(cacheKey);

    if (cached) {
      validateDiscovery(cached, provider);
      return cached;
    }

    const currentDiscovery =
      this.discoveryByProviderId.get(provider.id) ?? this.fetchAndCacheDiscovery(provider, cacheKey);

    this.discoveryByProviderId.set(provider.id, currentDiscovery);

    try {
      return await currentDiscovery;
    } finally {
      this.discoveryByProviderId.delete(provider.id);
    }
  }

  private async fetchAndCacheDiscovery(provider: OidcProviderConfig, cacheKey: string) {
    const discovery = await fetchDiscovery(provider);

    await this.cacheStore.set(cacheKey, discovery, ssoDiscoveryCacheTtlMs);

    return discovery;
  }

  private async findUserBySsoIdentity(identity: VerifiedSsoIdentity) {
    return this.userService.findBySsoIdentity(identity.providerId, identity.providerSubject);
  }

  private requireConfig() {
    if (!this.config) {
      throw new AppError('SSO_DISABLED', 'error.SSO_DISABLED', 404);
    }

    return this.config;
  }

  private requireProvider(providerId: string | undefined, purpose: SsoProviderPurpose) {
    const config = this.requireConfig();
    const provider = providerId
      ? config.profiles.find((candidate) => candidate.id === providerId)
      : config.profiles.find((candidate) => isProviderEnabledForPurpose(candidate, purpose));

    if (!provider) {
      throw new AppError('SSO_PROVIDER_NOT_FOUND', 'error.SSO_PROVIDER_NOT_FOUND', 404);
    }

    if (!isProviderEnabledForPurpose(provider, purpose)) {
      const code = purpose === 'login' ? 'SSO_LOGIN_DISABLED' : 'SSO_BINDING_DISABLED';

      throw new AppError(code, `error.${code}`, 403);
    }

    return provider;
  }

  private async createSessionCallbackUrl(
    provider: NormalizedSsoProviderConfig,
    user: UserModel,
    redirectPath: string,
    context: AuthSessionRequestContext,
  ) {
    const callbackUrl = new URL(provider.frontendCallbackUrl);

    if (user.mfaRequiredForSso && (await this.verificationService.shouldRequireLoginVerification(user))) {
      const challenge = await this.verificationService.createLoginChallenge(user, context, AuthVerificationPurpose.Sso);

      setCallbackFragment(callbackUrl, {
        redirect: redirectPath,
        verification_default_method: challenge.defaultMethod,
        verification_method_details: JSON.stringify(challenge.methods),
        verification_methods: challenge.methods.map((method) => method.method).join(','),
        verification_token: challenge.verificationToken,
      });

      return callbackUrl.toString();
    }

    const handoffToken = await createSsoHandoffToken(this.tokenSecret);

    await this.storeOneTimeToken(getSsoHandoffCacheKey(handoffToken.tokenId), user.id, ssoHandoffTtlMs);

    setCallbackFragment(callbackUrl, {
      redirect: redirectPath,
      sso_token: handoffToken.token,
    });

    return callbackUrl.toString();
  }

  private async createProfileBindCallbackUrl(provider: NormalizedSsoProviderConfig, redirectPath: string) {
    const callbackUrl = new URL(provider.frontendCallbackUrl);

    setCallbackFragment(callbackUrl, {
      redirect: redirectPath,
      sso_profile_bind: 'success',
      sso_provider_id: provider.id,
      sso_provider_name: provider.name,
    });

    return callbackUrl.toString();
  }

  private async createBindCallbackUrl(
    provider: NormalizedSsoProviderConfig,
    input: VerifiedSsoIdentity & {
      username: string;
      displayName: string;
      redirectPath: string;
    },
  ) {
    const bindToken = await createSsoBindToken(input, this.tokenSecret);
    const callbackUrl = new URL(provider.frontendCallbackUrl);

    await this.storeOneTimeToken(getSsoBindCacheKey(bindToken.tokenId), getSsoBindTokenSubject(input), ssoBindTtlMs);

    setCallbackFragment(callbackUrl, {
      redirect: input.redirectPath,
      sso_bind_token: bindToken.token,
      sso_display_name: input.displayName,
      sso_email: input.email,
      sso_provider_id: provider.id,
      sso_provider_name: provider.name,
      sso_username: input.username,
    });

    return callbackUrl.toString();
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

    throw new AppError('SSO_TOKEN_CONFLICT', 'error.SSO_TOKEN_CONFLICT', 409);
  }
}

export async function testSsoDiscovery(config: SsoServiceConfig) {
  const normalized = normalizeSsoConfig(config);

  if (!normalized) {
    return {
      connected: true,
      providerIds: [],
    } as const;
  }

  for (const provider of normalized.profiles) {
    if (provider.protocol === SetupSsoProtocol.Oidc) {
      await fetchDiscovery(provider);
    }
  }

  return {
    connected: true,
    providerIds: normalized.profiles.map((provider) => provider.id),
  } as const;
}

function normalizeSsoConfig(config: SsoServiceConfig | undefined): NormalizedSsoConfig | undefined {
  if (!config) {
    return undefined;
  }

  const profiles = config.profiles.map(normalizeSsoProviderConfig);

  return profiles.length > 0
    ? {
        loginEnabled: profiles.some((profile) => profile.loginEnabled),
        profiles,
      }
    : undefined;
}

function normalizeSsoProviderConfig(profile: SsoProviderConfig): NormalizedSsoProviderConfig {
  const base = {
    id: profile.id,
    name: profile.name,
    ...(profile.iconUrl ? { iconUrl: profile.iconUrl } : {}),
    protocol: profile.protocol,
    loginEnabled: profile.loginEnabled,
    bindingEnabled: profile.bindingEnabled,
    clientId: profile.clientId,
    clientSecret: profile.clientSecret,
    frontendCallbackUrl: profile.frontendCallbackUrl,
    redirectUri: profile.redirectUri,
    requestTimeoutMs: profile.requestTimeoutMs,
    scopes: profile.scopes,
  };

  if (profile.protocol === SetupSsoProtocol.Oauth2) {
    return {
      ...base,
      protocol: SetupSsoProtocol.Oauth2,
      authorizationUrl: profile.authorizationUrl!,
      tokenUrl: profile.tokenUrl!,
      userInfoUrl: profile.userInfoUrl!,
      subjectField: profile.subjectField ?? defaultOAuth2SubjectField,
      emailField: profile.emailField ?? defaultOAuth2EmailField,
      emailVerifiedField: profile.emailVerifiedField ?? defaultOAuth2EmailVerifiedField,
      displayNameField: profile.displayNameField ?? defaultOAuth2DisplayNameField,
      usernameField: profile.usernameField ?? defaultOAuth2UsernameField,
    };
  }

  return {
    ...base,
    protocol: SetupSsoProtocol.Oidc,
    issuerUrl: profile.issuerUrl!.replace(/\/+$/, ''),
  };
}

function toPublicProvider(provider: NormalizedSsoProviderConfig): SsoPublicProvider {
  return {
    id: provider.id,
    name: provider.name,
    ...(provider.iconUrl ? { iconUrl: provider.iconUrl } : {}),
    protocol: provider.protocol,
    loginEnabled: provider.loginEnabled,
    bindingEnabled: provider.bindingEnabled,
  };
}

function isProviderEnabledForPurpose(provider: NormalizedSsoProviderConfig, purpose: SsoProviderPurpose) {
  if (purpose === 'login') {
    return provider.loginEnabled;
  }

  return provider.bindingEnabled;
}

function setCallbackFragment(url: URL, values: Record<string, string>) {
  const params = new URLSearchParams(values);

  url.hash = params.toString();
}

function findIdTokenVerifier(algorithm: string) {
  const verifier = idTokenVerifiers.find((candidate) => candidate.algorithms.includes(algorithm));

  if (!verifier) {
    throw new AppError('SSO_ID_TOKEN_INVALID', 'error.SSO_ID_TOKEN_INVALID', 401);
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

async function fetchDiscovery(provider: OidcProviderConfig) {
  let discovery: OidcDiscoveryDocument;

  try {
    const response = await fetch(`${provider.issuerUrl}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(provider.requestTimeoutMs),
    });

    discovery = await readJson<OidcDiscoveryDocument>(response, 'SSO_DISCOVERY_FAILED');
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('SSO_DISCOVERY_FAILED', 'error.SSO_DISCOVERY_FAILED', 502);
  }

  validateDiscovery(discovery, provider);

  return discovery;
}

function validateDiscovery(discovery: OidcDiscoveryDocument, provider: OidcProviderConfig) {
  if (
    discovery.issuer !== provider.issuerUrl ||
    !isAllowedProviderUrl(discovery.authorization_endpoint, provider) ||
    !isAllowedProviderUrl(discovery.token_endpoint, provider) ||
    (discovery.jwks_uri !== undefined && !isAllowedProviderUrl(discovery.jwks_uri, provider))
  ) {
    throw new AppError('SSO_DISCOVERY_INVALID', 'error.SSO_DISCOVERY_INVALID', 502);
  }
}

function getDiscoveryCacheKey(provider: OidcProviderConfig) {
  return `sso:discovery:${provider.id}:${provider.issuerUrl}`;
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

function getSsoStateSubject(providerId: string, nonce: string) {
  return `${providerId}:${nonce}`;
}

function getSsoBindTokenSubject(identity: Pick<VerifiedSsoIdentity, 'providerId' | 'providerSubject'>) {
  return `${identity.providerId}:${identity.providerSubject}`;
}

async function readJson<T>(response: Response, code: string): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new AppError(code, `error.${code}`, 502, {
      status: response.status,
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError(code, `error.${code}`, 502);
  }
}

function toVerifiedIdentity(provider: NormalizedSsoProviderConfig, claims: SsoClaims): VerifiedSsoIdentity {
  return {
    providerId: provider.id,
    providerName: provider.name,
    providerSubject: claims.providerSubject,
    email: claims.email,
  };
}

function getVerifiedIdentityFromBindToken(bind: Awaited<ReturnType<typeof verifySsoBindToken>>): VerifiedSsoIdentity {
  return {
    providerId: bind.providerId,
    providerName: bind.providerName,
    providerSubject: bind.providerSubject,
    email: bind.email,
  };
}

function getUsername(usernameValue: unknown, emailValue: unknown) {
  const email = getClaimString(emailValue);

  return normalizeUsername(getClaimString(usernameValue) ?? email?.split('@')[0] ?? '');
}

function getDisplayName(nameValue: unknown, usernameValue: unknown, emailValue: unknown) {
  const email = getClaimString(emailValue);

  return (getClaimString(nameValue) ?? getClaimString(usernameValue) ?? email?.split('@')[0] ?? '').slice(0, 64).trim();
}

function getSsoEmail(value: unknown) {
  const email = getClaimString(value);

  if (!email) {
    throw new AppError('SSO_EMAIL_MISSING', 'error.SSO_EMAIL_MISSING', 401);
  }

  const parsed = emailSchema.safeParse(email);

  if (!parsed.success) {
    throw new AppError('SSO_EMAIL_INVALID', 'error.SSO_EMAIL_INVALID', 401);
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

function getProviderSubject(value: unknown) {
  const providerSubject = getClaimString(value);

  if (!providerSubject) {
    throw new AppError('SSO_SUBJECT_MISSING', 'error.SSO_SUBJECT_MISSING', 401);
  }

  return providerSubject;
}

function getClaimString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getMappedValue(value: unknown, field: string) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return field.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, value);
}

function isAllowedProviderUrl(value: unknown, provider: OidcProviderConfig): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);
    const issuer = new URL(provider.issuerUrl);

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
  throw new AppError('AUTH_INVALID_CREDENTIALS', 'error.AUTH_INVALID_CREDENTIALS', 401);
}

function throwInvalidSsoToken(): never {
  throw new AppError('AUTH_INVALID_TOKEN', 'error.AUTH_INVALID_TOKEN', 401);
}
