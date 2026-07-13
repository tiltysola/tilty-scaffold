import { randomUUID } from 'crypto';

import { SystemRole } from '@tilty/shared/access-control';
import {
  AuthMfaMethod,
  type AuthSelectableVerificationPurposeValue,
  type AuthVerificationCodeMethodValue,
  AuthVerificationPurpose as AuthVerificationPurposeContract,
} from '@tilty/shared/auth';
import { defaultLocale, type SupportedLocale } from '@tilty/shared/i18n';

import { AppError } from '../../core/errors';
import { type CacheStore } from '../../infra/cache';
import { type FileStorage } from '../../infra/file-storage';
import { type AccessControlService, type UserAccess } from '../access-control/access-control.service';
import { type UserModel } from '../users/user.model';
import { type UserService } from '../users/user.service';
import {
  createAccessToken,
  createRefreshToken,
  hashPassword,
  verifyAccessToken,
  verifyPassword,
  verifyRefreshToken,
} from './auth.crypto';
import { type EmailVerificationService } from './auth.email';
import { parseMfaAllowedMethods } from './auth.mfa';
import { SmsVerificationService } from './auth.sms';
import { TotpService } from './auth.totp';
import { assertPasswordConfirmation } from './auth.validation';
import { type PasskeyService, type VerifyPasskeyRegistrationInput } from './auth-passkey.service';
import { type AuthSessionRequestContext, AuthSessionService } from './auth-session.service';
import {
  AuthVerificationService,
  isStrongSudoPurpose,
  type StrongSudoPurpose,
  type UpdateMfaSettingsInput,
  type VerifyChallengeInput,
} from './auth-verification.service';

