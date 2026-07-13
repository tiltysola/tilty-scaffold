import { formatStaticMessage } from '@/i18n';
import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import {
  type AuthMfaMethodValue,
  authMfaMethodValues,
  type AuthSelectableVerificationPurposeValue,
  type AuthSessionDeviceTypeValue,
  type AuthVerificationCodeMethodValue,
  AuthVerificationMethod,
  type AuthVerificationMethodValue,
  type AuthVerificationPurposeValue,
  type ProfileImageFieldName,
} from '@tilty/shared/auth';
import { isSafeRelativePath } from '@tilty/shared/paths';
import { type SetupSmsPhoneCountryCodeValue, type SetupSsoProtocolValue } from '@tilty/shared/setup';

import { ApiError, apiRequest, type ApiRequestOptions } from './api';

export interface AuthUser {
  username: string;
  displayName: string;
  gender?: string;
  birthday?: string;
  bio?: string;
  location?: string;
  websiteUrl?: string;
  email: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneVerified: boolean;
  totpEnabled: boolean;
  mfaAllowedMethods: MfaMethod[];
  mfaRequiredForSso: boolean;
  avatarUrl?: string;
  profileBannerUrl?: string;
  profileBackgroundUrl?: string;
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

export type AuthStatus = 'anonymous' | 'authenticated' | 'restoring';

export interface AuthSnapshot {
  isRefreshing: boolean;
  session: AuthSession | null;
  status: AuthStatus;
}

export type PhoneCountryCode = SetupSmsPhoneCountryCodeValue;
type CurrentUserImagePath =
  | '/api/users/me/avatar'
  | '/api/users/me/profile-banner'
  | '/api/users/me/profile-background';

export interface AuthPublicConfig {
  fileUploadMaxBytes: number;
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

export type MfaMethod = AuthMfaMethodValue;
export type VerificationMethodName = AuthVerificationMethodValue;
export type VerificationPurpose = AuthVerificationPurposeValue;

export interface VerificationMethod {
  method: VerificationMethodName;
  maskedTarget?: string;
}

export interface VerificationRequired {
  requiresVerification: true;
  verificationToken: string;
  purpose: VerificationPurpose;
  defaultMethod: VerificationMethodName;
  methods: VerificationMethod[];
  expiresAt: string;
  remainingAttempts: number;
}

export interface VerificationSatisfied {
  verified: true;
  sudoExpiresAt: string;
}

export type VerificationChallengeResult = VerificationRequired | VerificationSatisfied;

export type LoginResult = AuthSession | VerificationRequired;

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

interface ChangePasswordInput {
  currentPassword: string;
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
  gender?: string | null;
  birthday?: string | null;
  bio?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  phoneNumber?: string | null;
}

interface TotpSetupEnableInput {
  setupToken: string;
  code: string;
}

interface TotpVerifyInput {
  verificationToken: string;
  method: VerificationMethodName;
  code?: string;
  password?: string;
  recoveryCode?: string;
  passkeyResponse?: AuthenticationResponseJSON;
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
  protocol: SetupSsoProtocolValue;
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

export interface VerificationCodeSendResult {
  cooldownSeconds: number;
  expiresInSeconds: number;
  maskedTarget?: string;
}

export interface TotpStatus {
  enabled: boolean;
  recoveryCodesRemaining: number;
}

export interface TotpSetup {
  setupToken: string;
  secret: string;
  otpauthUrl: string;
  expiresAt: string;
}

export interface TotpEnableResult extends TotpStatus {
  recoveryCodes: string[];
}

export interface TotpRecoveryCodesResult {
  recoveryCodes: string[];
}

export interface AuthDeviceSession {
  id: string;
  deviceName: string;
  deviceType: AuthSessionDeviceTypeValue;
  browser: string;
  os: string;
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface MfaSettings {
  availableMethods: MfaMethod[];
  defaultMethod?: MfaMethod;
  effectiveMethods: MfaMethod[];
  mfaRequiredForSso: boolean;
  passkeyCount: number;
  twoStepCanDisable: boolean;
  twoStepCanEnable: boolean;
  twoStepEnabled: boolean;
}

export interface PasskeySummary {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  lastUsedAt?: string;
  createdAt: string;
}

export interface PasskeyRegistrationOptionsResult {
  registrationToken: string;
  options: PublicKeyCredentialCreationOptionsJSON;
  expiresAt: string;
}

type AuthListener = () => void;

interface AuthStoreRuntime {
  listeners: Set<AuthListener>;
  refreshPromise: Promise<AuthSession> | null;
  restorePromise: Promise<AuthSession | null> | null;
  snapshot: AuthSnapshot;
  storageAvailable: boolean;
}

interface AuthStoreGlobal {
  __tiltyScaffoldAuthStoreRuntime__?: AuthStoreRuntime;
}

const authSessionStorageKey = 'tilty-scaffold.auth.session';
const accessTokenRefreshSkewMs = 30_000;
const authMfaMethodSet = new Set<string>(authMfaMethodValues);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const persistedAuthSessionKeys = new Set(['accessTokenExpiresAt', 'refreshTokenExpiresAt']);

const authStoreRuntime = getAuthStoreRuntime();

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
  const result = await apiRequest<LoginResult>('/api/auth/login', {
    body: input,
    method: 'POST',
  });

