import { UniqueConstraintError } from 'sequelize';

import { AppError } from '../../core/errors';
import { UserModel } from './user.model';

export interface CreateUserWithCredentialsInput {
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
}

export interface CreateSsoUserInput {
  username: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  ssoSubject: string;
}

export interface UpdateUserPasswordInput {
  passwordHash: string;
  passwordSalt: string;
}

export class UserService {
  constructor(private readonly userModel: typeof UserModel) {}

  async findById(id: string) {
    return await this.userModel.findOne({
      where: {
        id,
        available: true,
      },
    });
  }

  async findByEmail(email: string) {
    return await this.userModel.findOne({
      where: { email },
    });
  }

  async findBySsoSubject(ssoSubject: string) {
    return await this.userModel.findOne({
      where: { ssoSubject },
    });
  }

  async createWithCredentials(input: CreateUserWithCredentialsInput) {
    const existing = await this.userModel.findOne({
      where: { email: input.email },
    });

    if (existing) {
      throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
    }

    try {
      return await this.userModel.create(input);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
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

    return await user.save();
  }
}