interface RegisterInput {
  username: string;
  displayName: string;
  email: string;
  emailVerificationCode?: string | undefined;
  password: string;
  confirmPassword: string;
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

interface LoginInput {
  identifier: string;
  password: string;
}

interface SendEmailVerificationInput {
  email: string;
}

interface ImageUploadInput {
  content: Buffer;
  contentType: string;
  filename?: string;
}

type ProfileImageDirectory = 'avatars' | 'profile-banners' | 'profile-backgrounds';
type ProfileImageErrorCode = 'AVATAR_FILE_INVALID' | 'PROFILE_BANNER_FILE_INVALID' | 'PROFILE_BACKGROUND_FILE_INVALID';

interface ManagedProfileImageUploadOptions {
  directory: ProfileImageDirectory;
  errorCode: ProfileImageErrorCode;
  getPreviousStorageKey(user: UserModel): string | null;
  update(user: UserModel, url: string, storageKey: string): Promise<UserModel>;
}

interface ManagedProfileImageDeleteOptions {
  clear(user: UserModel): Promise<UserModel>;
  getPreviousStorageKey(user: UserModel): string | null;
}

interface UpdateCurrentUserInput {
  displayName: string;
  gender?: string | null | undefined;
  birthday?: string | null | undefined;
  bio?: string | null | undefined;
  location?: string | null | undefined;
  websiteUrl?: string | null | undefined;
  phoneNumber?: string | null | undefined;
}

interface AuthenticatedUserOptions {
  sessionId?: string | undefined;
}

export interface AuthTokenConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

interface RefreshTokenRecord {
  familyId: string;
  userId: string;
  used: boolean;
}

export const defaultAuthTokenConfig: AuthTokenConfig = {
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
};

const refreshTokenCacheKeyPrefix = 'auth:refresh-token:';
const sessionFamilyRevocationCacheKeyPrefix = 'auth:session-family-revoked:';
export const defaultAuthSessionRequestContext: AuthSessionRequestContext = {
  ipAddress: '127.0.0.1',
  userAgent: 'Service',
};

export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
    private readonly tokenSecret: string,
    private readonly emailVerification: EmailVerificationService,
    private readonly fileStorage: FileStorage | undefined,
    private readonly tokenConfig: AuthTokenConfig,
    private readonly refreshTokenStore: CacheStore,
    private readonly sessionService: AuthSessionService,
    private readonly totpService: TotpService,
    private readonly passkeyService: PasskeyService,
    private readonly verificationService: AuthVerificationService,
    private readonly smsVerification: SmsVerificationService = new SmsVerificationService(),
  ) {}

  getPublicConfig() {
    return {
      passwordRecoveryEnabled: this.emailVerification.isEnabled(),
      phoneCountryCodes: this.smsVerification.getPhoneCountryCodes(),
      profileEmailVerificationEnabled: this.emailVerification.isEnabled(),
      registrationEmailVerificationRequired: this.emailVerification.isEnabled(),
    };
  }

  async sendRegistrationEmailVerification(input: SendEmailVerificationInput, locale?: SupportedLocale) {
    const existing = await this.userService.findByEmail(input.email);

    if (existing) {
      throw new AppError('USER_EMAIL_EXISTS', 'error.USER_EMAIL_EXISTS', 409);
    }

    return this.emailVerification.sendRegistrationCode(input.email, locale);
  }

  async sendPasswordResetEmailVerification(input: SendEmailVerificationInput, locale?: SupportedLocale) {
    const user = await this.userService.findByEmail(input.email);

    if (!isPasswordResetEligibleUser(user)) {
      return this.emailVerification.getDeliveryMetadata();
    }

    return this.emailVerification.sendPasswordResetCode(input.email, locale);
  }

  async sendProfilePhoneVerification(token: string, input: SendProfilePhoneVerificationInput) {
    const { sessionId, user } = await this.authenticate(token);

    return this.sendAuthenticatedProfilePhoneVerification(user, input, { sessionId });
  }

  async sendAuthenticatedProfilePhoneVerification(
    user: UserModel,
    input: SendProfilePhoneVerificationInput,
    options: AuthenticatedUserOptions = {},
  ) {
    await this.requireSessionSudoGrant(user, options.sessionId, AuthVerificationPurposeContract.UpdateContact);

    if (user.phoneNumber === input.phoneNumber && user.phoneVerified) {
      throw new AppError('PHONE_ALREADY_VERIFIED', 'error.PHONE_ALREADY_VERIFIED', 409);
    }

    return this.smsVerification.sendProfilePhoneVerificationCode(input.phoneNumber);
  }

  async sendProfileEmailVerification(token: string, locale: SupportedLocale = defaultLocale) {
    const { sessionId, user } = await this.authenticate(token);

    return this.sendAuthenticatedProfileEmailVerification(user, locale, { sessionId });
  }

  async sendAuthenticatedProfileEmailVerification(
    user: UserModel,
    locale: SupportedLocale = defaultLocale,
    options: AuthenticatedUserOptions = {},
  ) {
    await this.requireSessionSudoGrant(user, options.sessionId, AuthVerificationPurposeContract.UpdateContact);

    if (user.emailVerified) {
      throw new AppError('EMAIL_ALREADY_VERIFIED', 'error.EMAIL_ALREADY_VERIFIED', 409);
    }

    return this.emailVerification.sendProfileEmailVerificationCode(user.email, locale);
  }

  async register(input: RegisterInput, context: AuthSessionRequestContext = defaultAuthSessionRequestContext) {
    assertPasswordConfirmation(input);

    await this.emailVerification.verifyRegistrationCode(input.email, input.emailVerificationCode);

    const credentials = await hashPassword(input.password);
    const user = await this.userService.createWithCredentials({
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      emailVerified: this.emailVerification.isEnabled(),
      ...credentials,
    });

    await this.bootstrapRootRoleForFirstUser(user);

    return createAuthSession(
      user,
      this.tokenSecret,
      this.tokenConfig,
      this.refreshTokenStore,
      this.accessControl,
      this.sessionService,
      context,
    );
  }

  async login(input: LoginInput, context: AuthSessionRequestContext = defaultAuthSessionRequestContext) {
    const user = await this.userService.findByLoginIdentifier(input.identifier);

    if (!user || !user.available || !user.passwordHash || !user.passwordSalt) {
      throwInvalidCredentials();
    }

    const valid = await verifyPassword(input.password, user.passwordHash, user.passwordSalt);

    if (!valid) {
      throwInvalidCredentials();
    }

    if (await this.verificationService.shouldRequireLoginVerification(user)) {
      return this.verificationService.createLoginChallenge(user, context);
    }

    return createAuthSession(
      user,
      this.tokenSecret,
      this.tokenConfig,
      this.refreshTokenStore,
      this.accessControl,
      this.sessionService,
      context,
    );
  }

  async refreshSession(refreshToken: string, context: AuthSessionRequestContext = defaultAuthSessionRequestContext) {
    const payload = await this.verifyRefreshToken(refreshToken);

    await this.assertSessionFamilyActive(payload.sid);
    await this.sessionService.assertSessionActive(payload.sid, payload.sub);

    const recordKey = getRefreshTokenCacheKey(payload.jti);
    const record = await this.refreshTokenStore.get<RefreshTokenRecord>(recordKey);
    const remainingTokenTtlMs = getRemainingTokenTtlMs(payload.exp);

    if (!record || record.familyId !== payload.sid || record.userId !== payload.sub || record.used !== false) {
      await this.revokeSessionFamily(payload.sid, remainingTokenTtlMs);
      throwInvalidRefreshToken();
    }

    const consumed = await this.refreshTokenStore.compareAndSet(
      recordKey,
      record,
      {
        ...record,
        used: true,
      },
      remainingTokenTtlMs,
    );

    if (!consumed) {
      await this.revokeSessionFamily(payload.sid, remainingTokenTtlMs);
      throwInvalidRefreshToken();
    }

    await this.refreshTokenStore.delete(recordKey);

    const user = await this.userService.findById(payload.sub);

    if (!user || !user.available) {
      await this.revokeSessionFamily(payload.sid, remainingTokenTtlMs);
      throwInvalidRefreshToken();
    }

    return createAuthSession(
      user,
      this.tokenSecret,
      this.tokenConfig,
      this.refreshTokenStore,
      this.accessControl,
      this.sessionService,
      context,
      payload.sid,
    );
  }

  async revokeRefreshToken(refreshToken: string) {
    try {
      const payload = await verifyRefreshToken(refreshToken, this.tokenSecret);

      await this.refreshTokenStore.delete(getRefreshTokenCacheKey(payload.jti));
      await this.revokeSessionFamily(payload.sid, getRemainingTokenTtlMs(payload.exp));
    } catch {
      // Logout should clear client state even when the refresh token is absent or stale.
    }
  }

  async resetPassword(input: ResetPasswordInput) {
    assertPasswordConfirmation(input);

    const user = await this.userService.findByEmail(input.email);

    await this.emailVerification.verifyPasswordResetCode(input.email, input.emailVerificationCode);

    if (!isPasswordResetEligibleUser(user)) {
      throw new AppError('EMAIL_VERIFICATION_INVALID', 'error.EMAIL_VERIFICATION_INVALID', 400);
    }

    const credentials = await hashPassword(input.password);

    await this.userService.updatePassword(user, credentials);
    await this.sessionService.revokeAllUserSessions(user.id);

    return { reset: true } as const;
  }

  async changeCurrentUserPassword(token: string, input: ChangePasswordInput) {
    assertPasswordConfirmation(input);

    if (input.currentPassword === input.password) {
      throw new AppError('AUTH_PASSWORD_UNCHANGED', 'error.AUTH_PASSWORD_UNCHANGED', 400);
    }

    const { sessionId, user } = await this.authenticate(token);

    if (await this.verificationService.shouldRequireSudoVerification(user)) {
      await this.verificationService.requireSudoGrant(
        sessionId,
        user.id,
        AuthVerificationPurposeContract.ChangePassword,
      );
    }

    if (!user.passwordHash || !user.passwordSalt) {
      throwInvalidCredentials();
    }

    const valid = await verifyPassword(input.currentPassword, user.passwordHash, user.passwordSalt);

    if (!valid) {
      throwInvalidCredentials();
    }

    const credentials = await hashPassword(input.password);

    await this.userService.updatePassword(user, credentials);
    await this.sessionService.revokeOtherUserSessions(user.id, sessionId);

    return { changed: true } as const;
  }

  async verifyProfileEmail(token: string, input: VerifyProfileEmailInput) {
    const { sessionId, user } = await this.authenticate(token);

    return this.verifyAuthenticatedProfileEmail(user, input, { sessionId });
  }

  async verifyAuthenticatedProfileEmail(
    user: UserModel,
    input: VerifyProfileEmailInput,
    options: AuthenticatedUserOptions = {},
  ) {
    await this.requireSessionSudoGrant(user, options.sessionId, AuthVerificationPurposeContract.UpdateContact);

    if (user.emailVerified) {
      return this.toAuthUser(user);
    }

    await this.emailVerification.verifyProfileEmailVerificationCode(user.email, input.emailVerificationCode);

    const updatedUser = await this.userService.verifyEmail(user);

    return this.toAuthUser(updatedUser);
  }

  async verifyProfilePhone(token: string, input: VerifyProfilePhoneInput) {
    const { sessionId, user } = await this.authenticate(token);

    return this.verifyAuthenticatedProfilePhone(user, input, { sessionId });
  }

  async verifyAuthenticatedProfilePhone(
    user: UserModel,
    input: VerifyProfilePhoneInput,
    options: AuthenticatedUserOptions = {},
  ) {
    await this.requireSessionSudoGrant(user, options.sessionId, AuthVerificationPurposeContract.UpdateContact);

    await this.smsVerification.verifyProfilePhoneVerificationCode(input.phoneNumber, input.phoneVerificationCode);

    const updatedUser = await this.userService.verifyPhoneNumber(user, input.phoneNumber);

    return this.toAuthUser(updatedUser);
  }

  async authenticate(token: string) {
    const payload = await verifyAccessToken(token, this.tokenSecret);

    await this.assertSessionFamilyActive(payload.sid);
    await this.sessionService.assertSessionActive(payload.sid, payload.sub);

    const user = await this.userService.findById(payload.sub);

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'error.AUTH_INVALID_TOKEN', 401);
    }

    const access = await this.accessControl.getUserAccess(user.id);

    return {
      user,
      access,
      authUser: toAuthUser(user, access),
      sessionId: payload.sid,
    };
  }

  async getCurrentUser(token: string) {
    return (await this.authenticate(token)).authUser;
  }

  async getCurrentAuthenticatedUser(user: UserModel) {
    return this.toAuthUser(user);
  }

  async updateCurrentUser(token: string, input: UpdateCurrentUserInput) {
    const { sessionId, user } = await this.authenticate(token);

    return this.updateAuthenticatedCurrentUser(user, input, { sessionId });
  }

  async updateAuthenticatedCurrentUser(
    user: UserModel,
    input: UpdateCurrentUserInput,
    options: AuthenticatedUserOptions = {},
  ) {
    if (input.phoneNumber) {
      throw new AppError('PHONE_VERIFICATION_REQUIRED', 'error.PHONE_VERIFICATION_REQUIRED', 400);
    }

    if (input.phoneNumber === null && user.phoneNumber) {
      await this.requireSessionSudoGrant(user, options.sessionId, AuthVerificationPurposeContract.UpdateContact);
    }

    const updatedUser = await this.userService.updateProfile(user, input);

    return this.toAuthUser(updatedUser);
  }

  async uploadAvatar(token: string, input: ImageUploadInput) {
    const { user } = await this.authenticate(token);

    return this.uploadAuthenticatedAvatar(user, input);
  }

  async deleteAvatar(token: string) {
    const { user } = await this.authenticate(token);

    return this.deleteAuthenticatedAvatar(user);
  }

  async uploadProfileBanner(token: string, input: ImageUploadInput) {
    const { user } = await this.authenticate(token);

    return this.uploadAuthenticatedProfileBanner(user, input);
  }

  async deleteProfileBanner(token: string) {
    const { user } = await this.authenticate(token);

    return this.deleteAuthenticatedProfileBanner(user);
  }

  async uploadProfileBackground(token: string, input: ImageUploadInput) {
    const { user } = await this.authenticate(token);

    return this.uploadAuthenticatedProfileBackground(user, input);
  }

  async deleteProfileBackground(token: string) {
    const { user } = await this.authenticate(token);

    return this.deleteAuthenticatedProfileBackground(user);
  }

  async uploadAuthenticatedAvatar(user: UserModel, input: ImageUploadInput) {
    const updatedUser = await this.uploadManagedAvatar(user, input);

    return this.toAuthUser(updatedUser);
  }

  async deleteAuthenticatedAvatar(user: UserModel) {
    const updatedUser = await this.deleteManagedAvatar(user);

    return this.toAuthUser(updatedUser);
  }

  async uploadAuthenticatedProfileBanner(user: UserModel, input: ImageUploadInput) {
    const updatedUser = await this.uploadManagedProfileBanner(user, input);

    return this.toAuthUser(updatedUser);
  }

  async deleteAuthenticatedProfileBanner(user: UserModel) {
    const updatedUser = await this.deleteManagedProfileBanner(user);

    return this.toAuthUser(updatedUser);
  }

  async uploadAuthenticatedProfileBackground(user: UserModel, input: ImageUploadInput) {
    const updatedUser = await this.uploadManagedProfileBackground(user, input);

    return this.toAuthUser(updatedUser);
  }

  async deleteAuthenticatedProfileBackground(user: UserModel) {
    const updatedUser = await this.deleteManagedProfileBackground(user);

    return this.toAuthUser(updatedUser);
  }

  async uploadManagedAvatar(user: UserModel, input: ImageUploadInput) {
    return this.uploadManagedProfileImage(user, input, {
      directory: 'avatars',
      errorCode: 'AVATAR_FILE_INVALID',
      getPreviousStorageKey: (targetUser) => targetUser.avatarStorageKey,
      update: (targetUser, url, storageKey) => this.userService.updateAvatar(targetUser, url, storageKey),
    });
  }

  async deleteManagedAvatar(user: UserModel) {
    return this.deleteManagedProfileImage(user, {
      clear: (targetUser) => this.userService.clearAvatar(targetUser),
      getPreviousStorageKey: (targetUser) => targetUser.avatarStorageKey,
    });
  }

  async uploadManagedProfileBanner(user: UserModel, input: ImageUploadInput) {
    return this.uploadManagedProfileImage(user, input, {
      directory: 'profile-banners',
      errorCode: 'PROFILE_BANNER_FILE_INVALID',
      getPreviousStorageKey: (targetUser) => targetUser.profileBannerStorageKey,
      update: (targetUser, url, storageKey) => this.userService.updateProfileBanner(targetUser, url, storageKey),
    });
  }

  async deleteManagedProfileBanner(user: UserModel) {
    return this.deleteManagedProfileImage(user, {
      clear: (targetUser) => this.userService.clearProfileBanner(targetUser),
      getPreviousStorageKey: (targetUser) => targetUser.profileBannerStorageKey,
    });
  }

  async uploadManagedProfileBackground(user: UserModel, input: ImageUploadInput) {
    return this.uploadManagedProfileImage(user, input, {
      directory: 'profile-backgrounds',
      errorCode: 'PROFILE_BACKGROUND_FILE_INVALID',
      getPreviousStorageKey: (targetUser) => targetUser.profileBackgroundStorageKey,
      update: (targetUser, url, storageKey) => this.userService.updateProfileBackground(targetUser, url, storageKey),
    });
  }

  async deleteManagedProfileBackground(user: UserModel) {
    return this.deleteManagedProfileImage(user, {
      clear: (targetUser) => this.userService.clearProfileBackground(targetUser),
      getPreviousStorageKey: (targetUser) => targetUser.profileBackgroundStorageKey,
    });
  }

  async getTotpStatus(token: string) {
    const { user } = await this.authenticate(token);

    return this.totpService.getStatus(user);
  }

  async createTotpSetup(token: string) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManageTotp);

    return this.totpService.createSetup(user);
  }

  async enableTotp(token: string, input: { setupToken: string; code: string }) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManageTotp);
    const result = await this.totpService.enable(user, input.setupToken, input.code);

    return {
      ...this.totpService.getStatus(user),
      recoveryCodes: result.recoveryCodes,
    };
  }

  async disableTotp(token: string) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManageTotp);
    await this.totpService.disable(user);
    await this.sessionService.revokeOtherUserSessions(user.id, sessionId);

    return this.totpService.getStatus(user);
  }

  async regenerateTotpRecoveryCodes(token: string) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManageTotp);
    return this.totpService.regenerateRecoveryCodes(user);
  }

  async getMfaSettings(token: string) {
    const { user } = await this.authenticate(token);

    return this.verificationService.getUserVerificationState(user);
  }

  async updateMfaSettings(token: string, input: UpdateMfaSettingsInput) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManageMfa);
    return this.verificationService.updateMfaSettings(user, input);
  }

  async requireSsoBindingAccess(token: string) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManageSso);

    return { user };
  }

  async revokeManagedUserSessions(userId: string) {
    await this.sessionService.revokeAllUserSessions(userId);
  }

  async revokeManagedDeviceSession(user: UserModel, sessionId: string, currentSessionId?: string | undefined) {
    await this.sessionService.revokeUserSession(user.id, sessionId, currentSessionId);
    await this.revokeSessionFamily(sessionId, this.tokenConfig.refreshTokenTtlSeconds * 1000);

    return { revoked: true } as const;
  }

  async revokeManagedDeviceSessions(user: UserModel, currentSessionId?: string | undefined) {
    if (currentSessionId) {
      await this.sessionService.revokeOtherUserSessions(user.id, currentSessionId);
    } else {
      await this.sessionService.revokeAllUserSessions(user.id);
    }

    return { revoked: true } as const;
  }

  async requireStrongSudoAccess(token: string, purpose: StrongSudoPurpose) {
    const { sessionId, user } = await this.authenticate(token);

    await this.assertStrongVerifier(user, purpose);
    await this.verificationService.requireSudoGrant(sessionId, user.id, purpose);
  }

  async requireSudoAccess(token: string, purpose: AuthSelectableVerificationPurposeValue) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, purpose);
  }

  async createVerificationChallenge(
    token: string,
    purpose: AuthSelectableVerificationPurposeValue,
    context: AuthSessionRequestContext,
  ) {
    const { sessionId, user } = await this.authenticate(token);

    if (isStrongSudoPurpose(purpose)) {
      await this.assertStrongVerifier(user, purpose);
    }

    try {
      const grant = await this.verificationService.requireSudoGrant(sessionId, user.id, purpose);

      return {
        verified: true,
        sudoExpiresAt: new Date(grant.expiresAt).toISOString(),
      } as const;
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'AUTH_VERIFICATION_REQUIRED') {
        throw error;
      }
    }

    return this.verificationService.createSudoChallenge(user, sessionId, purpose, context);
  }

  async sendVerificationCode(
    token: string | undefined,
    input: { method: AuthVerificationCodeMethodValue; verificationToken: string },
    context: AuthSessionRequestContext,
    locale: SupportedLocale = defaultLocale,
  ) {
    const user = token
      ? (await this.authenticate(token)).user
      : await this.getVerificationChallengeUser(input.verificationToken, context);

    return this.verificationService.sendChallengeCode(input.verificationToken, input.method, context, user, locale);
  }

  async createPasskeyVerificationOptions(verificationToken: string, context: AuthSessionRequestContext) {
    return this.verificationService.createPasskeyAuthenticationOptions(verificationToken, context);
  }

  async verifyAuthenticationChallenge(
    input: VerifyChallengeInput & { verificationToken: string },
    context: AuthSessionRequestContext,
  ) {
    const user = await this.getVerificationChallengeUser(input.verificationToken, context);
    const verified = await this.verificationService.verifyChallenge(input.verificationToken, input, context, user);

    if (
      verified.purpose !== AuthVerificationPurposeContract.Login &&
      verified.purpose !== AuthVerificationPurposeContract.Sso
    ) {
      return {
        verified: true,
        sudoExpiresAt: verified.sudoExpiresAt,
      } as const;
    }

    const sessionUser = verified.ssoBindIdentity
      ? await this.userService.bindSsoIdentity(verified.user, verified.ssoBindIdentity)
      : verified.user;

    return createAuthSession(
      sessionUser,
      this.tokenSecret,
      this.tokenConfig,
      this.refreshTokenStore,
      this.accessControl,
      this.sessionService,
      context,
    );
  }

  async listPasskeys(token: string) {
    const { user } = await this.authenticate(token);

    return {
      passkeys: await this.passkeyService.listUserPasskeys(user.id),
    };
  }

  async createPasskeyRegistrationOptions(token: string) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManagePasskey);

    return this.passkeyService.createRegistrationOptions(user);
  }

  async verifyPasskeyRegistration(token: string, input: VerifyPasskeyRegistrationInput) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManagePasskey);
    return this.passkeyService.verifyRegistration(user, input);
  }

  async deletePasskey(token: string, passkeyId: string) {
    const { sessionId, user } = await this.authenticate(token);

    await this.verificationService.requireSudoGrant(sessionId, user.id, AuthVerificationPurposeContract.ManagePasskey);
    await this.passkeyService.deleteUserPasskey(user.id, passkeyId);

    return { deleted: true } as const;
  }

  async getManagedSecurityState(user: UserModel) {
    return {
      mfaSettings: await this.verificationService.getUserVerificationState(user),
      passkeys: await this.passkeyService.listUserPasskeys(user.id),
      totpStatus: this.totpService.getStatus(user),
    };
  }

  async updateManagedMfaSettings(user: UserModel, input: UpdateMfaSettingsInput) {
    return this.verificationService.updateMfaSettings(user, input);
  }

  async disableManagedTotp(user: UserModel, currentSessionId?: string | undefined) {
    await this.totpService.disable(user);

    if (currentSessionId) {
      await this.sessionService.revokeOtherUserSessions(user.id, currentSessionId);
    } else {
      await this.sessionService.revokeAllUserSessions(user.id);
    }

    return this.totpService.getStatus(user);
  }

  async deleteManagedPasskey(user: UserModel, passkeyId: string, currentSessionId?: string | undefined) {
    await this.passkeyService.deleteUserPasskey(user.id, passkeyId);

    if (currentSessionId) {
      await this.sessionService.revokeOtherUserSessions(user.id, currentSessionId);
    } else {
      await this.sessionService.revokeAllUserSessions(user.id);
    }

    return { deleted: true } as const;
  }

  async listDeviceSessions(token: string) {
    const { sessionId, user } = await this.authenticate(token);

    return {
      sessions: await this.sessionService.listUserSessions(user.id, sessionId),
    };
  }

  async revokeDeviceSession(token: string, sessionId: string) {
    const auth = await this.authenticate(token);

    await this.sessionService.revokeUserSession(auth.user.id, sessionId, auth.sessionId);
    await this.revokeSessionFamily(sessionId, this.tokenConfig.refreshTokenTtlSeconds * 1000);

    return { revoked: true } as const;
  }

  async revokeOtherDeviceSessions(token: string) {
    const { sessionId, user } = await this.authenticate(token);

    await this.sessionService.revokeOtherUserSessions(user.id, sessionId);

    return { revoked: true } as const;
  }

  async listManagedDeviceSessions(user: UserModel, currentSessionId?: string | undefined) {
    return {
      sessions: await this.sessionService.listUserSessions(user.id, currentSessionId),
    };
  }

  private async requireSessionSudoGrant(
    user: UserModel,
    sessionId: string | undefined,
    purpose: AuthSelectableVerificationPurposeValue,
  ) {
    if (!sessionId) {
      throw new AppError('API_KEY_NOT_SUPPORTED', 'error.API_KEY_NOT_SUPPORTED', 403);
    }

    await this.verificationService.requireSudoGrant(sessionId, user.id, purpose);
  }

  private async bootstrapRootRoleForFirstUser(user: UserModel) {
    if (await this.userService.hasMultipleAvailableUsers()) {
      return;
    }

    await this.accessControl.assignSystemRoleToUser(user.id, SystemRole.Root);
  }

  private async toAuthUser(user: UserModel) {
    return toAuthUser(user, await this.accessControl.getUserAccess(user.id));
  }

  private async uploadManagedProfileImage(
    user: UserModel,
    input: ImageUploadInput,
    options: ManagedProfileImageUploadOptions,
  ) {
    const image = validateProfileImage(input, options.errorCode);
    const savedFile = await this.saveProfileImage(input, image, options.directory);
    const previousStorageKey = options.getPreviousStorageKey(user);
    let updatedUser: UserModel;

    try {
      updatedUser = await options.update(user, savedFile.url, savedFile.key);
    } catch (error) {
      await this.deleteStoredFile(savedFile.key);
      throw error;
    }

    if (previousStorageKey) {
      await this.deleteStoredFile(previousStorageKey);
    }

    return updatedUser;
  }

  private async deleteManagedProfileImage(user: UserModel, options: ManagedProfileImageDeleteOptions) {
    const previousStorageKey = options.getPreviousStorageKey(user);
    const updatedUser = await options.clear(user);

    if (previousStorageKey) {
      await this.deleteStoredFile(previousStorageKey);
    }

    return updatedUser;
  }

  private async saveProfileImage(
    input: ImageUploadInput,
    image: NonNullable<ReturnType<typeof validateProfileImage>>,
    directory: string,
  ) {
    if (!this.fileStorage) {
      throw new AppError('FILE_STORAGE_DISABLED', 'error.FILE_STORAGE_DISABLED', 500);
    }

    return this.fileStorage.save({
      cacheControl: 'public, max-age=31536000, immutable',
      content: input.content,
      contentType: image.contentType,
      key: `${directory}/${randomUUID()}.${image.extension}`,
    });
  }

  private async deleteStoredFile(key: string) {
    if (!this.fileStorage) {
      return;
    }

    try {
      await this.fileStorage.delete(key);
    } catch {
      // Object cleanup is best-effort and must not mask the primary profile operation.
    }
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      return await verifyRefreshToken(refreshToken, this.tokenSecret);
    } catch {
      throwInvalidRefreshToken();
    }
  }

  private async assertSessionFamilyActive(familyId: string) {
    const revoked = await this.refreshTokenStore.get<boolean>(getSessionFamilyRevocationCacheKey(familyId));

    if (revoked) {
      throwInvalidRefreshToken();
    }
  }

  private async revokeSessionFamily(familyId: string, ttlMs: number) {
    await this.refreshTokenStore.set(getSessionFamilyRevocationCacheKey(familyId), true, ttlMs);
    await this.sessionService.revokeSession(familyId);
  }

  private async getVerificationChallengeUser(verificationToken: string, context: AuthSessionRequestContext) {
    const subject = await this.verificationService.getChallengeSubject(verificationToken, context);
    const user = await this.userService.findById(subject.userId);

    if (!user || !user.available) {
      throw new AppError('AUTH_VERIFICATION_TOKEN_INVALID', 'error.AUTH_VERIFICATION_TOKEN_INVALID', 401);
    }

    return user;
  }

  private async assertStrongVerifier(user: UserModel, purpose: StrongSudoPurpose) {
    const verificationState = await this.verificationService.getUserVerificationState(user);
    const hasStrongVerifier = verificationState.effectiveMethods.some(
      (method) => method === AuthMfaMethod.Passkey || method === AuthMfaMethod.Totp,
    );

    if (!hasStrongVerifier) {
      const code = getStrongVerifierErrorCode(purpose);

      throw new AppError(code, `error.${code}`, 403);
    }
  }
}

