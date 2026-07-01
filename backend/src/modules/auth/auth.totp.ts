import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createSecretKey,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';

import { AppError } from '../../core/errors';
import { type CacheStore } from '../../infra/cache';
import { type UserModel } from '../users/user.model';

interface TotpSetupRecord {
  expiresAt: number;
  secretEncrypted: string;
  used: boolean;
  userId: string;
}

interface RecoveryCodeHashRecord {
  hash: string;
  salt: string;
}

export interface VerifyTotpInput {
  code?: string | undefined;
  recoveryCode?: string | undefined;
}

export interface TotpConfig {
  issuer: string;
  setupTtlMs: number;
}

const setupCacheKeyPrefix = 'auth:totp-setup:';
const totpPeriodSeconds = 30;
const totpDigits = 6;
const totpEpochToleranceSeconds = totpPeriodSeconds;
const recoveryCodeCount = 10;
const recoveryCodeLength = 12;
const recoveryCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const defaultTotpConfig: TotpConfig = {
  issuer: 'Tilty Scaffold',
  setupTtlMs: 10 * 60_000,
};

export class TotpService {
  constructor(
    private readonly userModel: typeof UserModel,
    private readonly cacheStore: CacheStore,
    private readonly encryptionSecret: string,
    private readonly config: TotpConfig = defaultTotpConfig,
  ) {}

  getStatus(user: UserModel) {
    return {
      enabled: user.totpEnabled,
      recoveryCodesRemaining: getRecoveryCodeHashes(user).length,
    };
  }

