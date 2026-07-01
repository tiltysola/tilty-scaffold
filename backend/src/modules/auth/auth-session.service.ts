import { createHash, createHmac } from 'crypto';
import { Op } from 'sequelize';

import { AuthSessionDeviceType, type AuthSessionDeviceTypeValue } from '@tilty/shared/auth';

import { AppError } from '../../core/errors';
import { type AuthSessionModel } from './auth-session.model';

type DeviceType = AuthSessionDeviceTypeValue;

export interface AuthSessionRequestContext {
  deviceId?: string | undefined;
  ipAddress: string;
  userAgent: string;
}

interface PersistSessionInput {
  expiresAt: string;
  sessionId: string;
  userId: string;
}

export interface AuthDeviceSession {
  id: string;
  deviceName: string;
  deviceType: DeviceType;
  browser: string;
  os: string;
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

const unknownBrowser = 'Unknown browser';
const unknownOs = 'Unknown OS';
const unknownDevice = 'Unknown device';

export class AuthSessionService {
  constructor(
    private readonly sessionModel: typeof AuthSessionModel,
    private readonly hashingSecret: string,
  ) {}

  async persistSession(input: PersistSessionInput, context: AuthSessionRequestContext) {
    const now = new Date();
    const parsedDevice = parseUserAgent(context.userAgent);
    const deviceId = normalizeDeviceId(context.deviceId);
    const deviceIdHash = deviceId ? this.hashSensitiveValue(deviceId) : null;
    const values = {
      userId: input.userId,
      deviceIdHash,
      deviceName: parsedDevice.deviceName,
      deviceType: parsedDevice.deviceType,
      browser: parsedDevice.browser,
      os: parsedDevice.os,
      ipAddress: normalizeIpAddress(context.ipAddress),
      userAgentHash: this.hashSensitiveValue(context.userAgent || 'unknown'),
      lastActiveAt: now,
      expiresAt: new Date(input.expiresAt),
      revokedAt: null,
    };

    await this.sessionModel.upsert({
      id: input.sessionId,
      ...values,
    });
  }

  async assertSessionActive(sessionId: string, userId: string) {
    const session = await this.sessionModel.findOne({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new AppError('AUTH_SESSION_INVALID', 'error.AUTH_SESSION_INVALID', 401);
    }
  }

  async touchSession(sessionId: string, userId: string, context: AuthSessionRequestContext) {
    const session = await this.sessionModel.findOne({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
    });

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new AppError('AUTH_SESSION_INVALID', 'error.AUTH_SESSION_INVALID', 401);
    }

    const parsedDevice = parseUserAgent(context.userAgent);

    session.deviceName = parsedDevice.deviceName;
    session.deviceType = parsedDevice.deviceType;
    session.browser = parsedDevice.browser;
    session.os = parsedDevice.os;
    session.ipAddress = normalizeIpAddress(context.ipAddress);
    session.userAgentHash = this.hashSensitiveValue(context.userAgent || 'unknown');
    session.lastActiveAt = new Date();

    const deviceId = normalizeDeviceId(context.deviceId);

    if (deviceId) {
      session.deviceIdHash = this.hashSensitiveValue(deviceId);
    }

    await session.save();
  }

  async revokeSession(sessionId: string) {
    await this.sessionModel.update(
      {
        revokedAt: new Date(),
      },
      {
        where: {
          id: sessionId,
          revokedAt: null,
        },
      },
    );
  }

  async revokeUserSession(userId: string, sessionId: string, currentSessionId?: string | undefined) {
    if (currentSessionId && sessionId === currentSessionId) {
      throw new AppError('AUTH_CURRENT_SESSION_REVOKE_FORBIDDEN', 'error.AUTH_CURRENT_SESSION_REVOKE_FORBIDDEN', 400);
    }

    const [updated] = await this.sessionModel.update(
      {
        revokedAt: new Date(),
      },
      {
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
        },
      },
    );

    if (updated === 0) {
      throw new AppError('AUTH_SESSION_NOT_FOUND', 'error.AUTH_SESSION_NOT_FOUND', 404);
    }
  }

  async revokeOtherUserSessions(userId: string, currentSessionId: string) {
    await this.sessionModel.update(
      {
        revokedAt: new Date(),
      },
      {
        where: {
          userId,
          id: {
            [Op.ne]: currentSessionId,
          },
          revokedAt: null,
        },
      },
    );
  }

  async revokeAllUserSessions(userId: string) {
    await this.sessionModel.update(
      {
        revokedAt: new Date(),
      },
      {
        where: {
          userId,
          revokedAt: null,
        },
      },
    );
  }

  async listUserSessions(userId: string, currentSessionId = ''): Promise<AuthDeviceSession[]> {
    const sessions = await this.sessionModel.findAll({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
      order: [
        ['lastActiveAt', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      deviceType: normalizeDeviceType(session.deviceType),
      browser: session.browser,
      os: session.os,
      ipAddress: session.ipAddress,
      lastActiveAt: session.lastActiveAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      isCurrent: session.id === currentSessionId,
    }));
  }

  private hashSensitiveValue(value: string) {
    return createHmac('sha256', this.hashingSecret).update(value).digest('base64url');
  }
}

function normalizeDeviceId(deviceId: string | undefined) {
  const trimmed = deviceId?.trim();

  if (!trimmed || trimmed.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function normalizeIpAddress(ipAddress: string) {
  return ipAddress.trim().slice(0, 64) || '0.0.0.0';
}

function parseUserAgent(userAgent: string) {
  const browser = parseBrowser(userAgent);
  const os = parseOs(userAgent);
  const deviceType = parseDeviceType(userAgent);
  const deviceName = browser === unknownBrowser && os === unknownOs ? unknownDevice : `${browser} on ${os}`;

  return {
    browser,
    os,
    deviceName,
    deviceType,
  };
}

function parseBrowser(userAgent: string) {
  const patterns: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
    [/Safari\/([\d.]+)/, 'Safari'],
  ];

  for (const [pattern, name] of patterns) {
    const match = pattern.exec(userAgent);

    if (match?.[1]) {
      return `${name} ${match[1].split('.')[0]}`;
    }
  }

  return unknownBrowser;
}

function parseOs(userAgent: string) {
  if (/Windows NT/i.test(userAgent)) {
    return 'Windows';
  }

  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'iOS';
  }

  if (/Android/i.test(userAgent)) {
    return 'Android';
  }

  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return 'macOS';
  }

  if (/Linux/i.test(userAgent)) {
    return 'Linux';
  }

  return unknownOs;
}

function parseDeviceType(userAgent: string): DeviceType {
  if (/iPad|Tablet/i.test(userAgent)) {
    return AuthSessionDeviceType.Tablet;
  }

  if (/Mobile|iPhone|Android/i.test(userAgent)) {
    return AuthSessionDeviceType.Mobile;
  }

  return AuthSessionDeviceType.Desktop;
}

function normalizeDeviceType(value: string): DeviceType {
  if (value === AuthSessionDeviceType.Mobile || value === AuthSessionDeviceType.Tablet) {
    return value;
  }

  return AuthSessionDeviceType.Desktop;
}

export function getUserAgentFingerprint(userAgent: string) {
  return createHash('sha256')
    .update(userAgent || 'unknown')
    .digest('base64url');
}