export async function createAuthSession(
  user: UserModel,
  tokenSecret: string,
  tokenConfig: AuthTokenConfig,
  refreshTokenStore: CacheStore,
  accessControl: AccessControlService,
  sessionService: AuthSessionService,
  context: AuthSessionRequestContext,
  refreshTokenFamilyId: string = randomUUID(),
) {
  const authUser = toAuthUser(user, await accessControl.getUserAccess(user.id));
  const refreshTokenId = randomUUID();
  const accessToken = await createAccessToken(
    {
      sid: refreshTokenFamilyId,
      sub: user.id,
    },
    tokenSecret,
    tokenConfig.accessTokenTtlSeconds,
  );
  const refreshToken = await createRefreshToken(
    {
      jti: refreshTokenId,
      sid: refreshTokenFamilyId,
      sub: user.id,
    },
    tokenSecret,
    tokenConfig.refreshTokenTtlSeconds,
  );

  await refreshTokenStore.set(
    getRefreshTokenCacheKey(refreshTokenId),
    {
      familyId: refreshTokenFamilyId,
      userId: user.id,
      used: false,
    },
    tokenConfig.refreshTokenTtlSeconds * 1000,
  );

  try {
    await sessionService.persistSession(
      {
        expiresAt: refreshToken.expiresAt,
        sessionId: refreshTokenFamilyId,
        userId: user.id,
      },
      context,
    );
  } catch (error) {
    await refreshTokenStore.delete(getRefreshTokenCacheKey(refreshTokenId));
    throw error;
  }

  return {
    accessToken: accessToken.accessToken,
    accessTokenExpiresAt: accessToken.expiresAt,
    refreshToken: refreshToken.refreshToken,
    refreshTokenExpiresAt: refreshToken.expiresAt,
    user: authUser,
  } as const;
}

