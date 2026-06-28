import { type AuthenticationResponseJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import { createHmac, randomUUID } from 'crypto';

import { AppError } from '../../core/errors';
import { type CacheStore } from '../../infra/cache';
import { type UserModel } from '../users/user.model';
import { verifyPassword } from './auth.crypto';
import { type EmailVerificationService } from './auth.email';
import { getDefaultMfaMethod, type MfaMethod, orderMfaMethods, parseMfaAllowedMethods } from './auth.mfa';
import { type SmsVerificationService } from './auth.sms';
import { type TotpService, type VerifyTotpInput } from './auth.totp';
import { type PasskeyService } from './auth-passkey.service';
import { type AuthSessionRequestContext, getUserAgentFingerprint } from './auth-session.service';

export type AuthVerificationPurpose =
  | 'change_password'
  | 'login'
  | 'manage_sso'
  | 'manage_mfa'
  | 'manage_passkey'
  | 'manage_totp'
  | 'system_settings'
  | 'sso'
  | 'update_contact'
  | 'user_management';

export type VerificationMethod = MfaMethod | 'password';

interface VerificationChallengeRecord {
  attempts: number;
  expiresAt: number;
  ipAddressHash: string;
  methods: VerificationMethod[];
  passkeyChallenge?: string | undefined;
  purpose: AuthVerificationPurpose;
  sessionId?: string | undefined;
  ssoBindIdentity?: SsoBindVerificationIdentity | undefined;
  used: boolean;
  userAgentFingerprint: string;
  userId: string;
}

interface SudoGrantRecord {
  expiresAt: number;
  methods: VerificationMethod[];
  userId: string;
}

export interface SsoBindVerificationIdentity {
  providerId: string;
  providerName: string;
  providerSubject: string;
  email: string;
}

interface VerificationMethodDescriptor {
  method: VerificationMethod;
  label: string;
  maskedTarget?: string | undefined;
}

export interface VerificationRequiredResponse {
  requiresVerification: true;
  verificationToken: string;
  purpose: AuthVerificationPurpose;
  defaultMethod: VerificationMethod;
  methods: VerificationMethodDescriptor[];
  expiresAt: string;
  remainingAttempts: number;
}

export interface VerifyChallengeInput extends VerifyTotpInput {
  method: VerificationMethod;
  password?: string | undefined;
  passkeyResponse?: AuthenticationResponseJSON | undefined;
}

export interface UpdateMfaSettingsInput {
  enabled?: boolean | undefined;
  requiredForSso?: boolean | undefined;
}

export interface AuthVerificationConfig {
  challengeTtlMs: number;
  maxChallengeAttempts: number;
  sudoTtlMs: number;
}

const challengeCacheKeyPrefix = 'auth:verification-challenge:';
const sudoCacheKeyPrefix = 'auth:sudo:';
const strongMfaMethods = new Set<MfaMethod>(['passkey', 'totp']);
const weakMfaMethods = new Set<MfaMethod>(['sms', 'email']);

export const defaultAuthVerificationConfig: AuthVerificationConfig = {
  challengeTtlMs: 5 * 60_000,
  maxChallengeAttempts: 5,
  sudoTtlMs: 15 * 60_000,
};

export class AuthVerificationService {
  constructor(
    private readonly cacheStore: CacheStore,
    private readonly hashingSecret: string,
    private readonly passkeyService: PasskeyService,
    private readonly totpService: TotpService,
    private readonly emailVerification: EmailVerificationService,
    private readonly smsVerification: SmsVerificationService,
    private readonly config: AuthVerificationConfig = defaultAuthVerificationConfig,
  ) {}

  async getUserVerificationState(user: UserModel) {
    const availableMethods = await this.getAvailableMethods(user);
    const selectableMethods = getSelectableMfaMethods(availableMethods);
    const effectiveMethods = this.getEffectiveMfaMethods(user, availableMethods);

    return {
      availableMethods,
      defaultMethod: getDefaultMfaMethod(effectiveMethods),
      effectiveMethods,
      mfaRequiredForSso: user.mfaRequiredForSso,
      passkeyCount: await this.passkeyService.countUserPasskeys(user.id),
      twoStepCanDisable: !hasStrongMfaMethod(selectableMethods),
      twoStepCanEnable: selectableMethods.length > 0,
      twoStepEnabled: effectiveMethods.length > 0,
    };
  }

  async updateMfaSettings(user: UserModel, input: UpdateMfaSettingsInput) {
    if (input.enabled !== undefined) {
      const availableMethods = await this.getAvailableMethods(user);
      const selectableMethods = getSelectableMfaMethods(availableMethods);
      const strongMethodConfigured = hasStrongMfaMethod(selectableMethods);

      if (!input.enabled && strongMethodConfigured) {
        throw new AppError(
          'MFA_REQUIRED_FOR_STRONG_VERIFIER',
          'Two-step verification cannot be disabled while an authenticator app or passkey is configured.',
          409,
        );
      }

      if (input.enabled && selectableMethods.length === 0) {
        throw new AppError(
          'MFA_VERIFICATION_UNAVAILABLE',
          'No MFA verification method is available for this account.',
          409,
        );
      }

      if (!strongMethodConfigured) {
        user.mfaAllowedMethods = JSON.stringify(input.enabled ? selectableMethods : []);
      }
    }

    if (input.requiredForSso !== undefined) {
      user.mfaRequiredForSso = input.requiredForSso;
    }

    await user.save();

    return this.getUserVerificationState(user);
  }

  async shouldRequireLoginVerification(user: UserModel) {
    const methods = this.getEffectiveMfaMethods(user, await this.getAvailableMethods(user));

    return methods.length > 0;
  }

  async shouldRequireSudoVerification(user: UserModel) {
    return (await this.getAvailableMethods(user)).length > 0;
  }

  async createLoginChallenge(
    user: UserModel,
    context: AuthSessionRequestContext,
    purpose: AuthVerificationPurpose = 'login',
  ) {
    return this.createChallenge(user, context, purpose);
  }

  async createSsoBindChallenge(
    user: UserModel,
    context: AuthSessionRequestContext,
    ssoBindIdentity: SsoBindVerificationIdentity,
  ) {
    return this.createChallenge(user, context, 'sso', undefined, ssoBindIdentity);
  }

  async createSudoChallenge(
    user: UserModel,
    sessionId: string,
    purpose: Exclude<AuthVerificationPurpose, 'login' | 'sso'>,
    context: AuthSessionRequestContext,
  ) {
    return this.createChallenge(user, context, purpose, sessionId);
  }

  async sendChallengeCode(token: string, method: 'email' | 'sms', context: AuthSessionRequestContext, user: UserModel) {
    const record = await this.requireChallengeRecord(token, context);

    if (record.userId !== user.id || !record.methods.includes(method)) {
      throwInvalidVerificationToken();
    }

    if (method === 'email') {
      return {
        ...(await this.emailVerification.sendMfaCode(user.email)),
        maskedTarget: maskEmail(user.email),
      };
    }

    if (!user.phoneNumber || !user.phoneVerified) {
      throw new AppError('SMS_VERIFICATION_UNAVAILABLE', 'SMS verification is not available for this account.', 409);
    }

    return {
      ...(await this.smsVerification.sendMfaCode(user.phoneNumber)),
      maskedTarget: maskPhoneNumber(user.phoneNumber),
    };
  }

  async getChallengeSubject(token: string, context: AuthSessionRequestContext) {
    const record = await this.requireChallengeRecord(token, context);

    return {
      purpose: record.purpose,
      userId: record.userId,
    };
  }

  async createPasskeyAuthenticationOptions(
    token: string,
    context: AuthSessionRequestContext,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const record = await this.requireChallengeRecord(token, context);

      if (!record.methods.includes('passkey')) {
        throw new AppError('PASSKEY_VERIFICATION_UNAVAILABLE', 'Passkey verification is not available.', 409);
      }

      const options = await this.passkeyService.createAuthenticationOptions(record.userId);
      const nextRecord = {
        ...record,
        passkeyChallenge: options.challenge,
      };
      const saved = await this.cacheStore.compareAndSet(
        getChallengeCacheKey(token),
        record,
        nextRecord,
        record.expiresAt - Date.now(),
      );

      if (saved) {
        return options;
      }
    }

    throw new AppError('AUTH_VERIFICATION_CONFLICT', 'Verification state changed. Submit the request again.', 409);
  }

  async verifyChallenge(
    token: string,
    input: VerifyChallengeInput,
    context: AuthSessionRequestContext,
    user: UserModel,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const record = await this.requireChallengeRecord(token, context);

      if (record.userId !== user.id || !record.methods.includes(input.method)) {
        throwInvalidVerificationToken();
      }

      const valid = await this.verifyMethod(record, input, user);

      if (!valid) {
        const nextRecord = {
          ...record,
          attempts: record.attempts + 1,
        };

        if (nextRecord.attempts >= this.config.maxChallengeAttempts) {
          await this.cacheStore.delete(getChallengeCacheKey(token));
          throw new AppError('AUTH_VERIFICATION_ATTEMPT_LIMIT_EXCEEDED', 'Verification attempts are exhausted.', 429);
        }

        await this.cacheStore.compareAndSet(
          getChallengeCacheKey(token),
          record,
          nextRecord,
          record.expiresAt - Date.now(),
        );
        throw new AppError('AUTH_VERIFICATION_INVALID', 'Verification code or response is invalid.', 401, {
          remainingAttempts: this.config.maxChallengeAttempts - nextRecord.attempts,
        });
      }

      const consumed = await this.cacheStore.compareAndSet(
        getChallengeCacheKey(token),
        record,
        {
          ...record,
          used: true,
        },
        record.expiresAt - Date.now(),
      );

      if (!consumed) {
        continue;
      }

      await this.cacheStore.delete(getChallengeCacheKey(token));

      if (record.sessionId) {
        const sudoTtlMs = this.config.sudoTtlMs;

        await this.cacheStore.set<SudoGrantRecord>(
          getSudoCacheKey(record.sessionId),
          {
            expiresAt: Date.now() + sudoTtlMs,
            methods: [input.method],
            userId: user.id,
          },
          sudoTtlMs,
        );
      }

      return {
        method: input.method,
        purpose: record.purpose,
        ssoBindIdentity: record.ssoBindIdentity,
        sudoExpiresAt: record.sessionId ? new Date(Date.now() + this.config.sudoTtlMs).toISOString() : undefined,
        user,
      };
    }

    throw new AppError('AUTH_VERIFICATION_CONFLICT', 'Verification state changed. Submit the request again.', 409);
  }

  async requireSudoGrant(sessionId: string, userId: string, purpose: AuthVerificationPurpose) {
    const grant = await this.cacheStore.get<SudoGrantRecord>(getSudoCacheKey(sessionId));

    if (
      !grant ||
      grant.userId !== userId ||
      grant.expiresAt <= Date.now() ||
      !isSudoGrantValidForPurpose(grant, purpose)
    ) {
      throw new AppError('AUTH_VERIFICATION_REQUIRED', 'Additional authentication is required.', 403, {
        purpose,
      });
    }

    return grant;
  }

  private async createChallenge(
    user: UserModel,
    context: AuthSessionRequestContext,
    purpose: AuthVerificationPurpose,
    sessionId?: string,
    ssoBindIdentity?: SsoBindVerificationIdentity,
  ): Promise<VerificationRequiredResponse> {
    const availableMethods = await this.getAvailableMethods(user);
    const effectiveMethods = isSelectableSudoPurpose(purpose)
      ? getSelectableMfaMethods(availableMethods)
      : this.getEffectiveMfaMethods(user, availableMethods);
    const methods = this.withPasswordFallback(user, sessionId, effectiveMethods);
    const defaultMethod = methods[0];

    if (!defaultMethod) {
      throw new AppError('AUTH_VERIFICATION_UNAVAILABLE', 'No verification method is available for this account.', 409);
    }

    const verificationToken = randomUUID();
    const expiresAt = Date.now() + this.config.challengeTtlMs;

    await this.cacheStore.set<VerificationChallengeRecord>(
      getChallengeCacheKey(verificationToken),
      {
        attempts: 0,
        expiresAt,
        ipAddressHash: this.hashContextValue(context.ipAddress),
        methods,
        purpose,
        ...(sessionId ? { sessionId } : {}),
        ...(ssoBindIdentity ? { ssoBindIdentity } : {}),
        used: false,
        userAgentFingerprint: getUserAgentFingerprint(context.userAgent),
        userId: user.id,
      },
      this.config.challengeTtlMs,
    );

    return {
      requiresVerification: true,
      verificationToken,
      purpose,
      defaultMethod,
      methods: methods.map((method) => this.toMethodDescriptor(method, user)),
      expiresAt: new Date(expiresAt).toISOString(),
      remainingAttempts: this.config.maxChallengeAttempts,
    };
  }

  private async getAvailableMethods(user: UserModel): Promise<MfaMethod[]> {
    const methods: MfaMethod[] = [];

    if ((await this.passkeyService.countUserPasskeys(user.id)) > 0) {
      methods.push('passkey');
    }

    if (user.totpEnabled) {
      methods.push('totp');
    }

    if (this.smsVerification.isEnabled() && user.phoneNumber && user.phoneVerified) {
      methods.push('sms');
    }

    if (this.emailVerification.isEnabled() && user.emailVerified) {
      methods.push('email');
    }

    return orderMfaMethods(methods);
  }

  private getEffectiveMfaMethods(user: UserModel, availableMethods: MfaMethod[]) {
    const selectableMethods = getSelectableMfaMethods(availableMethods);

    if (hasStrongMfaMethod(selectableMethods)) {
      return selectableMethods;
    }

    if (parseMfaAllowedMethods(user.mfaAllowedMethods).length === 0) {
      return [];
    }

    return selectableMethods;
  }

  private async requireChallengeRecord(token: string, context: AuthSessionRequestContext) {
    const key = getChallengeCacheKey(token);
    const record = await this.cacheStore.get<VerificationChallengeRecord>(key);

    if (!record || record.used || record.expiresAt <= Date.now()) {
      await this.cacheStore.delete(key);
      throwInvalidVerificationToken();
    }

    if (
      record.ipAddressHash !== this.hashContextValue(context.ipAddress) ||
      record.userAgentFingerprint !== getUserAgentFingerprint(context.userAgent)
    ) {
      await this.cacheStore.delete(key);
      throwInvalidVerificationToken();
    }

    if (record.attempts >= this.config.maxChallengeAttempts) {
      await this.cacheStore.delete(key);
      throw new AppError('AUTH_VERIFICATION_ATTEMPT_LIMIT_EXCEEDED', 'Verification attempts are exhausted.', 429);
    }

    return record;
  }

  private async verifyMethod(record: VerificationChallengeRecord, input: VerifyChallengeInput, user: UserModel) {
    if (input.method === 'password') {
      if (!input.password || !user.passwordHash || !user.passwordSalt) {
        return false;
      }

      return verifyPassword(input.password, user.passwordHash, user.passwordSalt);
    }

    if (input.method === 'passkey') {
      if (!input.passkeyResponse || !record.passkeyChallenge) {
        throw new AppError('PASSKEY_RESPONSE_REQUIRED', 'Passkey response is required.', 400);
      }

      try {
        await this.passkeyService.verifyAuthentication(user.id, record.passkeyChallenge, input.passkeyResponse);
        return true;
      } catch (error) {
        if (isAppErrorCode(error, 'PASSKEY_NOT_FOUND', 'PASSKEY_AUTHENTICATION_INVALID')) {
          return false;
        }

        throw error;
      }
    }

    if (input.method === 'totp') {
      return this.totpService.verifyUserSecondFactor(user, input);
    }

    if (input.method === 'email') {
      try {
        await this.emailVerification.verifyMfaCode(user.email, input.code);
        return true;
      } catch (error) {
        if (isAppErrorCode(error, 'EMAIL_VERIFICATION_INVALID', 'EMAIL_VERIFICATION_REQUIRED')) {
          return false;
        }

        throw error;
      }
    }

    if (input.method === 'sms') {
      if (!user.phoneNumber || !user.phoneVerified) {
        return false;
      }

      try {
        await this.smsVerification.verifyMfaCode(user.phoneNumber, input.code);
        return true;
      } catch (error) {
        if (isAppErrorCode(error, 'SMS_VERIFICATION_INVALID', 'SMS_VERIFICATION_REQUIRED')) {
          return false;
        }

        throw error;
      }
    }

    return false;
  }

  private toMethodDescriptor(method: VerificationMethod, user: UserModel): VerificationMethodDescriptor {
    if (method === 'password') {
      return {
        method,
        label: 'Password',
      };
    }

    if (method === 'passkey') {
      return {
        method,
        label: 'Passkey',
      };
    }

    if (method === 'totp') {
      return {
        method,
        label: 'Authenticator app',
      };
    }

    if (method === 'sms') {
      return {
        method,
        label: 'SMS',
        ...(user.phoneNumber ? { maskedTarget: maskPhoneNumber(user.phoneNumber) } : {}),
      };
    }

    return {
      method,
      label: 'Email',
      maskedTarget: maskEmail(user.email),
    };
  }

  private hashContextValue(value: string) {
    return createHmac('sha256', this.hashingSecret)
      .update(value || 'unknown')
      .digest('base64url');
  }

  private withPasswordFallback(
    user: UserModel,
    sessionId: string | undefined,
    methods: MfaMethod[],
  ): VerificationMethod[] {
    if (methods.length > 0 || !sessionId || !user.passwordHash || !user.passwordSalt) {
      return methods;
    }

    return ['password'];
  }
}

