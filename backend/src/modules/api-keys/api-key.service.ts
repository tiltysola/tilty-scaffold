import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Op, type Transaction } from 'sequelize';

import { hasPermission as hasGrantedPermission, SystemPermission } from '@tilty/shared/access-control';
import {
  apiKeyActiveLimitPerUser,
  apiKeyChecksumLength,
  apiKeyChecksumPatternSource,
  type ApiKeyCreateInput,
  apiKeyIdLength,
  apiKeyIdPatternSource,
  apiKeyPrefix,
  apiKeySecretLength,
  apiKeySecretPatternSource,
  type ApiKeySummary,
} from '@tilty/shared/api-keys';

import { AppError } from '../../core/errors';
import { type AccessControlService, type UserAccess } from '../access-control/access-control.service';
import { toAuthUser } from '../auth/auth.service';
import { type UserService } from '../users/user.service';
import { type ApiKeyAuditEventModel, type ApiKeyModel } from './api-key.model';

interface ApiKeyRequestContext {
  ipAddress: string;
  userAgent: string;
}

interface CreateApiKeyOptions {
  actorUserId: string;
  context: ApiKeyRequestContext;
  userId: string;
}

interface MutateApiKeyOptions {
  actorAccess?: UserAccess;
  actorUserId: string;
  context: ApiKeyRequestContext;
  keyId: string;
  userId?: string;
}

const hashSecretVersion = 'v1';
const keyIdPattern = new RegExp(`^${apiKeyIdPatternSource}$`);
const keyChecksumPattern = new RegExp(`^${apiKeyChecksumPatternSource}$`);
const secretPattern = new RegExp(`^${apiKeySecretPatternSource}$`);

