import OpenApiClient, { $OpenApiUtil } from '@alicloud/openapi-core';
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';

import { AppError } from '../../core/errors';
import { type CacheStore, MemoryCacheStore } from '../../infra/cache';

export type PhoneCountryCode = '+86' | '+852' | '+853';

interface AliyunSmsBaseProfileConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  phoneCountryCode: PhoneCountryCode;
  regionId: string;
}

export interface AliyunSmsDomesticProfileConfig extends AliyunSmsBaseProfileConfig {
  apiVersion: '2017-05-25';
  operation: 'SendSms';
  phoneCountryCode: '+86';
  signName: string;
  templateCode: string;
}

export interface AliyunSmsInternationalProfileConfig extends AliyunSmsBaseProfileConfig {
  apiVersion: '2018-05-01';
  messageTemplate: string;
  operation: 'SendMessageToGlobe';
  phoneCountryCode: '+852' | '+853';
  senderId?: string | undefined;
  type: 'MKT' | 'NOTIFY' | 'OTP';
}

export type AliyunSmsProfileConfig = AliyunSmsDomesticProfileConfig | AliyunSmsInternationalProfileConfig;

type OpenApiClientInstance = InstanceType<typeof OpenApiClient>;

interface SmsVerificationConfig {
  cacheStore?: CacheStore;
  codeCooldownMs: number;
  codeExpiresInMs: number;
  phoneCountryCodes?: PhoneCountryCode[];
  sender?: SmsSender;
  verificationSecret?: string;
}

interface SendSmsInput {
  code: string;
  phoneNumber: string;
}

export interface SmsSender {
  send(input: SendSmsInput): Promise<void>;
}

interface VerificationRecord {
  attemptsRemaining: number;
  codeHash: string;
  expiresAt: number;
  nextSendAt: number;
}

interface AliyunSmsSenderPoolOptions {
  createClient?: (config: AliyunSmsProfileConfig) => OpenApiClientInstance;
  selectProfileIndex?: (profiles: AliyunSmsProfileConfig[]) => number;
}

type VerificationPurpose = 'profile-phone';

const smsProbeTimeoutMs = 10_000;
const defaultVerificationConfig = {
  codeCooldownMs: 60_000,
  codeExpiresInMs: 10 * 60_000,
} as const;
const verificationCodeLength = 6;
const maxVerificationAttempts = 5;
const maxVerificationRecordUpdateAttempts = 3;
const acceptedProbeErrorCodes = new Set([
  'InvalidParameter.PhoneNumbers',
  'InvalidParameter.To',
  'MissingParameter',
  'isv.MOBILE_NUMBER_ILLEGAL',
  'isv.MOBILE_NUMBER_INVALID',
  'MissingParameter.PhoneNumbers',
  'MissingParameter.To',
]);

export class SmsVerificationService {
  private readonly cacheStore: CacheStore;
  private readonly codeCooldownMs: number;
  private readonly codeExpiresInMs: number;
  private readonly phoneCountryCodes: PhoneCountryCode[];
  private readonly sender: SmsSender | undefined;
  private readonly verificationSecret: Buffer;

  constructor(config: SmsVerificationConfig = defaultVerificationConfig) {
    this.cacheStore = config.cacheStore ?? new MemoryCacheStore();
    this.codeCooldownMs = config.codeCooldownMs;
    this.codeExpiresInMs = config.codeExpiresInMs;
    this.phoneCountryCodes = config.phoneCountryCodes ?? [];
    this.sender = config.sender;
    this.verificationSecret = config.verificationSecret
      ? Buffer.from(config.verificationSecret, 'utf8')
      : randomBytes(32);
  }

  isEnabled() {
    return Boolean(this.sender && this.phoneCountryCodes.length > 0);
  }

  getPhoneCountryCodes() {
    return this.isEnabled() ? this.phoneCountryCodes : [];
  }

  async sendProfilePhoneVerificationCode(phoneNumber: string) {
    return this.sendCode('profile-phone', phoneNumber);
  }

  async verifyProfilePhoneVerificationCode(phoneNumber: string, code?: string) {
    if (!this.sender) {
      throw new AppError('SMS_VERIFICATION_DISABLED', 'SMS verification is disabled.', 404);
    }

    await this.verifyCode('profile-phone', phoneNumber, code);
  }

