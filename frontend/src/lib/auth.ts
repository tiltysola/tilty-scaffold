import { ApiError, apiRequest } from './api';
import { appConfig } from './config';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: string;
  tokenType: 'Bearer';
  user: AuthUser;
}

export interface AuthPublicConfig {
  passwordRecoveryEnabled: boolean;
  registrationEmailVerificationRequired: boolean;
}

export interface RegisterInput {
  email: string;
  emailVerificationCode?: string;
  password: string;
  confirmPassword: string;
  username: string;
}

export interface LoginInput {
  email: string;
  password: string;
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

export interface ResetPasswordInput {
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

const sessionStorageKey = 'tilty-scaffold.auth.session';

export async function fetchAuthConfig() {
  return await apiRequest<AuthPublicConfig>('/api/auth/config');
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
  return await apiRequest<EmailVerificationSendResult>('/api/auth/register/email-verification', {
    method: 'POST',
    body: input,
  });
}

export async function sendPasswordResetEmailVerification(input: SendEmailVerificationInput) {
  return await apiRequest<EmailVerificationSendResult>('/api/auth/password-reset/email-verification', {
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
  return await apiRequest<{ reset: true }>('/api/auth/password-reset', {
    method: 'POST',
    body: input,
  });
}

export async function fetchSsoConfig() {
  return await apiRequest<SsoPublicConfig>('/api/auth/sso/config');
}

export function getSsoStartUrl(redirectPath: string) {
  const url = new URL('/api/auth/sso/start', appConfig.apiBaseUrl);

  url.searchParams.set('redirect', redirectPath);

  return url.toString();
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

export async function fetchCurrentUser(accessToken: string) {
  try {
    return await apiRequest<AuthUser>('/api/auth/me', {
      method: 'GET',
      token: accessToken,
    });
  } catch (error) {
    if (isAuthenticationError(error)) {
      clearStoredSession();
    }

    throw error;
  }
}

export async function validateStoredSession() {
  const session = getStoredSession();

  if (!session) {
    return null;
  }

  try {
    const user = await fetchCurrentUser(session.accessToken);
    const validatedSession = {
      ...session,
      user,
    };

    storeSession(validatedSession);

    return validatedSession;
  } catch (error) {
    if (isAuthenticationError(error)) {
      return null;
    }

    return session;
  }
}

export function storeSession(session: AuthSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

export function getStoredSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const value = window.localStorage.getItem(sessionStorageKey);

  if (!value) {
    return null;
  }

  try {
    const session = JSON.parse(value) as unknown;

    if (!isAuthSession(session) || Date.parse(session.expiresAt) <= Date.now()) {
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

  window.localStorage.removeItem(sessionStorageKey);
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Record<string, unknown>;

  return (
    typeof session.accessToken === 'string' &&
    typeof session.expiresAt === 'string' &&
    session.tokenType === 'Bearer' &&
    isAuthUser(session.user)
  );
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as Record<string, unknown>;

  return typeof user.id === 'string' && typeof user.username === 'string' && typeof user.email === 'string';
}

function isAuthenticationError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