export function toAuthUser(user: UserModel, access: UserAccess) {
  return {
    username: user.username,
    displayName: user.displayName,
    ...(user.gender ? { gender: user.gender } : {}),
    ...(user.birthday ? { birthday: user.birthday } : {}),
    ...(user.bio ? { bio: user.bio } : {}),
    ...(user.location ? { location: user.location } : {}),
    ...(user.websiteUrl ? { websiteUrl: user.websiteUrl } : {}),
    email: user.email,
    emailVerified: user.emailVerified,
    ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
    phoneVerified: user.phoneVerified,
    totpEnabled: user.totpEnabled,
    mfaAllowedMethods: parseMfaAllowedMethods(user.mfaAllowedMethods),
    mfaRequiredForSso: user.mfaRequiredForSso,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.profileBannerUrl ? { profileBannerUrl: user.profileBannerUrl } : {}),
    ...(user.profileBackgroundUrl ? { profileBackgroundUrl: user.profileBackgroundUrl } : {}),
    roles: access.roles,
    permissions: access.permissions,
  };
}

function throwInvalidCredentials(): never {
  throw new AppError('AUTH_INVALID_CREDENTIALS', 'error.AUTH_INVALID_CREDENTIALS', 401);
}

function getStrongVerifierErrorCode(purpose: StrongSudoPurpose) {
  return purpose === AuthVerificationPurposeContract.SystemSettings
    ? 'SYSTEM_SETTINGS_STRONG_VERIFICATION_REQUIRED'
    : 'USER_MANAGEMENT_STRONG_VERIFICATION_REQUIRED';
}

