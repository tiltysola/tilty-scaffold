import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

import { AppError } from '../../core/errors';

type JoseModule = typeof import('jose', { with: { 'resolution-mode': 'import' } });

const scrypt = promisify(scryptCallback);
const passwordKeyLength = 64;
export const ssoStateTtlMs = 10 * 60 * 1000;
export const ssoHandoffTtlMs = 60 * 1000;
export const ssoBindTtlMs = 10 * 60 * 1000;
let joseModule: Promise<JoseModule> | undefined;

interface PasswordHash {
  passwordHash: string;
  passwordSalt: string;
}

interface AccessTokenPayload {
  sub: string;
  username: string;
  displayName: string;
  email: string;
  iat: number;
  exp: number;
  type: 'access';
}

interface RefreshTokenPayload {
  jti: string;
  sub: string;
  iat: number;
  exp: number;
  type: 'refresh';
}

interface SsoStatePayload {
  jti: string;
  nonce: string;
  redirectPath: string;
  iat: number;
  exp: number;
  type: 'sso_state';
}

interface SsoHandoffPayload {
  jti: string;
  iat: number;
  exp: number;
  type: 'sso_handoff';
}

interface SsoBindPayload {
  jti: string;
  ssoSubject: string;
  username: string;
  displayName: string;
  email: string;
  redirectPath: string;
  iat: number;
  exp: number;
  type: 'sso_bind';
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const passwordSalt = randomBytes(16).toString('base64url');
  const key = await derivePasswordKey(password, passwordSalt);

  return {
    passwordHash: key.toString('base64url'),
    passwordSalt,
  };
}