export class ApiKeyService {
  private readonly createLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly apiKeyModel: typeof ApiKeyModel,
    private readonly auditEventModel: typeof ApiKeyAuditEventModel,
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
    private readonly hashingSecret: string,
  ) {}

  async create(input: ApiKeyCreateInput, options: CreateApiKeyOptions) {
    return this.withInProcessCreateLock(options.userId, async () => {
      const sequelize = this.apiKeyModel.sequelize;

      if (!sequelize) {
        throw new Error('API Key model is not initialized.');
      }

      return sequelize.transaction(async (transaction) => {
        await this.assertActiveKeyLimit(options.userId, transaction);

        const keyId = createKeyId();
        const secret = createRandomToken(apiKeySecretLength);
        const checksum = createChecksum(keyId, secret);
        const plainKey = `${apiKeyPrefix}_${keyId}_${secret}_${checksum}`;
        const key = await this.apiKeyModel.create(
          {
            id: keyId,
            userId: options.userId,
            name: input.name,
            description: input.description ?? null,
            keyPrefix: `${apiKeyPrefix}_${keyId}`,
            keySuffix: checksum,
            keyHash: this.hashKey(keyId, secret),
            hashSecretVersion,
            fingerprint: this.fingerprint(plainKey),
            status: 'active',
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            lastUsedAt: null,
            lastUsedIp: null,
            lastUsedUserAgentHash: null,
            requestCount: 0,
            createdByUserId: options.actorUserId,
            revokedByUserId: null,
            revokedAt: null,
          },
          { transaction },
        );

        await this.recordAuditEvent(key.id, options.actorUserId, 'created', options.context, transaction);

        return {
          ...toApiKeySummary(key),
          plainKey,
        };
      });
    });
  }

  async authenticate(plainKey: string, context: ApiKeyRequestContext) {
    const parsed = parsePlainApiKey(plainKey);

    if (!parsed) {
      throwInvalidApiKey();
    }

    const key = await this.apiKeyModel.findByPk(parsed.keyId);

    if (!key) {
      throwInvalidApiKey();
    }

    assertApiKeyHash(this.hashKey(parsed.keyId, parsed.secret), key.keyHash);

    if (key.status === 'disabled') {
      throw new AppError('API_KEY_DISABLED', 'error.API_KEY_DISABLED', 401);
    }

    if (key.status === 'revoked') {
      throw new AppError('API_KEY_REVOKED', 'error.API_KEY_REVOKED', 401);
    }

    if (isExpired(key)) {
      await this.markExpired(key);
      throw new AppError('API_KEY_EXPIRED', 'error.API_KEY_EXPIRED', 401);
    }

    const user = await this.userService.findById(key.userId);

    if (!user || !user.available) {
      throw new AppError('API_KEY_INVALID', 'error.API_KEY_INVALID', 401);
    }

    const access = await this.accessControl.getUserAccess(user.id);
    const now = new Date();

    await this.apiKeyModel.update(
      {
        lastUsedAt: now,
        lastUsedIp: normalizeIpAddress(context.ipAddress),
        lastUsedUserAgentHash: this.hashSensitiveValue(context.userAgent || 'unknown'),
      },
      {
        where: {
          id: key.id,
        },
      },
    );
    await this.apiKeyModel.increment('requestCount', {
      by: 1,
      where: {
        id: key.id,
      },
    });

    return {
      access,
      apiKeyFingerprint: key.fingerprint,
      apiKeyId: key.id,
      authMethod: 'apiKey' as const,
      authUser: toAuthUser(user, access),
      user,
    };
  }

  async listForUser(userId: string) {
    const keys = await this.apiKeyModel.findAll({
      where: {
        userId,
      },
      order: [
        ['createdAt', 'DESC'],
        ['name', 'ASC'],
      ],
    });

    return {
      keys: keys.map(toApiKeySummary),
      limit: apiKeyActiveLimitPerUser,
    };
  }

  async listForAdmin(actorAccess: UserAccess) {
    const keys = await this.apiKeyModel.findAll({
      order: [
        ['createdAt', 'DESC'],
        ['name', 'ASC'],
      ],
    });
    const accessByUserId = await this.accessControl.getUsersAccess([...new Set(keys.map((key) => key.userId))]);
    const visibleKeys = keys.filter((key) => {
      const targetAccess = accessByUserId.get(key.userId);

      return (
        hasGrantedPermission(actorAccess.permissions, SystemPermission.Root) ||
        !hasGrantedPermission(targetAccess?.permissions, SystemPermission.UserAdmin)
      );
    });

    return {
      keys: visibleKeys.map(toApiKeySummary),
      limit: apiKeyActiveLimitPerUser,
    };
  }

  async disable(options: MutateApiKeyOptions) {
    const key = await this.requireKey(options.keyId, options.userId);

    if (key.status === 'revoked') {
      throw new AppError('API_KEY_REVOKED', 'error.API_KEY_REVOKED', 401);
    }

    key.status = 'disabled';
    await key.save();
    await this.recordAuditEvent(key.id, options.actorUserId, 'disabled', options.context);

    return toApiKeySummary(key);
  }

  async enable(options: MutateApiKeyOptions) {
    const key = await this.requireKey(options.keyId, options.userId);

    if (key.status === 'revoked') {
      throw new AppError('API_KEY_REVOKED', 'error.API_KEY_REVOKED', 401);
    }

    if (isExpired(key)) {
      await this.markExpired(key);
      throw new AppError('API_KEY_EXPIRED', 'error.API_KEY_EXPIRED', 401);
    }

    key.status = 'active';
    await key.save();
    await this.recordAuditEvent(key.id, options.actorUserId, 'enabled', options.context);

    return toApiKeySummary(key);
  }

  async revoke(options: MutateApiKeyOptions) {
    const key = await this.requireKey(options.keyId, options.userId);

    if (options.actorAccess) {
      await this.accessControl.assertCanManageUser(options.actorAccess, key.userId);
    }

    key.status = 'revoked';
    key.revokedByUserId = options.actorUserId;
    key.revokedAt = new Date();
    await key.save();
    await this.recordAuditEvent(key.id, options.actorUserId, 'revoked', options.context);

    return toApiKeySummary(key);
  }

  private async assertActiveKeyLimit(userId: string, transaction?: Transaction | undefined) {
    const activeCount = await this.apiKeyModel.count({
      ...(transaction ? { transaction } : {}),
      where: {
        userId,
        status: {
          [Op.in]: ['active', 'disabled'],
        },
        [Op.or]: [
          {
            expiresAt: null,
          },
          {
            expiresAt: {
              [Op.gt]: new Date(),
            },
          },
        ],
      },
    });

    if (activeCount >= apiKeyActiveLimitPerUser) {
      throw new AppError('API_KEY_CREATE_LIMIT_EXCEEDED', 'error.API_KEY_CREATE_LIMIT_EXCEEDED', 409);
    }
  }

  private async withInProcessCreateLock<T>(userId: string, callback: () => Promise<T>) {
    const previous = this.createLocks.get(userId) ?? Promise.resolve();
    const waitForPrevious = previous.catch(() => undefined);
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = waitForPrevious.then(() => current);

    this.createLocks.set(userId, tail);
    await waitForPrevious;

    try {
      return await callback();
    } finally {
      release();

      if (this.createLocks.get(userId) === tail) {
        this.createLocks.delete(userId);
      }
    }
  }

  private async requireKey(keyId: string, userId?: string | undefined) {
    const key = await this.apiKeyModel.findByPk(keyId);

    if (!key || (userId && key.userId !== userId)) {
      throw new AppError('API_KEY_NOT_FOUND', 'error.API_KEY_NOT_FOUND', 404);
    }

    return key;
  }

  private async markExpired(key: ApiKeyModel) {
    if (key.status === 'expired') {
      return;
    }

    key.status = 'expired';
    await key.save();
  }

  private hashKey(keyId: string, secret: string) {
    return createHmac('sha256', this.hashingSecret).update(`${keyId}.${secret}`).digest('base64url');
  }

  private fingerprint(plainKey: string) {
    return createHash('sha256').update(plainKey).digest('base64url').slice(0, 32);
  }

  private hashSensitiveValue(value: string) {
    return createHmac('sha256', this.hashingSecret).update(value).digest('base64url');
  }

  private async recordAuditEvent(
    keyId: string,
    actorUserId: string,
    eventType: string,
    context: ApiKeyRequestContext,
    transaction?: Transaction | undefined,
  ) {
    await this.auditEventModel.create(
      {
        keyId,
        actorUserId,
        eventType,
        sourceIp: normalizeIpAddress(context.ipAddress),
      },
      transaction ? { transaction } : {},
    );
  }
}

