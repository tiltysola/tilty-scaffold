import { randomUUID } from 'crypto';

import { SystemRole } from '@tilty/shared/access-control';

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
import { assertPasswordConfirmation } from './auth.validation';

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

interface LoginInput {
  identifier: string;
  password: string;
}

interface SendEmailVerificationInput {
  email: string;
}

interface AvatarUploadInput {
  content: Buffer;
  contentType: string;
  filename?: string;
}

interface UpdateCurrentUserInput {
  displayName: string;
}

export interface AuthTokenConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
}

interface RefreshTokenRecord {
  userId: string;
  used?: boolean;
}

export const defaultAuthTokenConfig: AuthTokenConfig = {
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
};

const refreshTokenCacheKeyPrefix = 'auth:refresh-token:';

export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly accessControl: AccessControlService,
    private readonly tokenSecret: string,
    private readonly emailVerification: EmailVerificationService,
    private readonly fileStorage: FileStorage | undefined,
    private readonly tokenConfig: AuthTokenConfig,
    private readonly refreshTokenStore: CacheStore,
  ) {}

  getPublicConfig() {
    return {
      passwordRecoveryEnabled: this.emailVerification.isEnabled(),
      registrationEmailVerificationRequired: this.emailVerification.isEnabled(),
    };
  }

  async sendRegistrationEmailVerification(input: SendEmailVerificationInput) {
    const existing = await this.userService.findByEmail(input.email);

    if (existing) {
      throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
    }

    return this.emailVerification.sendRegistrationCode(input.email);
  }

  async sendPasswordResetEmailVerification(input: SendEmailVerificationInput) {
    const user = await this.userService.findByEmail(input.email);

    if (!isPasswordResetEligibleUser(user)) {
      return this.emailVerification.getDeliveryMetadata();
    }

    return this.emailVerification.sendPasswordResetCode(input.email);
  }

  async register(input: RegisterInput) {
    assertPasswordConfirmation(input);

    await this.emailVerification.verifyRegistrationCode(input.email, input.emailVerificationCode);

    const credentials = await hashPassword(input.password);
    const user = await this.userService.createWithCredentials({
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      ...credentials,
    });

    await this.bootstrapRootRoleForFirstUser(user);

    return createAuthSession(user, this.tokenSecret, this.tokenConfig, this.refreshTokenStore, this.accessControl);
  }

  async login(input: LoginInput) {
    const user = await this.userService.findByLoginIdentifier(input.identifier);

    if (!user || !user.available || !user.passwordHash || !user.passwordSalt) {
      throwInvalidCredentials();
    }

    const valid = await verifyPassword(input.password, user.passwordHash, user.passwordSalt);

    if (!valid) {
      throwInvalidCredentials();
    }

    return createAuthSession(user, this.tokenSecret, this.tokenConfig, this.refreshTokenStore, this.accessControl);
  }

  async refreshSession(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const recordKey = getRefreshTokenCacheKey(payload.jti);
    const record = await this.refreshTokenStore.get<RefreshTokenRecord>(recordKey);

    if (!record || record.userId !== payload.sub || record.used) {
      throwInvalidRefreshToken();
    }

    const consumed = await this.refreshTokenStore.compareAndSet(
      recordKey,
      record,
      {
        ...record,
        used: true,
      },
      Math.max(payload.exp * 1000 - Date.now(), 1),
    );

    if (!consumed) {
      throwInvalidRefreshToken();
    }

    await this.refreshTokenStore.delete(recordKey);

    const user = await this.userService.findById(payload.sub);

    if (!user || !user.available) {
      throwInvalidRefreshToken();
    }

    return createAuthSession(user, this.tokenSecret, this.tokenConfig, this.refreshTokenStore, this.accessControl);
  }

  async revokeRefreshToken(refreshToken: string) {
    try {
      const payload = await verifyRefreshToken(refreshToken, this.tokenSecret);

      await this.refreshTokenStore.delete(getRefreshTokenCacheKey(payload.jti));
    } catch {
      // Logout should clear client state even when the refresh token is absent or stale.
    }
  }

  async resetPassword(input: ResetPasswordInput) {
    assertPasswordConfirmation(input);

    const user = await this.userService.findByEmail(input.email);

    await this.emailVerification.verifyPasswordResetCode(input.email, input.emailVerificationCode);

    if (!isPasswordResetEligibleUser(user)) {
      throw new AppError('EMAIL_VERIFICATION_INVALID', 'Email verification code is invalid or expired.', 400);
    }

    const credentials = await hashPassword(input.password);

    await this.userService.updatePassword(user, credentials);

    return { reset: true } as const;
  }

  async authenticate(token: string) {
    const payload = await verifyAccessToken(token, this.tokenSecret);
    const user = await this.userService.findById(payload.sub);

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'Authentication token is invalid.', 401);
    }

    const access = await this.accessControl.getUserAccess(user.id);

    return {
      user,
      access,
      authUser: toAuthUser(user, access),
    };
  }

  async getCurrentUser(token: string) {
    return (await this.authenticate(token)).authUser;
  }

  async updateCurrentUser(token: string, input: UpdateCurrentUserInput) {
    const { user } = await this.authenticate(token);
    const updatedUser = await this.userService.updateProfile(user, input);

    return toAuthUser(updatedUser, await this.accessControl.getUserAccess(updatedUser.id));
  }

  async uploadAvatar(token: string, input: AvatarUploadInput) {
    if (!this.fileStorage) {
      throw new AppError('FILE_STORAGE_DISABLED', 'File storage is not configured.', 500);
    }

    const { user } = await this.authenticate(token);

    const image = validateAvatarImage(input);
    const savedFile = await this.fileStorage.save({
      cacheControl: 'public, max-age=31536000, immutable',
      content: input.content,
      contentType: image.contentType,
      key: `avatars/${randomUUID()}.${image.extension}`,
    });
    const previousAvatarStorageKey = user.avatarStorageKey;
    let updatedUser: UserModel;

    try {
      updatedUser = await this.userService.updateAvatar(user, savedFile.url, savedFile.key);
    } catch (error) {
      await this.deleteStoredFile(savedFile.key);
      throw error;
    }

    if (previousAvatarStorageKey) {
      await this.deleteStoredFile(previousAvatarStorageKey);
    }

    return toAuthUser(updatedUser, await this.accessControl.getUserAccess(updatedUser.id));
  }

  private async bootstrapRootRoleForFirstUser(user: UserModel) {
    if (await this.userService.hasMultipleAvailableUsers()) {
      return;
    }

    await this.accessControl.assignSystemRoleToUser(user.id, SystemRole.Root);
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
}

