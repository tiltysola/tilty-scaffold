import { isSafeRelativePath } from '@tilty/shared/paths';

import { ApiError, apiRequest, type ApiRequestOptions } from './api';

export const authSessionStorageKey = 'tilty-scaffold.auth.session';
export const authSessionChangedEvent = 'tilty-scaffold.auth.session.changed';
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

let inMemorySession: AuthSession | null = null;

export async function fetchAuthConfig() {
  return apiRequest<AuthPublicConfig>('/api/auth/config');
}

export async function register(input: RegisterInput) {
  const session = await apiRequest<AuthSession>('/api/auth/register', {
    method: 'POST',
    body: input,
  });

  storeSession(session);

  return session;
}

export async function sendRegistrationEmailVerification(input: SendEmailVerificationInput) {
  return apiRequest<EmailVerificationSendResult>('/api/auth/register/email-verification', {
    method: 'POST',
    body: input,
  });
}

export async function sendPasswordResetEmailVerification(input: SendEmailVerificationInput) {
  return apiRequest<EmailVerificationSendResult>('/api/auth/password-reset/email-verification', {
    method: 'POST',
    body: input,
  });
}

export async function sendProfileEmailVerification() {
  return authenticatedApiRequest<EmailVerificationSendResult>('/api/auth/me/email-verification', {
    method: 'POST',
  });
}

export async function sendProfilePhoneVerification(input: SendProfilePhoneVerificationInput) {
  return authenticatedApiRequest<EmailVerificationSendResult>('/api/auth/me/phone-verification', {
    body: input,
    method: 'POST',
  });
}

export async function login(input: LoginInput) {
  const session = await apiRequest<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: input,
  });

  storeSession(session);

  return session;
}

export async function resetPassword(input: ResetPasswordInput) {
  return apiRequest<{ reset: true }>('/api/auth/password-reset', {
    method: 'POST',
    body: input,
  });
}

export async function verifyProfileEmail(input: VerifyProfileEmailInput) {
  const session = getStoredSession();

  if (!session) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  const { result: user, session: refreshedSession } = await runAuthenticatedRequest(() =>
    apiRequest<AuthUser>('/api/auth/me/email-verification/confirm', {
      body: input,
      method: 'POST',
    }),
  );

  storeSession({
    ...(refreshedSession ?? session),
    user,
  });

  return user;
}

export async function verifyProfilePhone(input: VerifyProfilePhoneInput) {
  const session = getStoredSession();

  if (!session) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  const { result: user, session: refreshedSession } = await runAuthenticatedRequest(() =>
    apiRequest<AuthUser>('/api/auth/me/phone-verification/confirm', {
      body: input,
      method: 'POST',
    }),
  );

  storeSession({
    ...(refreshedSession ?? session),
    user,
  });

  return user;
}

export async function refreshSession() {
  const session = await apiRequest<AuthSession>('/api/auth/refresh', {
    method: 'POST',
  });

  storeSession(session);

  return session;
}

export async function fetchSsoConfig() {
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
    method: 'POST',
    body: { token },
  });

  storeSession(session);

  return session;
}

export async function createSsoAccount(input: CreateSsoAccountInput) {
  const session = await apiRequest<AuthSession>('/api/auth/sso/account', {
    method: 'POST',
    body: input,
  });

  storeSession(session);

  return session;
}

export async function bindSsoAccount(input: BindSsoAccountInput) {
  const session = await apiRequest<AuthSession>('/api/auth/sso/bind', {
    method: 'POST',
    body: input,
  });

  storeSession(session);

  return session;
}

export async function fetchSsoIdentities() {
  return authenticatedApiRequest<{ identities: SsoIdentityPublic[] }>('/api/auth/sso/identities', {
    method: 'GET',
  });
}

export async function fetchCurrentUser() {
  return authenticatedApiRequest<AuthUser>('/api/auth/me', {
    method: 'GET',
  });
}

export async function updateCurrentUser(input: UpdateCurrentUserInput) {
  const session = getStoredSession();

  if (!session) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  const { result: user, session: refreshedSession } = await runAuthenticatedRequest(() =>
    apiRequest<AuthUser>('/api/auth/me', {
      body: input,
      method: 'PATCH',
    }),
  );

  storeSession({
    ...(refreshedSession ?? session),
    user,
  });

  return user;
}

export async function authenticatedApiRequest<T>(path: string, options?: ApiRequestOptions) {
  const { result } = await runAuthenticatedRequest(() => apiRequest<T>(path, options));

  return result;
}

