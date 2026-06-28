import { Op, type Transaction, UniqueConstraintError } from 'sequelize';

import { AppError } from '../../core/errors';
import { type SsoIdentityModel, type UserModel } from './user.model';

interface CreateUserWithCredentialsInput {
  username: string;
  displayName: string;
  email: string;
  emailVerified?: boolean;
  passwordHash: string;
  passwordSalt: string;
}

interface CreateSsoUserInput {
  username: string;
  displayName: string;
  email: string;
  emailVerified?: boolean;
  passwordHash: string;
  passwordSalt: string;
  providerId: string;
  providerSubject: string;
}

interface UpdateUserPasswordInput {
  passwordHash: string;
  passwordSalt: string;
}

interface UpdateUserProfileInput {
  displayName: string;
  gender?: string | null | undefined;
  birthday?: string | null | undefined;
  bio?: string | null | undefined;
  location?: string | null | undefined;
  websiteUrl?: string | null | undefined;
  phoneNumber?: string | null | undefined;
}

interface UpdateManagedUserInput {
  username?: string | undefined;
  displayName?: string | undefined;
  gender?: string | null | undefined;
  birthday?: string | null | undefined;
  bio?: string | null | undefined;
  location?: string | null | undefined;
  websiteUrl?: string | null | undefined;
  email?: string | undefined;
  emailVerified?: boolean | undefined;
  phoneNumber?: string | null | undefined;
  phoneVerified?: boolean | undefined;
  passwordHash?: string | undefined;
  passwordSalt?: string | undefined;
  available?: boolean | undefined;
}

interface BindSsoIdentityInput {
  email: string;
  providerId: string;
  providerSubject: string;
}

interface ListUsersInput {
  page: number;
  pageSize: number;
}

interface DatabaseWriteOptions {
  transaction?: Transaction;
}

export class UserService {
  constructor(
    private readonly userModel: typeof UserModel,
    private readonly ssoIdentityModel: typeof SsoIdentityModel,
  ) {}

  async findById(id: string) {
    return this.userModel.findOne({
      where: {
        id,
        available: true,
      },
    });
  }

  async findManagedById(id: string) {
    return this.userModel.findOne({
      where: {
        id,
      },
    });
  }

  async findByEmail(email: string, options: DatabaseWriteOptions = {}) {
    return this.userModel.findOne({
      ...withTransaction(options),
      where: { email },
    });
  }

  async findByUsername(username: string, options: DatabaseWriteOptions = {}) {
    return this.userModel.findOne({
      ...withTransaction(options),
      where: { username },
    });
  }

  async findByPhoneNumber(phoneNumber: string, options: DatabaseWriteOptions = {}) {
    return this.userModel.findOne({
      ...withTransaction(options),
      where: { phoneNumber },
    });
  }

  async findByLoginIdentifier(identifier: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();

    return normalizedIdentifier.includes('@')
      ? this.findByEmail(normalizedIdentifier)
      : this.findByUsername(normalizedIdentifier);
  }

  async listDistinctProfileGenders() {
    const users = await this.userModel.findAll({
      attributes: ['gender'],
      group: ['gender'],
      where: {
        gender: {
          [Op.ne]: null,
        },
      },
    });

    return users.map((user) => user.gender).filter(isPresentProfileText);
  }

  async findBySsoIdentity(providerId: string, providerSubject: string) {
    const identity = await this.ssoIdentityModel.findOne({
      where: {
        providerId,
        providerSubject,
      },
    });

    return identity ? this.findManagedById(identity.userId) : null;
  }