  private async sendCode(purpose: VerificationPurpose, phoneNumber: string) {
    if (!this.sender) {
      throw new AppError('SMS_VERIFICATION_DISABLED', 'SMS verification is disabled.', 404);
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    this.assertSupportedPhoneCountryCode(normalizedPhoneNumber);

    const recordKey = getRecordKey(purpose, normalizedPhoneNumber);
    const sendLockKey = getSendLockKey(purpose, normalizedPhoneNumber);
    const sendLockOwner = `${process.pid}:${randomUUID()}`;
    const existing = await this.cacheStore.get<VerificationRecord>(recordKey);
    const now = Date.now();

    if (existing && existing.nextSendAt > now) {
      throw new AppError('SMS_VERIFICATION_COOLDOWN', 'SMS verification code was sent recently.', 429, {
        retryAfterSeconds: Math.ceil((existing.nextSendAt - now) / 1000),
      });
    }

    const sendLockAcquired = await this.cacheStore.acquireLock(sendLockKey, sendLockOwner, this.codeCooldownMs);

    if (!sendLockAcquired) {
      const current = await this.cacheStore.get<VerificationRecord>(recordKey);
      const retryAfterMs =
        current?.nextSendAt && current.nextSendAt > Date.now() ? current.nextSendAt - Date.now() : this.codeCooldownMs;

      throw new AppError('SMS_VERIFICATION_COOLDOWN', 'SMS verification code was sent recently.', 429, {
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      });
    }

    const code = createVerificationCode();

    try {
      await this.sender.send({
        code,
        phoneNumber: normalizedPhoneNumber,
      });

      await this.cacheStore.set(
        recordKey,
        {
          attemptsRemaining: maxVerificationAttempts,
          codeHash: this.hashVerificationCode(purpose, normalizedPhoneNumber, code),
          expiresAt: now + this.codeExpiresInMs,
          nextSendAt: now + this.codeCooldownMs,
        },
        this.codeExpiresInMs,
      );
    } catch (error) {
      await this.releaseSendLock(sendLockKey, sendLockOwner);
      throw error;
    }

    return this.createDeliveryMetadata();
  }

  private async verifyCode(purpose: VerificationPurpose, phoneNumber: string, code?: string) {
    if (!code) {
      throw new AppError('SMS_VERIFICATION_REQUIRED', 'SMS verification code is required.', 400);
    }

    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    this.assertSupportedPhoneCountryCode(normalizedPhoneNumber);
    const recordKey = getRecordKey(purpose, normalizedPhoneNumber);

    for (let attempt = 0; attempt < maxVerificationRecordUpdateAttempts; attempt += 1) {
      const record = await this.cacheStore.get<VerificationRecord>(recordKey);
      const now = Date.now();

      if (!record || record.expiresAt <= now) {
        await this.cacheStore.delete(recordKey);
        throwInvalidVerificationCode();
      }

      if (record.attemptsRemaining <= 0) {
        await this.cacheStore.delete(recordKey);
        throwInvalidVerificationCode();
      }

      if (this.isVerificationCodeMatch(record.codeHash, purpose, normalizedPhoneNumber, code)) {
        await this.cacheStore.delete(recordKey);
        return;
      }

      const didUpdate = await this.cacheStore.compareAndSet(
        recordKey,
        record,
        {
          ...record,
          attemptsRemaining: record.attemptsRemaining - 1,
        },
        record.expiresAt - now,
      );

      if (didUpdate) {
        throwInvalidVerificationCode();
      }
    }

    throw new AppError('SMS_VERIFICATION_CONFLICT', 'SMS verification state changed. Submit the request again.', 409);
  }

  private assertSupportedPhoneCountryCode(phoneNumber: string) {
    if (this.phoneCountryCodes.some((countryCode) => phoneNumber.startsWith(countryCode))) {
      return;
    }

    throw new AppError(
      'SMS_PHONE_COUNTRY_CODE_UNSUPPORTED',
      'Phone number country code is not configured for SMS verification.',
      400,
    );
  }

  private hashVerificationCode(purpose: VerificationPurpose, phoneNumber: string, code: string) {
    return createHmac('sha256', this.verificationSecret)
      .update(`${purpose}:${phoneNumber}:${code}`, 'utf8')
      .digest('base64url');
  }

  private isVerificationCodeMatch(
    expectedHash: string,
    purpose: VerificationPurpose,
    phoneNumber: string,
    code: string,
  ) {
    const expected = Buffer.from(expectedHash, 'base64url');
    const candidate = Buffer.from(this.hashVerificationCode(purpose, phoneNumber, code), 'base64url');

    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }

  private createDeliveryMetadata() {
    return {
      cooldownSeconds: Math.ceil(this.codeCooldownMs / 1000),
      expiresInSeconds: Math.ceil(this.codeExpiresInMs / 1000),
    };
  }

  private async releaseSendLock(key: string, owner: string) {
    try {
      await this.cacheStore.releaseLock(key, owner);
    } catch {
      // Best-effort cleanup only. The cooldown lock expires automatically.
    }
  }
}

export class AliyunSmsSenderPool implements SmsSender {
  constructor(
    private readonly profiles: AliyunSmsProfileConfig[],
    private readonly options: AliyunSmsSenderPoolOptions = {},
  ) {}

  getPhoneCountryCodes() {
    return this.profiles.map((profile) => profile.phoneCountryCode);
  }