export async function verifyPassword(password: string, passwordHash: string, passwordSalt: string) {
  const candidate = await derivePasswordKey(password, passwordSalt);
  const expected = Buffer.from(passwordHash, 'base64url');

  if (candidate.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}

export async function createAccessToken(
  payload: Omit<AccessTokenPayload, 'iat' | 'exp' | 'type'>,
  secret: string,
  ttlSeconds: number,
) {
  const { SignJWT } = await loadJose();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const accessToken = await new SignJWT({
    username: payload.username,
    displayName: payload.displayName,
    email: payload.email,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.sub)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(getSecretKey(secret));

  return {
    accessToken,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export async function createRefreshToken(
  payload: Omit<RefreshTokenPayload, 'iat' | 'exp' | 'type'>,
  secret: string,
  ttlSeconds: number,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ttlSeconds;
  const refreshToken = await signToken(
    {
      jti: payload.jti,
      sub: payload.sub,
      type: 'refresh',
    },
    secret,
    issuedAt,
    expiresAt,
  );

  return {
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    refreshToken,
  };
}

export async function verifyAccessToken(token: string, secret: string) {
  const { errors, jwtVerify } = await loadJose();

  try {
    const { payload } = await jwtVerify<AccessTokenPayload>(token, getSecretKey(secret), {
      algorithms: ['HS256'],
      typ: 'JWT',
    });

    if (!isAccessTokenPayload(payload)) {
      throwInvalidToken();
    }

    return payload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof errors.JWTExpired) {
      throw new AppError('AUTH_TOKEN_EXPIRED', 'Authentication token has expired.', 401);
    }

    throwInvalidToken();
  }
}

export async function verifyRefreshToken(token: string, secret: string) {
  const payload = await verifyToken<RefreshTokenPayload>(token, secret);

  if (!isRefreshTokenPayload(payload)) {
    throwInvalidToken();
  }

  return payload;
}

export async function createSsoStateToken(
  payload: Omit<SsoStatePayload, 'jti' | 'iat' | 'exp' | 'type'>,
  secret: string,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + Math.floor(ssoStateTtlMs / 1000);
  const tokenId = randomUUID();

  return {
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    token: await signToken(
      {
        jti: tokenId,
        nonce: payload.nonce,
        redirectPath: payload.redirectPath,
        type: 'sso_state',
      },
      secret,
      issuedAt,
      expiresAt,
    ),
    tokenId,
  } as const;
}

export async function verifySsoStateToken(token: string, secret: string) {
  const payload = await verifyToken<SsoStatePayload>(token, secret);

  if (!isSsoStatePayload(payload)) {
    throwInvalidToken();
  }

  return payload;
}

export async function createSsoHandoffToken(secret: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + Math.floor(ssoHandoffTtlMs / 1000);
  const tokenId = randomUUID();

  return {
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    token: await signToken(
      {
        jti: tokenId,
        type: 'sso_handoff',
      },
      secret,
      issuedAt,
      expiresAt,
    ),
    tokenId,
  } as const;
}

export async function verifySsoHandoffToken(token: string, secret: string) {
  const payload = await verifyToken<SsoHandoffPayload>(token, secret);

  if (!isSsoHandoffPayload(payload)) {
    throwInvalidToken();
  }

  return payload;
}

export async function createSsoBindToken(
  payload: Omit<SsoBindPayload, 'jti' | 'iat' | 'exp' | 'type'>,
  secret: string,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + Math.floor(ssoBindTtlMs / 1000);
  const tokenId = randomUUID();

  return {
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    token: await signToken(
      {
        jti: tokenId,
        ssoSubject: payload.ssoSubject,
        username: payload.username,
        displayName: payload.displayName,
        email: payload.email,
        redirectPath: payload.redirectPath,
        type: 'sso_bind',
      },
      secret,
      issuedAt,
      expiresAt,
    ),
    tokenId,
  } as const;
}

export async function verifySsoBindToken(token: string, secret: string) {
  const payload = await verifyToken<SsoBindPayload>(token, secret);

  if (!isSsoBindPayload(payload)) {
    throwInvalidToken();
  }

  return payload;
}

function loadJose() {
  joseModule ??= import('jose');
  return joseModule;
}

async function signToken(payload: Record<string, unknown>, secret: string, issuedAt: number, expiresAt: number) {
  const { SignJWT } = await loadJose();

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(getSecretKey(secret));
}

async function verifyToken<T>(token: string, secret: string) {
  const { errors, jwtVerify } = await loadJose();

  try {
    const { payload } = await jwtVerify<T>(token, getSecretKey(secret), {
      algorithms: ['HS256'],
      typ: 'JWT',
    });

    return payload;
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw new AppError('AUTH_TOKEN_EXPIRED', 'Authentication token has expired.', 401);
    }

    throwInvalidToken();
  }
}

function throwInvalidToken(): never {
  throw new AppError('AUTH_INVALID_TOKEN', 'Authentication token is invalid.', 401);
}

function getSecretKey(secret: string) {
  return Buffer.from(secret, 'utf8');
}

async function derivePasswordKey(password: string, passwordSalt: string) {
  return (await scrypt(password, passwordSalt, passwordKeyLength)) as Buffer;
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.sub === 'string' &&
    typeof payload.username === 'string' &&
    typeof payload.displayName === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    payload.type === 'access'
  );
}

function isRefreshTokenPayload(value: unknown): value is RefreshTokenPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.jti === 'string' &&
    typeof payload.sub === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    payload.type === 'refresh'
  );
}

function isSsoStatePayload(value: unknown): value is SsoStatePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.jti === 'string' &&
    typeof payload.nonce === 'string' &&
    typeof payload.redirectPath === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    payload.type === 'sso_state'
  );
}

function isSsoHandoffPayload(value: unknown): value is SsoHandoffPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.jti === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    payload.type === 'sso_handoff'
  );
}

function isSsoBindPayload(value: unknown): value is SsoBindPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.jti === 'string' &&
    typeof payload.ssoSubject === 'string' &&
    typeof payload.username === 'string' &&
    typeof payload.displayName === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.redirectPath === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    payload.type === 'sso_bind'
  );
}
