import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { randomBytes, randomUUID } from 'crypto';

import { AppError } from '../../core/errors';
import { type CacheStore } from '../../infra/cache';
import { type UserModel } from '../users/user.model';
import { type AuthPasskeyModel } from './auth-passkey.model';

export interface PasskeyConfig {
  origin: string;
  rpID: string;
  rpName: string;
  registrationTtlMs: number;
  operationTimeoutMs: number;
}

export interface PasskeyRuntimeConfig {
  rpName: string;
  registrationTtlMs: number;
  operationTimeoutMs: number;
}

export interface VerifyPasskeyRegistrationInput {
  name: string;
  registrationToken: string;
  response: RegistrationResponseJSON;
}

export interface PasskeyRegistrationOptionsResult {
  registrationToken: string;
  options: PublicKeyCredentialCreationOptionsJSON;
  expiresAt: string;
}

interface RegistrationRecord {
  challenge: string;
  expiresAt: number;
  used: boolean;
  userId: string;
  webauthnUserId: string;
}

export interface PasskeySummary {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  transports: AuthenticatorTransportFuture[];
  lastUsedAt?: string | undefined;
  createdAt: string;
}

const registrationCacheKeyPrefix = 'auth:passkey-registration:';

export const defaultPasskeyRuntimeConfig: PasskeyRuntimeConfig = {
  rpName: 'Tilty Scaffold',
  registrationTtlMs: 5 * 60_000,
  operationTimeoutMs: 60_000,
};

export class PasskeyService {
  constructor(
    private readonly passkeyModel: typeof AuthPasskeyModel,
    private readonly cacheStore: CacheStore,
    private readonly config: PasskeyConfig,
  ) {}

  async countUserPasskeys(userId: string) {
    return this.passkeyModel.count({
      where: {
        userId,
      },
    });
  }

  async listUserPasskeys(userId: string): Promise<PasskeySummary[]> {
    const passkeys = await this.passkeyModel.findAll({
      where: {
        userId,
      },
      order: [
        ['createdAt', 'ASC'],
        ['name', 'ASC'],
      ],
    });

    return passkeys.map(toPasskeySummary);
  }