  async send(input: SendSmsInput) {
    const matchingProfiles = this.profiles.filter((profile) => input.phoneNumber.startsWith(profile.phoneCountryCode));

    if (matchingProfiles.length === 0) {
      throw new AppError(
        'SMS_PHONE_COUNTRY_CODE_UNSUPPORTED',
        'Phone number country code is not configured for SMS verification.',
        400,
      );
    }

    const profile =
      matchingProfiles[this.options.selectProfileIndex?.(matchingProfiles) ?? randomInt(matchingProfiles.length)];

    if (!profile) {
      throw new AppError('SMS_PROFILE_SELECTION_FAILED', 'SMS verification profile could not be selected.', 500);
    }

    const client = this.options.createClient?.(profile) ?? createAliyunSmsClient(profile, smsProbeTimeoutMs);
    const request = new $OpenApiUtil.OpenApiRequest({
      query: getSendQuery(profile, input),
    });

    await client.doRPCRequest(
      profile.operation,
      profile.apiVersion,
      'https',
      'POST',
      'AK',
      'json',
      request,
      getRuntimeOptions(),
    );
  }
}

export async function checkAliyunSmsProfiles(profiles: AliyunSmsProfileConfig[]) {
  await Promise.all(profiles.map(checkAliyunSmsProfile));
}

async function checkAliyunSmsProfile(profile: AliyunSmsProfileConfig) {
  const client = createAliyunSmsClient(profile, smsProbeTimeoutMs);
  const request = new $OpenApiUtil.OpenApiRequest({
    query: getProbeQuery(profile),
  });

  try {
    await client.doRPCRequest(
      profile.operation,
      profile.apiVersion,
      'https',
      'POST',
      'AK',
      'json',
      request,
      getRuntimeOptions(),
    );
  } catch (error) {
    if (isAcceptedProbeError(error)) {
      return;
    }

    throw new AppError('SETUP_SMS_CONNECTION_FAILED', getAliyunErrorMessage(error), 400);
  }
}

function createAliyunSmsClient(profile: AliyunSmsProfileConfig, timeoutMs: number) {
  return new OpenApiClient(
    new $OpenApiUtil.Config({
      accessKeyId: profile.accessKeyId,
      accessKeySecret: profile.accessKeySecret,
      connectTimeout: timeoutMs,
      endpoint: profile.endpoint,
      readTimeout: timeoutMs,
      regionId: profile.regionId,
    }),
  );
}

function getProbeQuery(profile: AliyunSmsProfileConfig) {
  if (profile.phoneCountryCode === '+86') {
    return {
      PhoneNumbers: '000',
      SignName: profile.signName,
      TemplateCode: profile.templateCode,
      TemplateParam: JSON.stringify({ code: '000000' }),
    };
  }

  return {
    Message: profile.messageTemplate.replace('${code}', '000000'),
    To: '000',
    ...(profile.senderId ? { From: profile.senderId } : {}),
    Type: profile.type,
  };
}

function getSendQuery(profile: AliyunSmsProfileConfig, input: SendSmsInput) {
  if (profile.phoneCountryCode === '+86') {
    return {
      PhoneNumbers: input.phoneNumber.slice(profile.phoneCountryCode.length),
      SignName: profile.signName,
      TemplateCode: profile.templateCode,
      TemplateParam: JSON.stringify({ code: input.code }),
    };
  }

  return {
    Message: profile.messageTemplate.replace('${code}', input.code),
    To: input.phoneNumber,
    ...(profile.senderId ? { From: profile.senderId } : {}),
    Type: profile.type,
  };
}

function getRuntimeOptions(): Parameters<OpenApiClientInstance['doRPCRequest']>[7] {
  return {
    connectTimeout: smsProbeTimeoutMs,
    readTimeout: smsProbeTimeoutMs,
  } as Parameters<OpenApiClientInstance['doRPCRequest']>[7];
}

function isAcceptedProbeError(error: unknown) {
  const code = getAliyunErrorCode(error);

  return Boolean(code && acceptedProbeErrorCodes.has(code));
}

function getAliyunErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function getAliyunErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Aliyun SMS connection test could not be completed.';
}

function createVerificationCode() {
  return String(randomInt(0, 10 ** verificationCodeLength)).padStart(verificationCodeLength, '0');
}

function normalizePhoneNumber(phoneNumber: string) {
  return phoneNumber.trim();
}

function getRecordKey(purpose: VerificationPurpose, phoneNumber: string) {
  return `sms-verification:${purpose}:${phoneNumber}`;
}

function getSendLockKey(purpose: VerificationPurpose, phoneNumber: string) {
  return `sms-verification-send:${purpose}:${phoneNumber}`;
}

function throwInvalidVerificationCode(): never {
  throw new AppError('SMS_VERIFICATION_INVALID', 'SMS verification code is invalid or expired.', 400);
}