export async function createAuthSession(
  user: UserModel,
  tokenSecret: string,
  tokenConfig: AuthTokenConfig,
  refreshTokenStore: CacheStore,
  accessControl: AccessControlService,
) {
  const authUser = toAuthUser(user, await accessControl.getUserAccess(user.id));
  const refreshTokenId = randomUUID();
  const accessToken = await createAccessToken(
    {
      sub: user.id,
      username: authUser.username,
      displayName: authUser.displayName,
      email: authUser.email,
    },
    tokenSecret,
    tokenConfig.accessTokenTtlSeconds,
  );
  const refreshToken = await createRefreshToken(
    {
      jti: refreshTokenId,
      sub: user.id,
    },
    tokenSecret,
    tokenConfig.refreshTokenTtlSeconds,
  );

  await refreshTokenStore.set(
    getRefreshTokenCacheKey(refreshTokenId),
    {
      userId: user.id,
      used: false,
    },
    tokenConfig.refreshTokenTtlSeconds * 1000,
  );

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
    email: user.email,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    roles: access.roles,
    permissions: access.permissions,
  };
}

function throwInvalidCredentials(): never {
  throw new AppError('AUTH_INVALID_CREDENTIALS', 'The account identifier or password is invalid.', 401);
}

function throwInvalidRefreshToken(): never {
  throw new AppError('AUTH_REFRESH_TOKEN_INVALID', 'Refresh token is invalid or expired.', 401);
}

function getRefreshTokenCacheKey(tokenId: string) {
  return `${refreshTokenCacheKeyPrefix}${tokenId}`;
}

function isPasswordResetEligibleUser(user: UserModel | null): user is UserModel {
  return Boolean(user?.available && user.passwordHash && user.passwordSalt);
}

function validateAvatarImage(input: AvatarUploadInput) {
  const detected = detectImageType(input.content);
  const contentType = input.contentType.toLowerCase();

  if (!detected) {
    throw new AppError('AVATAR_FILE_INVALID', 'Avatar must be a JPEG, PNG, WebP, or GIF image.', 400);
  }

  if (contentType && contentType !== detected.contentType) {
    throw new AppError('AVATAR_FILE_INVALID', 'Avatar file content type does not match the uploaded image.', 400);
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
