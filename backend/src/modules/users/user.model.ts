import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

export class UserModel extends Model<InferAttributes<UserModel>, InferCreationAttributes<UserModel>> {
  declare id: CreationOptional<string>;
  declare username: string;
  declare displayName: string;
  declare email: string;
  declare emailVerified: CreationOptional<boolean>;
  declare phoneNumber: CreationOptional<string | null>;
  declare phoneVerified: CreationOptional<boolean>;
  declare avatarUrl: CreationOptional<string | null>;
  declare avatarStorageKey: CreationOptional<string | null>;
  declare passwordHash: CreationOptional<string | null>;
  declare passwordSalt: CreationOptional<string | null>;
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
        unique: 'users_username',
      },
      displayName: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: 'users_email',
      },
      emailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      phoneNumber: {
        type: DataTypes.STRING(32),
        allowNull: true,
        unique: 'users_phone_number',
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
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      passwordSalt: {
        type: DataTypes.STRING(64),
        allowNull: true,
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

  return SsoIdentityModel;
}
