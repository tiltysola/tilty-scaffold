import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { once } from 'events';
import { connect as connectSocket, type Socket } from 'net';
import { connect as connectTlsSocket, type TLSSocket } from 'tls';

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

interface VerificationRecord {
  attemptsRemaining: number;
  codeHash: string;
  expiresAt: number;
  nextSendAt: number;
}

type VerificationPurpose = 'password-reset' | 'registration';

interface SmtpResponse {
  code: number;
  message: string;
}

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

    throw new AppError('EMAIL_VERIFICATION_CONFLICT', 'Email verification state changed. Try again.', 409);
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

  async send(input: SendEmailInput) {
    const client = await SmtpClient.connect(this.config);

    try {
      await client.expect([220]);
      await client.ehlo();

      if (!this.config.secure && this.config.startTls) {
        await client.startTls();
        await client.ehlo();
      }

      if (this.config.username && this.config.password) {
        await client.authPlain(this.config.username, this.config.password);
      }

      await client.sendMail(this.config.from, input.to, createMessage(this.config.from, input));
      await client.quit();
    } finally {
      client.close();
    }
  }
}

class SmtpClient {
  private buffer = '';
  private socket: Socket | TLSSocket;

  private constructor(
    socket: Socket | TLSSocket,
    private readonly config: SmtpEmailSenderConfig,
  ) {
    this.socket = socket;
    this.socket.setEncoding('utf8');
    this.socket.setTimeout(config.timeoutMs);
  }

  static async connect(config: SmtpEmailSenderConfig) {
    const socket = config.secure
      ? connectTlsSocket({
          host: config.host,
          port: config.port,
          servername: config.host,
        })
      : connectSocket({
          host: config.host,
          port: config.port,
        });

    socket.setTimeout(config.timeoutMs);
    await waitForSocketEvent(socket, config.secure ? 'secureConnect' : 'connect');

    return new SmtpClient(socket, config);
  }

  async expect(expectedCodes: number[]) {
    const response = await this.readResponse();

    if (!expectedCodes.includes(response.code)) {
      throw new AppError('SMTP_RESPONSE_INVALID', 'SMTP server returned an unexpected response.', 502);
    }

    return response;
  }

  async ehlo() {
    await this.command('EHLO localhost', [250]);
  }

  async startTls() {
    await this.command('STARTTLS', [220]);

    this.socket.removeAllListeners();
    this.buffer = '';
    this.socket = connectTlsSocket({
      socket: this.socket,
      servername: this.config.host,
    });
    this.socket.setEncoding('utf8');
    this.socket.setTimeout(this.config.timeoutMs);

    await waitForSocketEvent(this.socket, 'secureConnect');
  }

  async authPlain(username: string, password: string) {
    const token = Buffer.from(`\u0000${username}\u0000${password}`, 'utf8').toString('base64');

    await this.command(`AUTH PLAIN ${token}`, [235]);
  }

  async sendMail(from: string, to: string, message: string) {
    await this.command(`MAIL FROM:<${extractEmailAddress(from)}>`, [250]);
    await this.command(`RCPT TO:<${extractEmailAddress(to)}>`, [250, 251]);
    await this.command('DATA', [354]);
    await this.write(`${dotStuff(message)}\r\n.\r\n`);
    await this.expect([250]);
  }

  async quit() {
    await this.command('QUIT', [221]);
  }

  close() {
    this.socket.destroy();
  }

  private async command(value: string, expectedCodes: number[]) {
    await this.write(`${value}\r\n`);
    return this.expect(expectedCodes);
  }

  private async write(value: string) {
    if (!this.socket.write(value, 'utf8')) {
      await once(this.socket, 'drain');
    }
  }

  private async readResponse(): Promise<SmtpResponse> {
    const lines: string[] = [];

    while (true) {
      const line = await this.readLine();
      lines.push(line);

      const match = /^(\d{3})([ -])/.exec(line);

      if (match?.[2] === ' ') {
        return {
          code: Number(match[1]),
          message: lines.join('\n'),
        };
      }
    }
  }

  private async readLine() {
    while (true) {
      const lineEnd = this.buffer.indexOf('\n');

      if (lineEnd >= 0) {
        const line = this.buffer.slice(0, lineEnd + 1);
        this.buffer = this.buffer.slice(lineEnd + 1);

        return line.replace(/\r?\n$/, '');
      }

      const chunk = await this.readChunk();
      this.buffer += chunk;
    }
  }

  private async readChunk() {
    return new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        this.socket.off('close', handleClose);
        this.socket.off('data', handleData);
        this.socket.off('error', handleError);
        this.socket.off('timeout', handleTimeout);
      };
      const handleClose = () => {
        cleanup();
        reject(new AppError('SMTP_CONNECTION_CLOSED', 'SMTP connection was closed unexpectedly.', 502));
      };
      const handleData = (chunk: Buffer | string) => {
        cleanup();
        resolve(String(chunk));
      };
      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const handleTimeout = () => {
        cleanup();
        reject(new AppError('SMTP_TIMEOUT', 'SMTP request timed out.', 502));
      };

      this.socket.once('close', handleClose);
      this.socket.once('data', handleData);
      this.socket.once('error', handleError);
      this.socket.once('timeout', handleTimeout);
    });
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

function createMessage(from: string, input: SendEmailInput) {
  return [
    `From: ${sanitizeHeader(from)}`,
    `To: ${sanitizeHeader(input.to)}`,
    `Subject: ${sanitizeHeader(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
  ].join('\r\n');
}

function dotStuff(message: string) {
  return message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function extractEmailAddress(value: string) {
  const match = /<([^<>]+)>/.exec(value);

  return sanitizeHeader(match?.[1] ?? value);
}

function waitForSocketEvent(socket: Socket | TLSSocket, event: 'connect' | 'secureConnect') {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off(event, handleReady);
      socket.off('error', handleError);
      socket.off('timeout', handleTimeout);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleTimeout = () => {
      cleanup();
      reject(new AppError('SMTP_TIMEOUT', 'SMTP request timed out.', 502));
    };

    socket.once(event, handleReady);
    socket.once('error', handleError);
    socket.once('timeout', handleTimeout);
  });
}
