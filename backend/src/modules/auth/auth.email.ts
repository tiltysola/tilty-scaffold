import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import { AppError } from '../../core/errors';
import { type CacheStore, MemoryCacheStore } from '../../infra/cache';

interface EmailVerificationConfig {
  cacheStore?: CacheStore;
  codeCooldownMs: number;
  codeExpiresInMs: number;
  sender?: EmailSender;
  verificationSecret?: string;
}

export interface SmtpEmailSenderConfig {
  from: string;
  host: string;
  password?: string;
  port: number;
  secure: boolean;
  startTls: boolean;
  timeoutMs: number;
  username?: string;
}

interface SendEmailInput {
  subject: string;
  text: string;
  to: string;
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<void>;
}

interface SmtpEmailSenderPoolOptions {
  createSender?: (config: SmtpEmailSenderConfig) => EmailSender;
  selectProfileIndex?: (profileCount: number) => number;
}

interface VerificationRecord {
  attemptsRemaining: number;
  codeHash: string;
  expiresAt: number;
  nextSendAt: number;
}

type VerificationPurpose = 'mfa' | 'password-reset' | 'profile-email' | 'registration';

const defaultVerificationConfig = {
  codeCooldownMs: 60_000,
  codeExpiresInMs: 10 * 60_000,
} as const;
const verificationCodeLength = 6;
const maxVerificationRecordUpdateAttempts = 3;
const maxVerificationAttempts = 5;

export class EmailVerificationService {
  private readonly cacheStore: CacheStore;
  private readonly codeCooldownMs: number;
  private readonly codeExpiresInMs: number;
  private readonly verificationSecret: Buffer;
  private readonly sender: EmailSender | undefined;

  constructor(config: EmailVerificationConfig = defaultVerificationConfig) {
    this.cacheStore = config.cacheStore ?? new MemoryCacheStore();
    this.codeCooldownMs = config.codeCooldownMs;
    this.codeExpiresInMs = config.codeExpiresInMs;
    this.sender = config.sender;
    this.verificationSecret = config.verificationSecret
      ? Buffer.from(config.verificationSecret, 'utf8')
      : randomBytes(32);
  }

  isEnabled() {
    return Boolean(this.sender);
  }

  getDeliveryMetadata() {
    if (!this.sender) {
      throw new AppError('EMAIL_VERIFICATION_DISABLED', 'Email verification is disabled.', 404);
    }

    return this.createDeliveryMetadata();
  }

  async sendRegistrationCode(email: string) {
    return this.sendCode('registration', email, 'Registration verification code', (code) => [
      `Your registration verification code is ${code}.`,
      `This code expires in ${Math.ceil(this.codeExpiresInMs / 60_000)} minutes.`,
      'No action is required if this code was not requested by you.',
    ]);
  }

  async sendPasswordResetCode(email: string) {
    return this.sendCode('password-reset', email, 'Password reset verification code', (code) => [
      `Your password reset verification code is ${code}.`,
      `This code expires in ${Math.ceil(this.codeExpiresInMs / 60_000)} minutes.`,
      'No action is required if this code was not requested by you.',
    ]);
  }

  async sendProfileEmailVerificationCode(email: string) {
    return this.sendCode('profile-email', email, 'Profile email verification code', (code) => [
      `Your profile email verification code is ${code}.`,
      `This code expires in ${Math.ceil(this.codeExpiresInMs / 60_000)} minutes.`,
      'No action is required if this code was not requested by you.',
    ]);
  }

  async sendMfaCode(email: string) {
    return this.sendCode('mfa', email, 'Security verification code', (code) => [
      `Your security verification code is ${code}.`,
      `This code expires in ${Math.ceil(this.codeExpiresInMs / 60_000)} minutes.`,
      'No action is required if this code was not requested by you.',
    ]);
  }

  async verifyRegistrationCode(email: string, code?: string) {
    if (!this.sender) {
      return;
    }

    await this.verifyCode('registration', email, code);
  }

  async verifyPasswordResetCode(email: string, code?: string) {
    if (!this.sender) {
      throw new AppError('EMAIL_VERIFICATION_DISABLED', 'Email verification is disabled.', 404);
    }

    await this.verifyCode('password-reset', email, code);
  }

  async verifyProfileEmailVerificationCode(email: string, code?: string) {
    if (!this.sender) {
      throw new AppError('EMAIL_VERIFICATION_DISABLED', 'Email verification is disabled.', 404);
    }

    await this.verifyCode('profile-email', email, code);
  }

  async verifyMfaCode(email: string, code?: string) {
    if (!this.sender) {
      throw new AppError('EMAIL_VERIFICATION_DISABLED', 'Email verification is disabled.', 404);
    }

    await this.verifyCode('mfa', email, code);
  }

