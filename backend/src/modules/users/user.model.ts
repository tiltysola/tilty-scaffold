import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

import { AuthPasskeyModel } from '../auth/auth-passkey.model';
import { AuthSessionModel } from '../auth/auth-session.model';

export class UserModel extends Model<InferAttributes<UserModel>, InferCreationAttributes<UserModel>> {
  declare id: CreationOptional<string>;
  declare username: string;
  declare displayName: string;
  declare gender: CreationOptional<string | null>;
  declare birthday: CreationOptional<string | null>;
  declare bio: CreationOptional<string | null>;
  declare location: CreationOptional<string | null>;
  declare websiteUrl: CreationOptional<string | null>;
  declare email: string;
  declare emailVerified: CreationOptional<boolean>;
  declare phoneNumber: CreationOptional<string | null>;
  declare phoneVerified: CreationOptional<boolean>;
  declare avatarUrl: CreationOptional<string | null>;
  declare avatarStorageKey: CreationOptional<string | null>;
  declare profileBannerUrl: CreationOptional<string | null>;
  declare profileBannerStorageKey: CreationOptional<string | null>;
  declare profileBackgroundUrl: CreationOptional<string | null>;
  declare profileBackgroundStorageKey: CreationOptional<string | null>;
  declare passwordHash: CreationOptional<string | null>;
  declare passwordSalt: CreationOptional<string | null>;
  declare totpEnabled: CreationOptional<boolean>;
  declare totpSecretEncrypted: CreationOptional<string | null>;
  declare totpRecoveryCodeHashes: CreationOptional<string | null>;
  declare mfaAllowedMethods: CreationOptional<string>;
  declare mfaRequiredForSso: CreationOptional<boolean>;
  declare available: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class SsoIdentityModel extends Model<
  InferAttributes<SsoIdentityModel>,
  InferCreationAttributes<SsoIdentityModel>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare providerId: string;
  declare providerSubject: string;
  declare email: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initUserModel(sequelize: Sequelize) {
  UserModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      username: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      displayName: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      gender: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      birthday: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      bio: {
        type: DataTypes.STRING(280),
        allowNull: true,
      },
      location: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      websiteUrl: {
        type: DataTypes.STRING(2048),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      emailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      phoneNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      phoneVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      avatarUrl: {
        type: DataTypes.STRING(1024),
        allowNull: true,
      },
      avatarStorageKey: {
        type: DataTypes.STRING(1024),
        allowNull: true,
      },
      profileBannerUrl: {
        type: DataTypes.STRING(1024),
        allowNull: true,
      },
      profileBannerStorageKey: {
        type: DataTypes.STRING(1024),
        allowNull: true,
      },
      profileBackgroundUrl: {
        type: DataTypes.STRING(1024),
        allowNull: true,
      },
      profileBackgroundStorageKey: {
        type: DataTypes.STRING(1024),
        allowNull: true,
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      passwordSalt: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      totpEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      totpSecretEncrypted: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      totpRecoveryCodeHashes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      mfaAllowedMethods: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '[]',
      },
      mfaRequiredForSso: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      available: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'users',
      modelName: 'User',
      indexes: [
        {
          name: 'users_username',
          fields: ['username'],
          unique: true,
        },
        {
          name: 'users_email',
          fields: ['email'],
          unique: true,
        },
        {
          name: 'users_phone_number',
          fields: ['phoneNumber'],
          unique: true,
        },
        {
          name: 'users_available_created_at',
          fields: ['available', 'createdAt'],
        },
        {
          name: 'users_created_at_email',
          fields: [
            {
              name: 'createdAt',
              order: 'DESC',
            },
            {
              name: 'email',
              order: 'ASC',
            },
          ],
        },
      ],
    },
  );

  return UserModel;
}

export function initSsoIdentityModel(sequelize: Sequelize) {
  SsoIdentityModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      providerId: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      providerSubject: {
        type: DataTypes.STRING(512),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'user_sso_identities',
      modelName: 'SsoIdentity',
      indexes: [
        {
          name: 'user_sso_identities_provider_subject',
          fields: ['providerId', 'providerSubject'],
          unique: true,
        },
        {
          name: 'user_sso_identities_user_id',
          fields: ['userId'],
        },
        {
          name: 'user_sso_identities_user_provider',
          fields: ['userId', 'providerId'],
          unique: true,
        },
      ],
    },
  );

  UserModel.hasMany(SsoIdentityModel, { foreignKey: 'userId' });
  SsoIdentityModel.belongsTo(UserModel, { foreignKey: 'userId' });
  UserModel.hasMany(AuthSessionModel, { foreignKey: 'userId' });
  AuthSessionModel.belongsTo(UserModel, { foreignKey: 'userId' });
  UserModel.hasMany(AuthPasskeyModel, { foreignKey: 'userId' });
  AuthPasskeyModel.belongsTo(UserModel, { foreignKey: 'userId' });

  return SsoIdentityModel;
}