export async function uploadAvatar(file: File) {
  const session = getStoredSession();

  if (!session) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  }

  const form = new FormData();

  form.append('avatar', file);

  const { result: user, session: refreshedSession } = await runAuthenticatedRequest(() =>
    apiRequest<AuthUser>('/api/auth/avatar', {
      body: form,
      method: 'POST',
    }),
  );

  storeSession({
    ...(refreshedSession ?? session),
    user,
  });

  return user;
}

export async function logout() {
  await apiRequest<{ signedOut: true }>('/api/auth/logout', {
    method: 'POST',
  });
  clearStoredSession();
}

export function getUserHandle(username?: string) {
  const trimmedUsername = username?.trim();

  return trimmedUsername ? `@${trimmedUsername}` : '@unknown-user';
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

export async function validateStoredSession() {
  const session = getStoredSession();

  if (!session) {
    return null;
  }

  try {
    const user = await fetchCurrentUser();
    const currentSession = getStoredSession() ?? session;
    const validatedSession = {
      ...currentSession,
      user,
    };

    storeSession(validatedSession);

    return validatedSession;
  } catch {
    clearStoredSession();
    return null;
  }
}

export function storeSession(session: AuthSession) {
  inMemorySession = session;

  if (typeof window === 'undefined') {
    return;
  }

  writePersistedSession(session);
  emitStoredSessionChanged();
}

export function getStoredSession() {
  if (typeof window === 'undefined') {
    return inMemorySession && isAuthSession(inMemorySession) ? inMemorySession : null;
  }

  const persistedSession = readPersistedSession();

  if (!persistedSession) {
    inMemorySession = null;
    return null;
  }

  if (
    inMemorySession &&
    isAuthSession(inMemorySession) &&
    hasMatchingSessionMetadata(inMemorySession, persistedSession)
  ) {
    return inMemorySession;
  }

  inMemorySession = null;

  return createUnvalidatedSession(persistedSession);
}

export function clearStoredSession() {
  inMemorySession = null;

  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(authSessionStorageKey);
  emitStoredSessionChanged();
}

function readPersistedSession() {
  const value = window.localStorage.getItem(authSessionStorageKey);

  if (!value) {
    return null;
  }

  try {
    const source = JSON.parse(value) as unknown;
    const metadata = parsePersistedSession(source);

    if (!metadata) {
      clearStoredSession();
      return null;
    }

    return metadata;
  } catch {
    clearStoredSession();
    return null;
  }
}

function writePersistedSession(session: PersistedAuthSession) {
  window.localStorage.setItem(authSessionStorageKey, JSON.stringify(toPersistedSession(session)));
}

function parsePersistedSession(value: unknown): PersistedAuthSession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const session = value as Record<string, unknown>;
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

function createUnvalidatedSession(session: PersistedAuthSession): AuthSession {
  return {
    ...session,
    user: {
      username: '',
      displayName: '',
      email: '',
      emailVerified: false,
      phoneVerified: false,
      roles: [],
      permissions: [],
    },
  };
}

function hasMatchingSessionMetadata(session: PersistedAuthSession, persistedSession: PersistedAuthSession) {
  return (
    session.accessTokenExpiresAt === persistedSession.accessTokenExpiresAt &&
    session.refreshTokenExpiresAt === persistedSession.refreshTokenExpiresAt
  );
}

function emitStoredSessionChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof Event === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(authSessionChangedEvent));
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
    typeof user.username === 'string' &&
    typeof user.displayName === 'string' &&
    typeof user.email === 'string' &&
    typeof user.emailVerified === 'boolean' &&
    (user.phoneNumber === undefined || typeof user.phoneNumber === 'string') &&
    typeof user.phoneVerified === 'boolean' &&
    isStringArray(user.roles) &&
    isStringArray(user.permissions) &&
    (user.avatarUrl === undefined || typeof user.avatarUrl === 'string')
  );
}

async function runAuthenticatedRequest<T>(request: () => Promise<T>) {
  try {
    return {
      result: await request(),
      session: undefined,
    };
  } catch (error) {
    if (!isRefreshableAuthenticationError(error)) {
      if (isAuthenticationError(error)) {
        clearStoredSession();
      }

      throw error;
    }
  }

  try {
    const session = await refreshSession();

    return {
      result: await request(),
      session,
    };
  } catch (refreshError) {
    if (isAuthenticationError(refreshError)) {
      clearStoredSession();
    }

    throw refreshError;
  }
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