  async createSetup(user: UserModel) {
    if (user.totpEnabled) {
      throw new AppError('TOTP_ALREADY_ENABLED', 'error.TOTP_ALREADY_ENABLED', 409);
    }

    const secret = generateBase32Secret();
    const setupToken = randomUUID();
    const expiresAt = Date.now() + this.config.setupTtlMs;

    await this.cacheStore.set<TotpSetupRecord>(
      getSetupCacheKey(setupToken),
      {
        expiresAt,
        secretEncrypted: this.encryptSecret(secret),
        used: false,
        userId: user.id,
      },
      this.config.setupTtlMs,
    );

    return {
      setupToken,
      secret,
      otpauthUrl: createOtpAuthUrl(user.email || user.username, secret, this.config.issuer),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async enable(user: UserModel, setupToken: string, code: string) {
    if (user.totpEnabled) {
      throw new AppError('TOTP_ALREADY_ENABLED', 'error.TOTP_ALREADY_ENABLED', 409);
    }

    const setupRecord = await this.requireSetupToken(user.id, setupToken);
    const secret = this.decryptSecret(setupRecord.secretEncrypted);

    if (!(await verifyTotpCode(secret, code))) {
      throw new AppError('TOTP_CODE_INVALID', 'error.TOTP_CODE_INVALID', 401);
    }

    await this.consumeSetupToken(setupToken, setupRecord);

    const recoveryCodes = generateRecoveryCodes();

    user.totpEnabled = true;
    user.totpSecretEncrypted = this.encryptSecret(secret);
    user.totpRecoveryCodeHashes = JSON.stringify(
      recoveryCodes.map((recoveryCode) => this.hashRecoveryCode(recoveryCode)),
    );
    await user.save();

    return {
      recoveryCodes,
    };
  }

  async disable(user: UserModel) {
    if (!user.totpEnabled) {
      throw new AppError('TOTP_NOT_ENABLED', 'error.TOTP_NOT_ENABLED', 409);
    }

    user.totpEnabled = false;
    user.totpSecretEncrypted = null;
    user.totpRecoveryCodeHashes = null;
    await user.save();

    return {
      disabled: true,
    } as const;
  }

  async regenerateRecoveryCodes(user: UserModel) {
    this.assertTotpEnabled(user);

    const recoveryCodes = generateRecoveryCodes();

    user.totpRecoveryCodeHashes = JSON.stringify(
      recoveryCodes.map((recoveryCode) => this.hashRecoveryCode(recoveryCode)),
    );
    await user.save();

    return {
      recoveryCodes,
    };
  }

  async verifyUserSecondFactor(user: UserModel, input: VerifyTotpInput) {
    this.assertTotpEnabled(user);

    if (input.code) {
      const secret = this.getUserTotpSecret(user);

      return verifyTotpCode(secret, input.code);
    }

    if (input.recoveryCode) {
      return this.consumeRecoveryCode(user.id, input.recoveryCode);
    }

    throw new AppError('TOTP_CODE_REQUIRED', 'error.TOTP_CODE_REQUIRED', 400);
  }

  private async requireSetupToken(userId: string, setupToken: string) {
    const key = getSetupCacheKey(setupToken);
    const record = await this.cacheStore.get<TotpSetupRecord>(key);

    if (!record || record.userId !== userId || record.used || record.expiresAt <= Date.now()) {
      await this.cacheStore.delete(key);
      throw new AppError('TOTP_SETUP_TOKEN_INVALID', 'error.TOTP_SETUP_TOKEN_INVALID', 401);
    }

    return record;
  }

  private async consumeSetupToken(setupToken: string, record: TotpSetupRecord) {
    const key = getSetupCacheKey(setupToken);
    const remainingTtlMs = record.expiresAt - Date.now();

    if (remainingTtlMs <= 0) {
      await this.cacheStore.delete(key);
      throw new AppError('TOTP_SETUP_TOKEN_INVALID', 'error.TOTP_SETUP_TOKEN_INVALID', 401);
    }

    const consumed = await this.cacheStore.compareAndSet(
      key,
      record,
      {
        ...record,
        used: true,
      },
      remainingTtlMs,
    );

    if (!consumed) {
      throw new AppError('TOTP_SETUP_TOKEN_CONFLICT', 'error.TOTP_SETUP_TOKEN_CONFLICT', 409);
    }

    await this.cacheStore.delete(key);
  }

  private getUserTotpSecret(user: UserModel) {
    if (!user.totpSecretEncrypted) {
      throw new AppError('TOTP_NOT_ENABLED', 'error.TOTP_NOT_ENABLED', 409);
    }

    return this.decryptSecret(user.totpSecretEncrypted);
  }

  private async consumeRecoveryCode(userId: string, inputCode: string) {
    const sequelize = this.userModel.sequelize;

    if (!sequelize) {
      throw new Error('User model is not initialized.');
    }

    return sequelize.transaction(async (transaction) => {
      const user = await this.userModel.findOne({
        lock: transaction.LOCK.UPDATE,
        transaction,
        where: {
          id: userId,
          available: true,
        },
      });

      if (!user || !user.totpEnabled) {
        return false;
      }

      const hashes = getRecoveryCodeHashes(user);
      const index = hashes.findIndex((record) => this.matchesRecoveryCode(inputCode, record));

      if (index === -1) {
        return false;
      }

      hashes.splice(index, 1);
      user.totpRecoveryCodeHashes = JSON.stringify(hashes);
      await user.save({ transaction });

      return true;
    });
  }

  private assertTotpEnabled(user: UserModel) {
    if (!user.totpEnabled || !user.totpSecretEncrypted) {
      throw new AppError('TOTP_NOT_ENABLED', 'error.TOTP_NOT_ENABLED', 409);
    }
  }

  private encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  private decryptSecret(encryptedSecret: string) {
    const [version, iv, tag, encrypted] = encryptedSecret.split(':');

    if (version !== 'v1' || !iv || !tag || !encrypted) {
      throw new AppError('TOTP_SECRET_INVALID', 'error.TOTP_SECRET_INVALID', 500);
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.getEncryptionKey(), Buffer.from(iv, 'base64url'));

      decipher.setAuthTag(Buffer.from(tag, 'base64url'));

      return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new AppError('TOTP_SECRET_INVALID', 'error.TOTP_SECRET_INVALID', 500);
    }
  }

  private getEncryptionKey() {
    return createSecretKey(createHmac('sha256', this.encryptionSecret).update('totp-secret-encryption').digest());
  }

  private hashRecoveryCode(recoveryCode: string): RecoveryCodeHashRecord {
    const salt = randomBytes(16).toString('base64url');
    const hash = createHmac('sha256', this.encryptionSecret)
      .update(`${salt}:${normalizeRecoveryCode(recoveryCode)}`)
      .digest('base64url');

    return {
      hash,
      salt,
    };
  }

  private matchesRecoveryCode(inputCode: string, record: RecoveryCodeHashRecord) {
    const candidate = createHmac('sha256', this.encryptionSecret)
      .update(`${record.salt}:${normalizeRecoveryCode(inputCode)}`)
      .digest('base64url');
    const candidateBuffer = Buffer.from(candidate);
    const expectedBuffer = Buffer.from(record.hash);

    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  }
}

function generateBase32Secret() {
  return generateSecret({
    length: 20,
  });
}

function createOtpAuthUrl(label: string, secret: string, issuer: string) {
  return generateURI({
    algorithm: 'sha1',
    digits: totpDigits,
    issuer,
    label,
    period: totpPeriodSeconds,
    secret,
  });
}

async function verifyTotpCode(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  try {
    const result = await verify({
      algorithm: 'sha1',
      digits: totpDigits,
      epochTolerance: totpEpochToleranceSeconds,
      period: totpPeriodSeconds,
      secret,
      token: code,
    });

    return result.valid;
  } catch {
    throw new AppError('TOTP_SECRET_INVALID', 'error.TOTP_SECRET_INVALID', 500);
  }
}

function generateRecoveryCodes() {
  return Array.from({ length: recoveryCodeCount }, () => formatRecoveryCode(generateRecoveryCode()));
}

function generateRecoveryCode() {
  let code = '';

  while (code.length < recoveryCodeLength) {
    const byte = randomBytes(1)[0]!;

    if (byte < Math.floor(256 / recoveryCodeAlphabet.length) * recoveryCodeAlphabet.length) {
      code += recoveryCodeAlphabet[byte % recoveryCodeAlphabet.length];
    }
  }

  return code;
}

function formatRecoveryCode(code: string) {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getRecoveryCodeHashes(user: UserModel) {
  if (!user.totpRecoveryCodeHashes) {
    return [];
  }

  try {
    const parsed = JSON.parse(user.totpRecoveryCodeHashes) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isRecoveryCodeHashRecord);
  } catch {
    return [];
  }
}

function isRecoveryCodeHashRecord(value: unknown): value is RecoveryCodeHashRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record.hash === 'string' && typeof record.salt === 'string';
}

function getSetupCacheKey(token: string) {
  return `${setupCacheKeyPrefix}${token}`;
}