  if (!isVerificationRequired(result)) {
    storeSession(result);
  }

  return result;
}

export async function logout() {
  await apiRequest<{ signedOut: true }>('/api/auth/logout', {
    method: 'POST',
  });
  clearStoredSession();
}

export function sendRegistrationEmailVerification(input: SendEmailVerificationInput) {
  return apiRequest<VerificationCodeSendResult>('/api/auth/register/email-verification', {
    body: input,
    method: 'POST',
  });
}

export function sendPasswordResetEmailVerification(input: SendEmailVerificationInput) {
  return apiRequest<VerificationCodeSendResult>('/api/auth/password-reset/email-verification', {
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

export function changePassword(input: ChangePasswordInput) {
  return authenticatedApiRequest<{ changed: true }>('/api/auth/password', {
    body: input,
    method: 'PATCH',
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
  return authenticatedApiRequest<AuthUser>('/api/users/me', {
    method: 'GET',
  });
}

export async function refreshCurrentUser() {
  const user = await fetchCurrentUser();

  replaceStoredUser(user);

  return user;
}

export function updateCurrentUser(input: UpdateCurrentUserInput) {
  return authenticatedUserRequest('/api/users/me', {
    body: input,
    method: 'PATCH',
  });
}

export function uploadAvatar(file: File) {
  return uploadCurrentUserImage('/api/users/me/avatar', 'avatar', file);
}

export function deleteAvatar() {
  return authenticatedUserRequest('/api/users/me/avatar', {
    method: 'DELETE',
  });
}

export function uploadProfileBanner(file: File) {
  return uploadCurrentUserImage('/api/users/me/profile-banner', 'profileBanner', file);
}

export function deleteProfileBanner() {
  return authenticatedUserRequest('/api/users/me/profile-banner', {
    method: 'DELETE',
  });
}

export function uploadProfileBackground(file: File) {
  return uploadCurrentUserImage('/api/users/me/profile-background', 'profileBackground', file);
}

export function deleteProfileBackground() {
  return authenticatedUserRequest('/api/users/me/profile-background', {
    method: 'DELETE',
  });
}

function uploadCurrentUserImage(path: CurrentUserImagePath, fieldName: ProfileImageFieldName, file: File) {
  const form = new FormData();

  form.append(fieldName, file);

  return authenticatedUserRequest(path, {
    body: form,
    method: 'POST',
  });
}

export function sendProfileEmailVerification() {
  return authenticatedApiRequest<VerificationCodeSendResult>('/api/users/me/email-verification', {
    method: 'POST',
  });
}

export function verifyProfileEmail(input: VerifyProfileEmailInput) {
  return authenticatedUserRequest('/api/users/me/email-verification/confirm', {
    body: input,
    method: 'POST',
  });
}

export function sendProfilePhoneVerification(input: SendProfilePhoneVerificationInput) {
  return authenticatedApiRequest<VerificationCodeSendResult>('/api/users/me/phone-verification', {
    body: input,
    method: 'POST',
  });
}

export function verifyProfilePhone(input: VerifyProfilePhoneInput) {
  return authenticatedUserRequest('/api/users/me/phone-verification/confirm', {
    body: input,
    method: 'POST',
  });
}

async function authenticatedUserRequest(path: string, options: ApiRequestOptions) {
  const user = await authenticatedApiRequest<AuthUser>(path, options);

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
  const result = await apiRequest<LoginResult>('/api/auth/sso/bind', {
    body: input,
    method: 'POST',
  });

  if (isAuthSession(result)) {
    storeSession(result);
  }

  return result;
}

export function fetchSsoIdentities() {
  return authenticatedApiRequest<{ identities: SsoIdentityPublic[] }>('/api/auth/sso/identities', {
    method: 'GET',
  });
}

export function fetchTotpStatus() {
  return authenticatedApiRequest<TotpStatus>('/api/auth/totp', {
    method: 'GET',
  });
}

export function createTotpSetup() {
  return authenticatedApiRequest<TotpSetup>('/api/auth/totp/setup', {
    method: 'POST',
  });
}

export function enableTotp(input: TotpSetupEnableInput) {
  return authenticatedApiRequest<TotpEnableResult>('/api/auth/totp/enable', {
    body: input,
    method: 'POST',
  });
}

export function fetchMfaSettings() {
  return authenticatedApiRequest<MfaSettings>('/api/auth/mfa', {
    method: 'GET',
  });
}

export function updateMfaSettings(input: { enabled?: boolean; requiredForSso?: boolean }) {
  return authenticatedApiRequest<MfaSettings>('/api/auth/mfa', {
    body: input,
    method: 'PATCH',
  });
}

export function createVerificationChallenge(purpose: AuthSelectableVerificationPurposeValue) {
  return authenticatedApiRequest<VerificationChallengeResult>('/api/auth/verification/challenges', {
    body: { purpose },
    method: 'POST',
  });
}

export function sendVerificationCode(input: { method: AuthVerificationCodeMethodValue; verificationToken: string }) {
  return apiRequest<VerificationCodeSendResult>('/api/auth/verification/code', {
    body: input,
    method: 'POST',
  });
}

export function createVerificationPasskeyOptions(verificationToken: string) {
  return apiRequest<PublicKeyCredentialRequestOptionsJSON>('/api/auth/verification/passkey/options', {
    body: { verificationToken },
    method: 'POST',
  });
}

export async function verifyAuthenticationChallenge(input: TotpVerifyInput) {
  const result = await apiRequest<AuthSession | { verified: true; sudoExpiresAt?: string }>(
    '/api/auth/verification/confirm',
    {
      body: input,
      method: 'POST',
    },
  );

  if (isAuthSession(result)) {
    storeSession(result);
  }

  return result;
}

export async function verifyWithPasskey(verificationToken: string) {
  const options = await createVerificationPasskeyOptions(verificationToken);
  const passkeyResponse = await startAuthentication({ optionsJSON: options });

  return verifyAuthenticationChallenge({
    verificationToken,
    method: AuthVerificationMethod.Passkey,
    passkeyResponse,
  });
}

export function fetchPasskeys() {
  return authenticatedApiRequest<{ passkeys: PasskeySummary[] }>('/api/auth/passkeys', {
    method: 'GET',
  });
}

export function createPasskeyRegistrationOptions() {
  return authenticatedApiRequest<PasskeyRegistrationOptionsResult>('/api/auth/passkeys/registration-options', {
    method: 'POST',
  });
}

export async function completePasskeyRegistration(name: string, result: PasskeyRegistrationOptionsResult) {
  const response: RegistrationResponseJSON = await startRegistration({ optionsJSON: result.options });

  return authenticatedApiRequest<PasskeySummary>('/api/auth/passkeys', {
    body: {
      name,
      registrationToken: result.registrationToken,
      response,
    },
    method: 'POST',
  });
}

export function deletePasskey(passkeyId: string) {
  return authenticatedApiRequest<{ deleted: true }>(`/api/auth/passkeys/${passkeyId}`, {
    method: 'DELETE',
  });
}

export function disableTotp() {
  return authenticatedApiRequest<TotpStatus>('/api/auth/totp/disable', {
    method: 'POST',
  });
}

export function regenerateTotpRecoveryCodes() {
  return authenticatedApiRequest<TotpRecoveryCodesResult>('/api/auth/totp/recovery-codes', {
    method: 'POST',
  });
}

export function fetchAuthDeviceSessions() {
  return authenticatedApiRequest<{ sessions: AuthDeviceSession[] }>('/api/auth/devices', {
    method: 'GET',
  });
}

export function revokeAuthDeviceSession(sessionId: string) {
  return authenticatedApiRequest<{ revoked: true }>(`/api/auth/devices/${sessionId}`, {
    method: 'DELETE',
  });
}

export function revokeOtherAuthDeviceSessions() {
  return authenticatedApiRequest<{ revoked: true }>('/api/auth/devices/others', {
    method: 'DELETE',
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
  return authStoreRuntime.snapshot;
}

function subscribe(listener: AuthListener) {
  authStoreRuntime.listeners.add(listener);

  return () => {
    authStoreRuntime.listeners.delete(listener);
  };
}

async function restoreAuthSession() {
  if (authStoreRuntime.restorePromise) {
    return authStoreRuntime.restorePromise;
  }

  const currentSession = getStoredSession();

  setSnapshot({
    isRefreshing: getSnapshot().isRefreshing,
    session: currentSession,
    status: 'restoring',
  });

  authStoreRuntime.restorePromise = restoreAuthSessionOnce().finally(() => {
    authStoreRuntime.restorePromise = null;
  });

  return authStoreRuntime.restorePromise;
}

function refreshAuthSession() {
  if (authStoreRuntime.refreshPromise) {
    return authStoreRuntime.refreshPromise;
  }

  const current = getSnapshot();

  setSnapshot({
    isRefreshing: true,
    session: current.session,
    status: current.session ? 'authenticated' : 'restoring',
  });

  authStoreRuntime.refreshPromise = apiRequest<AuthSession>('/api/auth/refresh', {
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
      authStoreRuntime.refreshPromise = null;

      if (getSnapshot().isRefreshing) {
        setSnapshot({
          ...getSnapshot(),
          isRefreshing: false,
        });
      }
    });

  return authStoreRuntime.refreshPromise;
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

  throw new ApiError(401, 'AUTH_REQUIRED', formatStaticMessage('api.error.AUTH_REQUIRED'));
}

function getStoredSession() {
  const current = getSnapshot();
  const persistedSession = readPersistedSession();

  if (!persistedSession) {
    if (
      !authStoreRuntime.storageAvailable &&
      current.status === 'authenticated' &&
      current.session &&
      isAuthSession(current.session)
    ) {
      return current.session;
    }

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
      const user = await apiRequest<AuthUser>('/api/users/me', {
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
    throw new ApiError(401, 'AUTH_REQUIRED', formatStaticMessage('api.error.AUTH_REQUIRED'));
  }

  storeSession({
    ...session,
    user,
  });
}

function setSnapshot(nextSnapshot: AuthSnapshot) {
  authStoreRuntime.snapshot = nextSnapshot;
  emitSnapshotChanged();
}

function emitSnapshotChanged() {
  for (const listener of authStoreRuntime.listeners) {
    listener();
  }
}

function getAuthStoreRuntime() {
  const target = globalThis as typeof globalThis & AuthStoreGlobal;

  target.__tiltyScaffoldAuthStoreRuntime__ ??= {
    listeners: new Set<AuthListener>(),
    refreshPromise: null,
    restorePromise: null,
    snapshot: {
      isRefreshing: false,
      session: null,
      status: typeof window === 'undefined' ? 'anonymous' : 'restoring',
    },
    storageAvailable: true,
  };

  return target.__tiltyScaffoldAuthStoreRuntime__;
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

  let value: string | null;

  try {
    value = window.localStorage.getItem(authSessionStorageKey);
  } catch {
    authStoreRuntime.storageAvailable = false;
    return null;
  }

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

  try {
    window.localStorage.setItem(authSessionStorageKey, JSON.stringify(toPersistedSession(session)));
    authStoreRuntime.storageAvailable = true;
  } catch {
    authStoreRuntime.storageAvailable = false;
    // Browser storage can be unavailable in restricted contexts.
  }
}

function clearPersistedSession() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(authSessionStorageKey);
    authStoreRuntime.storageAvailable = true;
  } catch {
    authStoreRuntime.storageAvailable = false;
    // Browser storage can be unavailable in restricted contexts.
  }
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
    typeof user.totpEnabled === 'boolean' &&
    isMfaMethodArray(user.mfaAllowedMethods) &&
    typeof user.mfaRequiredForSso === 'boolean' &&
    (user.avatarUrl === undefined || typeof user.avatarUrl === 'string') &&
    (user.profileBannerUrl === undefined || typeof user.profileBannerUrl === 'string') &&
    (user.profileBackgroundUrl === undefined || typeof user.profileBackgroundUrl === 'string') &&
    isStringArray(user.roles) &&
    isStringArray(user.permissions)
  );
}

export function isVerificationRequired(value: unknown): value is VerificationRequired {
  return Boolean(
    value && typeof value === 'object' && (value as { requiresVerification?: unknown }).requiresVerification === true,
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

function isMfaMethodArray(value: unknown): value is MfaMethod[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && authMfaMethodSet.has(item));
}