function throwInvalidRefreshToken(): never {
  throw new AppError('AUTH_REFRESH_TOKEN_INVALID', 'error.AUTH_REFRESH_TOKEN_INVALID', 401);
}

function getRefreshTokenCacheKey(tokenId: string) {
  return `${refreshTokenCacheKeyPrefix}${tokenId}`;
}

function getSessionFamilyRevocationCacheKey(familyId: string) {
  return `${sessionFamilyRevocationCacheKeyPrefix}${familyId}`;
}

function getRemainingTokenTtlMs(expiresAtSeconds: number) {
  return Math.max(expiresAtSeconds * 1000 - Date.now(), 1);
}

function isPasswordResetEligibleUser(user: UserModel | null): user is UserModel {
  return Boolean(user?.available && user.passwordHash && user.passwordSalt);
}

function validateProfileImage(input: ImageUploadInput, errorCode: string) {
  const detected = detectImageType(input.content);
  const contentType = input.contentType.toLowerCase();

  if (!detected) {
    throw new AppError(errorCode, `error.${errorCode}`, 400);
  }

  if (contentType && contentType !== detected.contentType) {
    throw new AppError(errorCode, `error.${errorCode}`, 400, {
      contentType,
      expectedContentType: detected.contentType,
    });
  }

  return detected;
}

function detectImageType(content: Buffer) {
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return {
      contentType: 'image/jpeg',
      extension: 'jpg',
    };
  }

  if (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content.subarray(1, 4).toString('ascii') === 'PNG' &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  ) {
    return {
      contentType: 'image/png',
      extension: 'png',
    };
  }

  if (
    content.length >= 12 &&
    content.subarray(0, 4).toString('ascii') === 'RIFF' &&
    content.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return {
      contentType: 'image/webp',
      extension: 'webp',
    };
  }

  if (
    content.length >= 6 &&
    (content.subarray(0, 6).toString('ascii') === 'GIF87a' || content.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return {
      contentType: 'image/gif',
      extension: 'gif',
    };
  }

  return null;
}