export function toApiKeySummary(key: ApiKeyModel): ApiKeySummary {
  return {
    id: key.id,
    userId: key.userId,
    name: key.name,
    ...(key.description ? { description: key.description } : {}),
    keyPrefix: key.keyPrefix,
    keySuffix: key.keySuffix,
    fingerprint: key.fingerprint,
    status: isExpired(key) && key.status !== 'revoked' ? 'expired' : key.status,
    ...(key.expiresAt ? { expiresAt: key.expiresAt.toISOString() } : {}),
    ...(key.lastUsedAt ? { lastUsedAt: key.lastUsedAt.toISOString() } : {}),
    ...(key.lastUsedIp ? { lastUsedIp: key.lastUsedIp } : {}),
    requestCount: key.requestCount,
    createdAt: key.createdAt.toISOString(),
    updatedAt: key.updatedAt.toISOString(),
    ...(key.revokedAt ? { revokedAt: key.revokedAt.toISOString() } : {}),
  };
}

function parsePlainApiKey(plainKey: string) {
  const parts = plainKey.split('_');

  if (parts.length !== 4 || parts[0] !== apiKeyPrefix) {
    return null;
  }

  const [, keyId, secret, checksum] = parts;

  if (
    !keyId ||
    !secret ||
    !checksum ||
    !keyIdPattern.test(keyId) ||
    !secretPattern.test(secret) ||
    !keyChecksumPattern.test(checksum) ||
    checksum !== createChecksum(keyId, secret)
  ) {
    return null;
  }

  return {
    keyId,
    secret,
  };
}

function createKeyId() {
  return createRandomToken(apiKeyIdLength);
}

function createRandomToken(length: number) {
  let token = '';

  while (token.length < length) {
    token += randomBytes(length)
      .toString('base64url')
      .replace(/[^A-Za-z0-9]/g, '');
  }

  return token.slice(0, length);
}

function createChecksum(keyId: string, secret: string) {
  return createHash('sha256').update(`${keyId}.${secret}`).digest('hex').slice(0, apiKeyChecksumLength);
}

function assertApiKeyHash(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  if (candidateBuffer.length !== expectedBuffer.length || !timingSafeEqual(candidateBuffer, expectedBuffer)) {
    throwInvalidApiKey();
  }
}

function isExpired(key: ApiKeyModel) {
  return Boolean(key.expiresAt && key.expiresAt.getTime() <= Date.now());
}

function normalizeIpAddress(ipAddress: string) {
  return ipAddress.trim().slice(0, 64) || '0.0.0.0';
}

function throwInvalidApiKey(): never {
  throw new AppError('API_KEY_INVALID', 'error.API_KEY_INVALID', 401);
}