  async listSsoIdentities(userId: string) {
    return this.ssoIdentityModel.findAll({
      where: { userId },
      order: [
        ['providerId', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });
  }

  async deleteSsoIdentity(userId: string, providerId: string) {
    const deleted = await this.ssoIdentityModel.destroy({
      where: {
        userId,
        providerId,
      },
    });

    if (deleted === 0) {
      throw new AppError('USER_SSO_IDENTITY_NOT_FOUND', 'SSO identity was not found for this account.', 404);
    }

    return {
      deleted: true,
    } as const;
  }

  async listUsers(input: ListUsersInput) {
    const result = await this.userModel.findAndCountAll({
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      order: [
        ['createdAt', 'DESC'],
        ['email', 'ASC'],
      ],
    });

    return {
      total: result.count,
      users: result.rows,
    };
  }

  async hasMultipleAvailableUsers() {
    return (
      (await this.userModel.count({
        where: {
          available: true,
        },
      })) > 1
    );
  }

  async createWithCredentials(input: CreateUserWithCredentialsInput) {
    await this.assertUniqueAccountIdentifiers(input);

    try {
      return await this.userModel.create(input);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        await this.throwAccountIdentifierConflict(input);
      }

      throw error;
    }
  }

  async createWithSso(input: CreateSsoUserInput) {
    const existingBySubject = await this.findBySsoIdentity(input.providerId, input.providerSubject);

    if (existingBySubject) {
      throw new AppError('SSO_SUBJECT_EXISTS', 'The SSO identity is already associated with an account.', 409);
    }

    const existingByEmail = await this.findByEmail(input.email);

    if (existingByEmail) {
      throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
    }

    const existingByUsername = await this.findByUsername(input.username);

    if (existingByUsername) {
      throw new AppError('USER_USERNAME_EXISTS', 'The username is already registered.', 409);
    }

    try {
      const { providerId, providerSubject, ...userInput } = input;

      return await this.userModel.sequelize!.transaction(async (transaction) => {
        const user = await this.userModel.create(userInput, { transaction });

        await this.ssoIdentityModel.create(
          {
            userId: user.id,
            providerId,
            providerSubject,
            email: input.email,
          },
          { transaction },
        );

        return user;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        if (await this.findBySsoIdentity(input.providerId, input.providerSubject)) {
          throw new AppError('SSO_SUBJECT_EXISTS', 'The SSO identity is already associated with an account.', 409);
        }

        if (await this.findByEmail(input.email)) {
          throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
        }

        if (await this.findByUsername(input.username)) {
          throw new AppError('USER_USERNAME_EXISTS', 'The username is already registered.', 409);
        }

        throw new AppError('SSO_ACCOUNT_CREATE_CONFLICT', 'The SSO account could not be created.', 409);
      }

      throw error;
    }
  }

  async bindSsoIdentity(user: UserModel, input: BindSsoIdentityInput) {
    await this.assertCanBindSsoIdentity(user, input);

    const existingForUserProvider = await this.ssoIdentityModel.findOne({
      where: {
        userId: user.id,
        providerId: input.providerId,
      },
    });

    if (existingForUserProvider?.providerSubject === input.providerSubject) {
      return user;
    }

    try {
      return await this.userModel.sequelize!.transaction(async (transaction) => {
        await this.ssoIdentityModel.create(
          {
            userId: user.id,
            providerId: input.providerId,
            providerSubject: input.providerSubject,
            email: input.email,
          },
          { transaction },
        );

        return user;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const existing = await this.ssoIdentityModel.findOne({
          where: {
            providerId: input.providerId,
            providerSubject: input.providerSubject,
          },
        });

        if (existing) {
          if (existing.userId === user.id) {
            return user;
          }

          throw new AppError('SSO_SUBJECT_EXISTS', 'The SSO identity is already associated with an account.', 409);
        }

        const existingForUserProvider = await this.ssoIdentityModel.findOne({
          where: {
            userId: user.id,
            providerId: input.providerId,
          },
        });

        if (existingForUserProvider) {
          throw new AppError(
            'USER_SSO_SUBJECT_EXISTS',
            'The user is already associated with another SSO identity.',
            409,
          );
        }

        throw new AppError('SSO_BIND_CONFLICT', 'The SSO identity could not be associated with this account.', 409);
      }

      throw error;
    }
  }

  async assertCanBindSsoIdentity(user: UserModel, input: BindSsoIdentityInput) {
    const existing = await this.ssoIdentityModel.findOne({
      where: {
        providerId: input.providerId,
        providerSubject: input.providerSubject,
      },
    });

    if (existing && existing.userId !== user.id) {
      throw new AppError('SSO_SUBJECT_EXISTS', 'The SSO identity is already associated with an account.', 409);
    }

    const existingForUserProvider = await this.ssoIdentityModel.findOne({
      where: {
        userId: user.id,
        providerId: input.providerId,
      },
    });

    if (existingForUserProvider) {
      if (existingForUserProvider.providerSubject === input.providerSubject) {
        return;
      }

      throw new AppError('USER_SSO_SUBJECT_EXISTS', 'The user is already associated with another SSO identity.', 409);
    }
  }

  async updatePassword(user: UserModel, input: UpdateUserPasswordInput) {
    user.passwordHash = input.passwordHash;
    user.passwordSalt = input.passwordSalt;

    return user.save();
  }

  async verifyEmail(user: UserModel) {
    if (user.emailVerified) {
      return user;
    }

    user.emailVerified = true;

    return user.save();
  }

  async verifyPhoneNumber(user: UserModel, phoneNumber: string) {
    if (user.phoneNumber === phoneNumber && user.phoneVerified) {
      return user;
    }

    if (phoneNumber !== user.phoneNumber) {
      const existing = await this.findByPhoneNumber(phoneNumber);

      if (existing && existing.id !== user.id) {
        throw new AppError('USER_PHONE_NUMBER_EXISTS', 'The phone number is already bound to another account.', 409);
      }
    }

    user.phoneNumber = phoneNumber;
    user.phoneVerified = true;

    try {
      return await user.save();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        if (await this.findByPhoneNumber(phoneNumber)) {
          throw new AppError('USER_PHONE_NUMBER_EXISTS', 'The phone number is already bound to another account.', 409);
        }

        throw new AppError('USER_IDENTIFIER_CONFLICT', 'The account identifiers are already registered.', 409);
      }

      throw error;
    }
  }

  async updateProfile(user: UserModel, input: UpdateUserProfileInput) {
    user.displayName = input.displayName;

    if (Object.prototype.hasOwnProperty.call(input, 'gender')) {
      user.gender = input.gender ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'birthday')) {
      user.birthday = input.birthday ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'bio')) {
      user.bio = input.bio ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'location')) {
      user.location = input.location ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'websiteUrl')) {
      user.websiteUrl = input.websiteUrl ?? null;
    }

    if (input.phoneNumber !== undefined && input.phoneNumber !== user.phoneNumber) {
      if (input.phoneNumber) {
        const existing = await this.findByPhoneNumber(input.phoneNumber);

        if (existing && existing.id !== user.id) {
          throw new AppError('USER_PHONE_NUMBER_EXISTS', 'The phone number is already bound to another account.', 409);
        }
      }

      user.phoneNumber = input.phoneNumber;
      user.phoneVerified = false;
    }

    try {
      return await user.save();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        if (input.phoneNumber && (await this.findByPhoneNumber(input.phoneNumber))) {
          throw new AppError('USER_PHONE_NUMBER_EXISTS', 'The phone number is already bound to another account.', 409);
        }

        throw new AppError('USER_IDENTIFIER_CONFLICT', 'The account identifiers are already registered.', 409);
      }

      throw error;
    }
  }

  async updateManagedUser(user: UserModel, input: UpdateManagedUserInput, options: DatabaseWriteOptions = {}) {
    const usernameProvided = Object.prototype.hasOwnProperty.call(input, 'username');
    const emailProvided = Object.prototype.hasOwnProperty.call(input, 'email');
    const emailVerifiedProvided = Object.prototype.hasOwnProperty.call(input, 'emailVerified');
    const phoneNumberProvided = Object.prototype.hasOwnProperty.call(input, 'phoneNumber');
    const phoneVerifiedProvided = Object.prototype.hasOwnProperty.call(input, 'phoneVerified');
    const nextUsername = input.username ?? user.username;
    const nextEmail = input.email ?? user.email;
    const nextPhoneNumber = phoneNumberProvided ? (input.phoneNumber ?? null) : user.phoneNumber;

    if (usernameProvided && nextUsername !== user.username) {
      const existing = await this.findByUsername(nextUsername, options);

      if (existing && existing.id !== user.id) {
        throw new AppError('USER_USERNAME_EXISTS', 'The username is already registered.', 409);
      }
    }

    if (emailProvided && nextEmail !== user.email) {
      const existing = await this.findByEmail(nextEmail, options);

      if (existing && existing.id !== user.id) {
        throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
      }
    }

    if (phoneNumberProvided && nextPhoneNumber && nextPhoneNumber !== user.phoneNumber) {
      const existing = await this.findByPhoneNumber(nextPhoneNumber, options);

      if (existing && existing.id !== user.id) {
        throw new AppError('USER_PHONE_NUMBER_EXISTS', 'The phone number is already bound to another account.', 409);
      }
    }

    if (input.phoneVerified === true && !nextPhoneNumber) {
      throw new AppError('USER_PHONE_NUMBER_REQUIRED', 'Phone number is required before marking it verified.', 400);
    }

    const emailChanged = emailProvided && nextEmail !== user.email;
    const phoneChanged = phoneNumberProvided && nextPhoneNumber !== user.phoneNumber;

    if (usernameProvided) {
      user.username = nextUsername;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'displayName')) {
      user.displayName = input.displayName ?? user.displayName;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'gender')) {
      user.gender = input.gender ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'birthday')) {
      user.birthday = input.birthday ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'bio')) {
      user.bio = input.bio ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'location')) {
      user.location = input.location ?? null;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'websiteUrl')) {
      user.websiteUrl = input.websiteUrl ?? null;
    }

    if (emailProvided) {
      user.email = nextEmail;
    }

    if (emailVerifiedProvided) {
      user.emailVerified = input.emailVerified ?? user.emailVerified;
    } else if (emailChanged) {
      user.emailVerified = false;
    }

    if (phoneNumberProvided) {
      user.phoneNumber = nextPhoneNumber;
    }

    if (phoneVerifiedProvided) {
      user.phoneVerified = input.phoneVerified ?? user.phoneVerified;
    } else if (phoneChanged) {
      user.phoneVerified = false;
    }

    if (input.passwordHash && input.passwordSalt) {
      user.passwordHash = input.passwordHash;
      user.passwordSalt = input.passwordSalt;
    }

    if (Object.prototype.hasOwnProperty.call(input, 'available')) {
      user.available = input.available ?? user.available;
    }

    if (!user.changed()) {
      return user;
    }

    try {
      return await user.save(withTransaction(options));
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        const existingUsername = await this.findByUsername(nextUsername, options);

        if (existingUsername && existingUsername.id !== user.id) {
          throw new AppError('USER_USERNAME_EXISTS', 'The username is already registered.', 409);
        }

        const existingEmail = await this.findByEmail(nextEmail, options);

        if (existingEmail && existingEmail.id !== user.id) {
          throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
        }

        if (nextPhoneNumber) {
          const existingPhoneNumber = await this.findByPhoneNumber(nextPhoneNumber, options);

          if (existingPhoneNumber && existingPhoneNumber.id !== user.id) {
            throw new AppError(
              'USER_PHONE_NUMBER_EXISTS',
              'The phone number is already bound to another account.',
              409,
            );
          }
        }

        throw new AppError('USER_IDENTIFIER_CONFLICT', 'The account identifiers are already registered.', 409);
      }

      throw error;
    }
  }

  async transaction<T>(callback: (transaction: Transaction) => Promise<T>) {
    const sequelize = this.userModel.sequelize;

    if (!sequelize) {
      throw new Error('User model is not initialized.');
    }

    return sequelize.transaction(callback);
  }

  async updateAvatar(user: UserModel, avatarUrl: string, avatarStorageKey: string) {
    user.avatarStorageKey = avatarStorageKey;
    user.avatarUrl = avatarUrl;

    return user.save();
  }

  async clearAvatar(user: UserModel) {
    user.avatarStorageKey = null;
    user.avatarUrl = null;

    return user.save();
  }

  async updateProfileBanner(user: UserModel, profileBannerUrl: string, profileBannerStorageKey: string) {
    user.profileBannerUrl = profileBannerUrl;
    user.profileBannerStorageKey = profileBannerStorageKey;

    return user.save();
  }

  async clearProfileBanner(user: UserModel) {
    user.profileBannerUrl = null;
    user.profileBannerStorageKey = null;

    return user.save();
  }

  async updateProfileBackground(user: UserModel, profileBackgroundUrl: string, profileBackgroundStorageKey: string) {
    user.profileBackgroundUrl = profileBackgroundUrl;
    user.profileBackgroundStorageKey = profileBackgroundStorageKey;

    return user.save();
  }

  async clearProfileBackground(user: UserModel) {
    user.profileBackgroundUrl = null;
    user.profileBackgroundStorageKey = null;

    return user.save();
  }

  private async assertUniqueAccountIdentifiers(input: { username: string; email: string }) {
    if (await this.findByEmail(input.email)) {
      throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
    }

    if (await this.findByUsername(input.username)) {
      throw new AppError('USER_USERNAME_EXISTS', 'The username is already registered.', 409);
    }
  }

  private async throwAccountIdentifierConflict(input: { username: string; email: string }) {
    if (await this.findByEmail(input.email)) {
      throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
    }

    if (await this.findByUsername(input.username)) {
      throw new AppError('USER_USERNAME_EXISTS', 'The username is already registered.', 409);
    }

    throw new AppError('USER_IDENTIFIER_CONFLICT', 'The account identifiers are already registered.', 409);
  }
}

function withTransaction(options: DatabaseWriteOptions) {
  return options.transaction ? { transaction: options.transaction } : {};
}

function isPresentProfileText(value: string | null): value is string {
  return Boolean(value?.trim());
}