  private async sendCode(
    purpose: VerificationPurpose,
    email: string,
    subject: string,
    createText: (code: string) => string[],
  ) {
    if (!this.sender) {
      throw new AppError('EMAIL_VERIFICATION_DISABLED', 'Email verification is disabled.', 404);
    }

    const normalizedEmail = normalizeEmail(email);
    const recordKey = getRecordKey(purpose, normalizedEmail);
    const sendLockKey = getSendLockKey(purpose, normalizedEmail);
    const sendLockOwner = `${process.pid}:${randomUUID()}`;
    const existing = await this.cacheStore.get<VerificationRecord>(recordKey);
    const now = Date.now();

    if (existing && existing.nextSendAt > now) {
      throw new AppError('EMAIL_VERIFICATION_COOLDOWN', 'Email verification code was sent recently.', 429, {
        retryAfterSeconds: Math.ceil((existing.nextSendAt - now) / 1000),
      });
    }

    const sendLockAcquired = await this.cacheStore.acquireLock(sendLockKey, sendLockOwner, this.codeCooldownMs);

    if (!sendLockAcquired) {
      const current = await this.cacheStore.get<VerificationRecord>(recordKey);
      const retryAfterMs =
        current?.nextSendAt && current.nextSendAt > Date.now() ? current.nextSendAt - Date.now() : this.codeCooldownMs;

      throw new AppError('EMAIL_VERIFICATION_COOLDOWN', 'Email verification code was sent recently.', 429, {
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      });
    }

    const code = createVerificationCode();

    try {
      await this.sender.send({
        to: normalizedEmail,
        subject,
        text: createText(code).join('\n'),
      });

      await this.cacheStore.set(
        recordKey,
        {
          attemptsRemaining: maxVerificationAttempts,
          codeHash: this.hashVerificationCode(purpose, normalizedEmail, code),
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

  private async verifyCode(purpose: VerificationPurpose, email: string, code?: string) {
    if (!code) {
      throw new AppError('EMAIL_VERIFICATION_REQUIRED', 'Email verification code is required.', 400);
    }

    const normalizedEmail = normalizeEmail(email);
    const recordKey = getRecordKey(purpose, normalizedEmail);

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

      if (this.isVerificationCodeMatch(record.codeHash, purpose, normalizedEmail, code)) {
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

    throw new AppError(
      'EMAIL_VERIFICATION_CONFLICT',
      'Email verification state changed. Submit the request again.',
      409,
    );
  }

  private hashVerificationCode(purpose: VerificationPurpose, email: string, code: string) {
    return createHmac('sha256', this.verificationSecret)
      .update(`${purpose}:${email}:${code}`, 'utf8')
      .digest('base64url');
  }

  private isVerificationCodeMatch(expectedHash: string, purpose: VerificationPurpose, email: string, code: string) {
    const expected = Buffer.from(expectedHash, 'base64url');
    const candidate = Buffer.from(this.hashVerificationCode(purpose, email, code), 'base64url');

    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }

  private createDeliveryMetadata() {
    return {
      cooldownSeconds: Math.ceil(this.codeCooldownMs / 1000),
      expiresInSeconds: Math.ceil(this.codeExpiresInMs / 1000),
    };
  }

  private async releaseSendLock(sendLockKey: string, owner: string) {
    try {
      await this.cacheStore.releaseLock(sendLockKey, owner);
    } catch {
      // The send lock has a short TTL; do not mask the original delivery operation failure.
    }
  }
}

export class SmtpEmailSender implements EmailSender {
  constructor(private readonly config: SmtpEmailSenderConfig) {}

  async check() {
    const transporter = createSmtpTransport(this.config);

    try {
      await transporter.verify();
    } finally {
      transporter.close();
    }
  }

  async send(input: SendEmailInput) {
    const transporter = createSmtpTransport(this.config);

    try {
      await transporter.sendMail({
        from: this.config.from,
        subject: input.subject,
        text: input.text,
        to: input.to,
      });
    } finally {
      transporter.close();
    }
  }
}

export class SmtpEmailSenderPool implements EmailSender {
  private readonly selectProfileIndex: (profileCount: number) => number;
  private readonly senders: EmailSender[];

  constructor(configs: SmtpEmailSenderConfig[], options: SmtpEmailSenderPoolOptions = {}) {
    if (configs.length === 0) {
      throw new AppError('EMAIL_SMTP_PROFILES_EMPTY', 'At least one SMTP profile is required.', 500);
    }

    this.selectProfileIndex = options.selectProfileIndex ?? randomInt;
    this.senders = configs.map(options.createSender ?? ((config) => new SmtpEmailSender(config)));
  }

  async send(input: SendEmailInput) {
    await this.getRandomSender().send(input);
  }

  private getRandomSender() {
    const profileIndex = this.selectProfileIndex(this.senders.length);

    if (!Number.isInteger(profileIndex) || profileIndex < 0 || profileIndex >= this.senders.length) {
      throw new AppError('SMTP_PROFILE_SELECTION_INVALID', 'SMTP profile selection returned an invalid index.', 500);
    }

    return this.senders[profileIndex]!;
  }
}

function createVerificationCode() {
  return randomInt(0, 10 ** verificationCodeLength)
    .toString()
    .padStart(verificationCodeLength, '0');
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getRecordKey(purpose: VerificationPurpose, email: string) {
  return `email-verification:${purpose}:${email}`;
}

function getSendLockKey(purpose: VerificationPurpose, email: string) {
  return `email-verification-send-lock:${purpose}:${email}`;
}

function throwInvalidVerificationCode(): never {
  throw new AppError('EMAIL_VERIFICATION_INVALID', 'Email verification code is invalid or expired.', 400);
}

function createSmtpTransport(config: SmtpEmailSenderConfig) {
  const options: SMTPTransport.Options = {
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    host: config.host,
    ignoreTLS: !config.secure && !config.startTls,
    port: config.port,
    requireTLS: !config.secure && config.startTls,
    secure: config.secure,
    socketTimeout: config.timeoutMs,
    tls: {
      servername: config.host,
    },
    ...(config.username && config.password
      ? {
          auth: {
            pass: config.password,
            user: config.username,
          },
        }
      : {}),
  };

  return nodemailer.createTransport(options);
}