  async createRegistrationOptions(user: UserModel) {
    const passkeys = await this.passkeyModel.findAll({
      where: {
        userId: user.id,
      },
    });
    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpID,
      userName: user.email || user.username,
      userID: randomBytes(32),
      userDisplayName: user.displayName,
      timeout: this.config.operationTimeoutMs,
      attestationType: 'none',
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: parseTransports(passkey.transports),
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });
    const registrationToken = randomUUID();
    const expiresAt = Date.now() + this.config.registrationTtlMs;

    await this.cacheStore.set<RegistrationRecord>(
      getRegistrationCacheKey(registrationToken),
      {
        challenge: options.challenge,
        expiresAt,
        used: false,
        userId: user.id,
        webauthnUserId: options.user.id,
      },
      this.config.registrationTtlMs,
    );

    return {
      registrationToken,
      options,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async verifyRegistration(user: UserModel, input: VerifyPasskeyRegistrationInput) {
    const record = await this.consumeRegistrationToken(user.id, input.registrationToken);
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;

    try {
      verification = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: record.challenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new AppError('PASSKEY_REGISTRATION_INVALID', 'error.PASSKEY_REGISTRATION_INVALID', 401);
    }

    if (!verification.verified) {
      throw new AppError('PASSKEY_REGISTRATION_INVALID', 'error.PASSKEY_REGISTRATION_INVALID', 401);
    }

    const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
    const existing = await this.passkeyModel.findOne({
      where: {
        credentialId: credential.id,
      },
    });

    if (existing) {
      throw new AppError('PASSKEY_EXISTS', 'error.PASSKEY_EXISTS', 409);
    }

    const passkey = await this.passkeyModel.create({
      userId: user.id,
      name: normalizePasskeyName(input.name),
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      webauthnUserId: record.webauthnUserId,
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: serializeTransports(credential.transports),
      lastUsedAt: null,
    });

    return toPasskeySummary(passkey);
  }

  async createAuthenticationOptions(userId: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const passkeys = await this.passkeyModel.findAll({
      where: {
        userId,
      },
    });

    if (passkeys.length === 0) {
      throw new AppError('PASSKEY_NOT_CONFIGURED', 'error.PASSKEY_NOT_CONFIGURED', 409);
    }

    return generateAuthenticationOptions({
      rpID: this.config.rpID,
      timeout: this.config.operationTimeoutMs,
      userVerification: 'required',
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: parseTransports(passkey.transports),
      })),
    });
  }

  async verifyAuthentication(userId: string, expectedChallenge: string, response: AuthenticationResponseJSON) {
    const passkey = await this.passkeyModel.findOne({
      where: {
        credentialId: response.id,
        userId,
      },
    });

    if (!passkey) {
      throw new AppError('PASSKEY_NOT_FOUND', 'error.PASSKEY_NOT_FOUND', 401);
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;

    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.config.origin,
        expectedRPID: this.config.rpID,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: parseTransports(passkey.transports),
        },
      });
    } catch {
      throw new AppError('PASSKEY_AUTHENTICATION_INVALID', 'error.PASSKEY_AUTHENTICATION_INVALID', 401);
    }

    if (!verification.verified) {
      throw new AppError('PASSKEY_AUTHENTICATION_INVALID', 'error.PASSKEY_AUTHENTICATION_INVALID', 401);
    }

    passkey.counter = verification.authenticationInfo.newCounter;
    passkey.deviceType = verification.authenticationInfo.credentialDeviceType;
    passkey.backedUp = verification.authenticationInfo.credentialBackedUp;
    passkey.lastUsedAt = new Date();
    await passkey.save();

    return toPasskeySummary(passkey);
  }

  async deleteUserPasskey(userId: string, passkeyId: string) {
    const deleted = await this.passkeyModel.destroy({
      where: {
        id: passkeyId,
        userId,
      },
    });

    if (deleted === 0) {
      throw new AppError('PASSKEY_NOT_FOUND', 'error.PASSKEY_NOT_FOUND', 404);
    }
  }

  private async consumeRegistrationToken(userId: string, registrationToken: string) {
    const key = getRegistrationCacheKey(registrationToken);
    const record = await this.cacheStore.get<RegistrationRecord>(key);

    if (!record || record.userId !== userId || record.used || record.expiresAt <= Date.now()) {
      await this.cacheStore.delete(key);
      throw new AppError('PASSKEY_REGISTRATION_TOKEN_INVALID', 'error.PASSKEY_REGISTRATION_TOKEN_INVALID', 401);
    }

    const consumed = await this.cacheStore.compareAndSet(
      key,
      record,
      {
        ...record,
        used: true,
      },
      record.expiresAt - Date.now(),
    );

    if (!consumed) {
      throw new AppError('PASSKEY_REGISTRATION_TOKEN_CONFLICT', 'error.PASSKEY_REGISTRATION_TOKEN_CONFLICT', 409);
    }

    await this.cacheStore.delete(key);

    return record;
  }
}

function toPasskeySummary(passkey: AuthPasskeyModel): PasskeySummary {
  return {
    id: passkey.id,
    name: passkey.name,
    deviceType: passkey.deviceType,
    backedUp: passkey.backedUp,
    transports: parseTransports(passkey.transports),
    ...(passkey.lastUsedAt ? { lastUsedAt: passkey.lastUsedAt.toISOString() } : {}),
    createdAt: passkey.createdAt.toISOString(),
  };
}

function normalizePasskeyName(name: string) {
  return name.trim().replace(/\s+/g, ' ').slice(0, 128) || 'Passkey';
}

function parseTransports(value: string | null | undefined): AuthenticatorTransportFuture[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isAuthenticatorTransport);
  } catch {
    return [];
  }
}

function serializeTransports(value: AuthenticatorTransportFuture[] | undefined) {
  return value?.length ? JSON.stringify(value.filter(isAuthenticatorTransport)) : null;
}

function isAuthenticatorTransport(value: unknown): value is AuthenticatorTransportFuture {
  return (
    value === 'ble' ||
    value === 'cable' ||
    value === 'hybrid' ||
    value === 'internal' ||
    value === 'nfc' ||
    value === 'smart-card' ||
    value === 'usb'
  );
}

function getRegistrationCacheKey(token: string) {
  return `${registrationCacheKeyPrefix}${token}`;
}
