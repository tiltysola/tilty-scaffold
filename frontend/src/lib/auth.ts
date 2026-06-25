import { isSafeRelativePath } from '@tilty/shared/paths';

import { ApiError, apiRequest, type ApiRequestOptions } from './api';

const authSessionStorageKey = 'tilty-scaffold.auth.session';

const accessTokenRefreshSkewMs = 30_000;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface AuthUser {
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneVerified: boolean;
  avatarUrl?: string;
  roles: string[];
  permissions: string[];
}

export interface AuthSession {
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
}

interface PersistedAuthSession {
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

const persistedAuthSessionKeys = new Set(['accessTokenExpiresAt', 'refreshTokenExpiresAt']);

export type AuthStatus = 'anonymous' | 'authenticated' | 'restoring';

export interface AuthSnapshot {
  isRefreshing: boolean;
  session: AuthSession | null;
  status: AuthStatus;
}

export type PhoneCountryCode = '+86' | '+852' | '+853';

export interface AuthPublicConfig {
  passwordRecoveryEnabled: boolean;
  phoneCountryCodes: PhoneCountryCode[];
  profileEmailVerificationEnabled: boolean;
  registrationEmailVerificationRequired: boolean;
}

interface RegisterInput {
  username: string;
  displayName: string;
  email: string;
  emailVerificationCode?: string;
  password: string;
  confirmPassword: string;
}

interface LoginInput {
  identifier: string;
  password: string;
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

interface ResetPasswordInput {
  email: string;
  emailVerificationCode: string;
  password: string;
  confirmPassword: string;
}

interface VerifyProfileEmailInput {
  emailVerificationCode: string;
}

interface SendProfilePhoneVerificationInput {
  phoneNumber: string;
}

interface VerifyProfilePhoneInput {
  phoneNumber: string;
  phoneVerificationCode: string;
}

interface UpdateCurrentUserInput {
  displayName: string;
  phoneNumber?: string | null;
}

export interface SsoPublicConfig {
  enabled: boolean;
  loginEnabled: boolean;
  providers: SsoPublicProvider[];
}

export interface SsoPublicProvider {
  id: string;
  name: string;
  iconUrl?: string;
  protocol: 'oauth2' | 'oidc';
  loginEnabled: boolean;
  bindingEnabled: boolean;
}

export interface SsoIdentityPublic {
  providerId: string;
  providerName: string;
  providerSubject: string;
  email: string;
  createdAt: string;
  iconUrl?: string;
}

export interface SendEmailVerificationInput {
  email: string;
}

export interface EmailVerificationSendResult {
  cooldownSeconds: number;
  expiresInSeconds: number;
}

type AuthListener = () => void;

let snapshot: AuthSnapshot = {
  isRefreshing: false,
  session: null,
  status: typeof window === 'undefined' ? 'anonymous' : 'restoring',
};
let restorePromise: Promise<AuthSession | null> | null = null;
let refreshPromise: Promise<AuthSession> | null = null;

const listeners = new Set<AuthListener>();

export const authStore = {
  clear: clearStoredSession,
  getSnapshot,
  refresh: refreshAuthSession,
  restore: restoreAuthSession,
  subscribe,
};

export function fetchAuthConfig() {
  return apiRequest<AuthPublicConfig>('/api/auth/config');
}

export async function register(input: RegisterInput) {
  const session = await apiRequest<AuthSession>('/api/auth/register', {
    body: input,
    method: 'POST',
  });

  storeSession(session);

  return session;
}

export async function login(input: LoginInput) {
  const session = await apiRequest<AuthSession>('/api/auth/login', {
    body: input,
    method: 'POST',
  });

  storeSession(session);

  return session;
}

export async function logout() {
  await apiRequest<{ signedOut: true }>('/api/auth/logout', {
    method: 'POST',
  });
  clearStoredSession();
}

export function sendRegistrationEmailVerification(input: SendEmailVerificationInput) {
  return apiRequest<EmailVerificationSendResult>('/api/auth/register/email-verification', {
    body: input,
    method: 'POST',
  });
}

export function sendPasswordResetEmailVerification(input: SendEmailVerificationInput) {
  return apiRequest<EmailVerificationSendResult>('/api/auth/password-reset/email-verification', {
    body: input,
    method: 'POST',
  });
}

export function resetPassword(input: ResetPasswordInput) {
  return apiRequest<{ reset: true }>('/api/auth/password-reset', {
    body: input,
    method: 'POST',
  });
}

export async function authenticatedApiRequest<T>(path: string, options?: ApiRequestOptions) {
  await ensureAuthenticatedSession();

  try {
    return await apiRequest<T>(path, options);
  } catch (error) {
    if (!isRefreshableAuthenticationError(error)) {
      if (isAuthenticationError(error)) {
        clearStoredSession();
      }

      throw error;
    }
  }

  await refreshAuthSession();

  return apiRequest<T>(path, options);
}

export function fetchCurrentUser() {
  return authenticatedApiRequest<AuthUser>('/api/auth/me', {
    method: 'GET',
  });
}

export async function updateCurrentUser(input: UpdateCurrentUserInput) {
  const user = await authenticatedApiRequest<AuthUser>('/api/auth/me', {
    body: input,
    method: 'PATCH',
  });

  replaceStoredUser(user);

  return user;
}

export async function uploadAvatar(file: File) {
  const form = new FormData();

  form.append('avatar', file);

  const user = await authenticatedApiRequest<AuthUser>('/api/auth/avatar', {
    body: form,
    method: 'POST',
  });

  replaceStoredUser(user);

  return user;
}

export function sendProfileEmailVerification() {
  return authenticatedApiRequest<EmailVerificationSendResult>('/api/auth/me/email-verification', {
    method: 'POST',
  });
}

export async function verifyProfileEmail(input: VerifyProfileEmailInput) {
  const user = await authenticatedApiRequest<AuthUser>('/api/auth/me/email-verification/confirm', {
    body: input,
    method: 'POST',
  });

  replaceStoredUser(user);

  return user;
}

export function sendProfilePhoneVerification(input: SendProfilePhoneVerificationInput) {
  return authenticatedApiRequest<EmailVerificationSendResult>('/api/auth/me/phone-verification', {
    body: input,
    method: 'POST',
  });
}

export async function verifyProfilePhone(input: VerifyProfilePhoneInput) {
  const user = await authenticatedApiRequest<AuthUser>('/api/auth/me/phone-verification/confirm', {
    body: input,
    method: 'POST',
  });

  replaceStoredUser(user);

  return user;
}

export function fetchSsoConfig() {
  return apiRequest<SsoPublicConfig>('/api/auth/sso/config');
}

export function getSsoStartUrl(redirectPath: string, providerId?: string) {
  const params = new URLSearchParams({
    redirect: redirectPath,
  });

  if (providerId) {
    params.set('providerId', providerId);
  }

  return `/api/auth/sso/start?${params.toString()}`;
}

export function getSsoBindStartUrl(providerId: string, redirectPath: string) {
  const params = new URLSearchParams({
    providerId,
    redirect: redirectPath,
  });

  return `/api/auth/sso/bind/start?${params.toString()}`;
}

export function getSsoCallbackParams(hash: string) {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;

  return new URLSearchParams(fragment);
}

export async function completeSsoLogin(token: string) {
  const session = await apiRequest<AuthSession>('/api/auth/sso/session', {
    body: { token },
    method: 'POST',
  });

  storeSession(session);

  return session;
}

export async function createSsoAccount(input: CreateSsoAccountInput) {
  const session = await apiRequest<AuthSession>('/api/auth/sso/account', {
    body: input,
    method: 'POST',
  });

  storeSession(session);

  return session;
}

export async function bindSsoAccount(input: BindSsoAccountInput) {
  const session = await apiRequest<AuthSession>('/api/auth/sso/bind', {
    body: input,
    method: 'POST',
  });

  storeSession(session);

  return session;
}

export function fetchSsoIdentities() {
  return authenticatedApiRequest<{ identities: SsoIdentityPublic[] }>('/api/auth/sso/identities', {
    method: 'GET',
  });
}

export function getAccessTokenRefreshDelayMs(session: Pick<AuthSession, 'accessTokenExpiresAt'>) {
  const accessTokenExpiresAt = parseTimestamp(session.accessTokenExpiresAt);

  if (accessTokenExpiresAt === null) {
    return 0;
  }

  return Math.max(accessTokenExpiresAt - accessTokenRefreshSkewMs - Date.now(), 0);
}

export function getUserHandle(username?: string) {
  const trimmedUsername = username?.trim();

  return trimmedUsername ? `@${trimmedUsername}` : '';
}

export function getUserInitials(name?: string) {
  return (
    name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U'
  );
}

export function resolveAssetUrl(url?: string) {
  if (!url) {
    return undefined;
  }

  if (isAllowedAbsoluteAssetUrl(url)) {
    return url;
  }

  if (isSafeRelativePath(url)) {
    return url;
  }

  return undefined;
}

function getSnapshot() {
  return snapshot;
}

function subscribe(listener: AuthListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

async function restoreAuthSession() {
  if (restorePromise) {
    return restorePromise;
  }

  const currentSession = getStoredSession();

  setSnapshot({
    isRefreshing: getSnapshot().isRefreshing,
    session: currentSession,
    status: 'restoring',
  });

  restorePromise = restoreAuthSessionOnce().finally(() => {
    restorePromise = null;
  });

  return restorePromise;
}

function refreshAuthSession() {
  if (refreshPromise) {
    return refreshPromise;
  }

  const current = getSnapshot();

  setSnapshot({
    isRefreshing: true,
    session: current.session,
    status: current.session ? 'authenticated' : 'restoring',
  });

  refreshPromise = apiRequest<AuthSession>('/api/auth/refresh', {
    method: 'POST',
  })
    .then((session) => {
      storeSession(session);

      return session;
    })
    .catch((error: unknown) => {
      if (isAuthenticationError(error)) {
        clearStoredSession();
      } else {
        setSnapshot({
          ...getSnapshot(),
          isRefreshing: false,
        });
      }

      throw error;
    })
    .finally(() => {
      refreshPromise = null;

      if (getSnapshot().isRefreshing) {
        setSnapshot({
          ...getSnapshot(),
          isRefreshing: false,
        });
      }
    });

  return refreshPromise;
}

async function ensureAuthenticatedSession() {
  const currentSession = getStoredSession();

  if (currentSession) {
    if (shouldRefreshAccessToken(currentSession)) {
      return refreshAuthSession();
    }

    return currentSession;
  }

  const restoredSession = await restoreAuthSession();

  if (restoredSession) {
    return restoredSession;
  }

  throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
}

function getStoredSession() {
  const current = getSnapshot();
  const persistedSession = readPersistedSession();

  if (!persistedSession) {
    if (current.session) {
      setSnapshot({
        isRefreshing: false,
        session: null,
        status: 'anonymous',
      });
    }

    return null;
  }

  if (
    current.status === 'authenticated' &&
    current.session &&
    isAuthSession(current.session) &&
    hasMatchingSessionMetadata(current.session, persistedSession)
  ) {
    return current.session;
  }

  return null;
}

function storeSession(session: AuthSession) {
  if (!isAuthSession(session)) {
    clearStoredSession();
    return;
  }

  writePersistedSession(session);
  setSnapshot({
    isRefreshing: false,
    session,
    status: 'authenticated',
  });
}

function clearStoredSession() {
  clearPersistedSession();
  setSnapshot({
    isRefreshing: false,
    session: null,
    status: 'anonymous',
  });
}

async function restoreAuthSessionOnce() {
  const metadata = readPersistedSession();

  if (metadata && !shouldRefreshAccessToken(metadata)) {
    try {
      const user = await apiRequest<AuthUser>('/api/auth/me', {
        method: 'GET',
      });
      const session = {
        ...metadata,
        user,
      };

      storeSession(session);

      return session;
    } catch (error) {
      if (!isAuthenticationError(error)) {
        clearStoredSession();
        return null;
      }
    }
  }

  try {
    return await refreshAuthSession();
  } catch {
    clearStoredSession();
    return null;
  }
}

function replaceStoredUser(user: AuthUser) {
  const session = getStoredSession();

  if (!session) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  storeSession({
    ...session,
    user,
  });
}

function setSnapshot(nextSnapshot: AuthSnapshot) {
  snapshot = nextSnapshot;
  emitSnapshotChanged();
}

function emitSnapshotChanged() {
  for (const listener of listeners) {
    listener();
  }
}

function isAllowedAbsoluteAssetUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol === 'https:') {
      return !url.username && !url.password;
    }