function getAvailableStrongMethods(availableMethods: MfaMethod[]) {
  return orderMfaMethods(availableMethods.filter((method) => strongMfaMethods.has(method)));
}

function getAvailableWeakMethods(availableMethods: MfaMethod[]) {
  return orderMfaMethods(availableMethods.filter((method) => weakMfaMethods.has(method)));
}

function getSelectableMfaMethods(availableMethods: MfaMethod[]) {
  const strongMethods = getAvailableStrongMethods(availableMethods);

  return strongMethods.length > 0 ? strongMethods : getAvailableWeakMethods(availableMethods);
}

function hasStrongMfaMethod(methods: MfaMethod[]) {
  return methods.some((method) => strongMfaMethods.has(method));
}

function throwInvalidVerificationToken(): never {
  throw new AppError('AUTH_VERIFICATION_TOKEN_INVALID', 'Verification token is invalid or expired.', 401);
}

function isAppErrorCode(error: unknown, ...codes: string[]) {
  return error instanceof AppError && codes.includes(error.code);
}

function isSudoGrantValidForPurpose(grant: SudoGrantRecord, purpose: AuthVerificationPurpose) {
  if (!isStrongSudoPurpose(purpose)) {
    return true;
  }

  return grant.methods.some((method) => method === 'passkey' || method === 'totp');
}

export function isStrongSudoPurpose(purpose: AuthVerificationPurpose) {
  return purpose === 'system_settings' || purpose === 'user_management';
}

function isSelectableSudoPurpose(purpose: AuthVerificationPurpose) {
  return purpose === 'change_password' || purpose === 'manage_sso';
}

function maskEmail(email: string) {
  const [, domain = ''] = email.split('@');

  if (!domain) {
    return email;
  }

  return `***@${domain}`;
}

function maskPhoneNumber(phoneNumber: string) {
  if (phoneNumber.length <= 9) {
    return '***';
  }

  return `${phoneNumber.slice(0, 6)}****${phoneNumber.slice(-4)}`;
}

function getChallengeCacheKey(token: string) {
  return `${challengeCacheKeyPrefix}${token}`;
}

function getSudoCacheKey(sessionId: string) {
  return `${sudoCacheKeyPrefix}${sessionId}`;
}
