import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

export class UserModel extends Model<InferAttributes<UserModel>, InferCreationAttributes<UserModel>> {
  declare id: CreationOptional<string>;
  declare username: string;
  declare email: string;
  declare avatarUrl: CreationOptional<string | null>;
  declare avatarStorageKey: CreationOptional<string | null>;
  declare passwordHash: CreationOptional<string | null>;
  declare passwordSalt: CreationOptional<string | null>;
  declare ssoSubject: CreationOptional<string | null>;
  declare available: CreationOptional<boolean>;
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
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: 'users_email',
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
      ssoSubject: {
        type: DataTypes.STRING(512),
        allowNull: true,
        unique: 'users_sso_subject',
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