    return url.protocol === 'http:' && loopbackHosts.has(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function readPersistedSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(authSessionStorageKey);

  if (!value) {
    return null;
  }

  try {
    const metadata = parsePersistedSession(JSON.parse(value) as unknown);

    if (!metadata) {
      clearPersistedSession();
      return null;
    }

    return metadata;
  } catch {
    clearPersistedSession();
    return null;
  }
}

function writePersistedSession(session: PersistedAuthSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(authSessionStorageKey, JSON.stringify(toPersistedSession(session)));
}

function clearPersistedSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(authSessionStorageKey);
}

function parsePersistedSession(value: unknown): PersistedAuthSession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const session = value as Record<string, unknown>;
  const sessionKeys = Object.keys(session);

  if (
    sessionKeys.length !== persistedAuthSessionKeys.size ||
    sessionKeys.some((key) => !persistedAuthSessionKeys.has(key))
  ) {
    return null;
  }

  const accessTokenExpiresAt = parseTimestamp(session.accessTokenExpiresAt);
  const refreshTokenExpiresAt = parseTimestamp(session.refreshTokenExpiresAt);

  if (accessTokenExpiresAt === null || refreshTokenExpiresAt === null || refreshTokenExpiresAt <= Date.now()) {
    return null;
  }

  return {
    accessTokenExpiresAt: session.accessTokenExpiresAt as string,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt as string,
  };
}

