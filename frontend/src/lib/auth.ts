import { isSafeRelativePath } from '@tilty/shared/paths';

import { ApiError, apiRequest, type ApiRequestOptions } from './api';
import { appConfig } from './config';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  avatarUrl?: string;
}

export interface AuthSession {
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
}

interface AuthPublicConfig {
  passwordRecoveryEnabled: boolean;
  registrationEmailVerificationRequired: boolean;
}

interface RegisterInput {
  email: string;
  emailVerificationCode?: string;
  password: string;
  confirmPassword: string;
  username: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface BindSsoAccountInput {
  email: string;
  password: string;
  token: string;
}

interface CreateSsoAccountInput {
  confirmPassword: string;
  password: string;
  token: string;
  username: string;
}

interface ResetPasswordInput {
  email: string;
  emailVerificationCode: string;
  password: string;
  confirmPassword: string;
}

export interface SsoPublicConfig {
  enabled: boolean;
}

export interface SendEmailVerificationInput {
  email: string;
}

export interface EmailVerificationSendResult {
  cooldownSeconds: number;
  expiresInSeconds: number;
}

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

export function getSsoStartUrl(redirectPath: string) {
  const url = new URL('/api/auth/sso/start', appConfig.apiBaseUrl);

  url.searchParams.set('redirect', redirectPath);

  return url.toString();
}

export function getSsoCallbackParams(search: string, hash: string) {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const fragmentParams = new URLSearchParams(fragment);

  if (fragmentParams.has('sso_token') || fragmentParams.has('sso_bind_token')) {
    return fragmentParams;
  }

  return new URLSearchParams(search);
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

export async function fetchCurrentUser() {
  return authenticatedApiRequest<AuthUser>('/api/auth/me', {
    method: 'GET',
  });
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

export function resolveAssetUrl(url?: string) {
  if (!url) {
    return undefined;
  }

  if (isAllowedAbsoluteAssetUrl(url)) {
    return url;
  }

  if (isSafeRelativePath(url)) {
    return new URL(url, appConfig.apiBaseUrl).toString();
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
    const validatedSession = {
      ...session,
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
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(appConfig.authSessionStorageKey, JSON.stringify(session));
}

export function getStoredSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(appConfig.authSessionStorageKey);

  if (!value) {
    return null;
  }

  try {
    const session = JSON.parse(value) as unknown;

    if (!isAuthSession(session)) {
      clearStoredSession();
      return null;
    }

    return session;
  } catch {
    clearStoredSession();
    return null;
  }
}

export function clearStoredSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(appConfig.authSessionStorageKey);
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
    typeof user.id === 'string' &&
    typeof user.username === 'string' &&
    typeof user.email === 'string' &&
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
