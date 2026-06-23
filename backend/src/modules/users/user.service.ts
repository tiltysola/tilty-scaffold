import { UniqueConstraintError } from 'sequelize';

import { AppError } from '../../core/errors';
import { type UserModel } from './user.model';

interface CreateUserWithCredentialsInput {
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
}

interface CreateSsoUserInput {
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  ssoSubject: string;
}

interface UpdateUserPasswordInput {
  passwordHash: string;
  passwordSalt: string;
}

interface UpdateUserProfileInput {
  displayName: string;
}

interface ListUsersInput {
  page: number;
  pageSize: number;
}

export class UserService {
  constructor(private readonly userModel: typeof UserModel) {}

  async findById(id: string) {
    return this.userModel.findOne({
      where: {
        id,
        available: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.userModel.findOne({
      where: { email },
    });
  }

  async findByUsername(username: string) {
    return this.userModel.findOne({
      where: { username },
    });
  }

  async findByLoginIdentifier(identifier: string) {
    const normalizedIdentifier = identifier.trim().toLowerCase();

    return normalizedIdentifier.includes('@')
      ? this.findByEmail(normalizedIdentifier)
      : this.findByUsername(normalizedIdentifier);
  }

  async findBySsoSubject(ssoSubject: string) {
    return this.userModel.findOne({
      where: { ssoSubject },
    });
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
    const existingBySubject = await this.findBySsoSubject(input.ssoSubject);

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
      return await this.userModel.create(input);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        if (await this.findBySsoSubject(input.ssoSubject)) {
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

  async bindSsoSubject(user: UserModel, ssoSubject: string) {
    const existing = await this.findBySsoSubject(ssoSubject);

    if (existing && existing.id !== user.id) {
      throw new AppError('SSO_SUBJECT_EXISTS', 'The SSO identity is already associated with an account.', 409);
    }

    if (user.ssoSubject && user.ssoSubject !== ssoSubject) {
      throw new AppError('USER_SSO_SUBJECT_EXISTS', 'The user is already associated with another SSO identity.', 409);
    }

    if (user.ssoSubject === ssoSubject) {
      return user;
    }

    try {
      user.ssoSubject = ssoSubject;

      return await user.save();
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new AppError('SSO_SUBJECT_EXISTS', 'The SSO identity is already associated with an account.', 409);
      }

      throw error;
    }
  }

  async updatePassword(user: UserModel, input: UpdateUserPasswordInput) {
    user.passwordHash = input.passwordHash;
    user.passwordSalt = input.passwordSalt;

    return user.save();
  }

  async updateProfile(user: UserModel, input: UpdateUserProfileInput) {
    user.displayName = input.displayName;

    return user.save();
  }

  async updateAvatar(user: UserModel, avatarUrl: string, avatarStorageKey: string) {
    user.avatarStorageKey = avatarStorageKey;
    user.avatarUrl = avatarUrl;

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