function toPersistedSession(session: PersistedAuthSession): PersistedAuthSession {
  return {
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

function hasMatchingSessionMetadata(session: PersistedAuthSession, persistedSession: PersistedAuthSession) {
  return (
    session.accessTokenExpiresAt === persistedSession.accessTokenExpiresAt &&
    session.refreshTokenExpiresAt === persistedSession.refreshTokenExpiresAt
  );
}

function shouldRefreshAccessToken(session: Pick<AuthSession, 'accessTokenExpiresAt'>) {
  return getAccessTokenRefreshDelayMs(session) === 0;
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Record<string, unknown>;
  const accessTokenExpiresAt = parseTimestamp(session.accessTokenExpiresAt);
  const refreshTokenExpiresAt = parseTimestamp(session.refreshTokenExpiresAt);

  return (
    accessTokenExpiresAt !== null &&
    refreshTokenExpiresAt !== null &&
    refreshTokenExpiresAt > Date.now() &&
    isAuthUser(session.user)
  );
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as Record<string, unknown>;

  return (
    isNonEmptyString(user.username) &&
    isNonEmptyString(user.displayName) &&
    isNonEmptyString(user.email) &&
    typeof user.emailVerified === 'boolean' &&
    (user.phoneNumber === undefined || typeof user.phoneNumber === 'string') &&
    typeof user.phoneVerified === 'boolean' &&
    isStringArray(user.roles) &&
    isStringArray(user.permissions) &&
    (user.avatarUrl === undefined || typeof user.avatarUrl === 'string')
  );
}

function isAuthenticationError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function isRefreshableAuthenticationError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    (error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_TOKEN_EXPIRED')
  );
}

function parseTimestamp(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
