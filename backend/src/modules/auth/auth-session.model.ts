import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

export class AuthSessionModel extends Model<
  InferAttributes<AuthSessionModel>,
  InferCreationAttributes<AuthSessionModel>
> {
  declare id: string;
  declare userId: string;
  declare deviceIdHash: CreationOptional<string | null>;
  declare deviceName: string;
  declare deviceType: string;
  declare browser: string;
  declare os: string;
  declare ipAddress: string;
  declare userAgentHash: string;
  declare lastActiveAt: Date;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initAuthSessionModel(sequelize: Sequelize) {
  AuthSessionModel.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
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
      deviceIdHash: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      deviceName: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      deviceType: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      browser: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      os: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      ipAddress: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      userAgentHash: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      lastActiveAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'auth_sessions',
      modelName: 'AuthSession',
      indexes: [
        {
          name: 'auth_sessions_user_revoked_last_active',
          fields: ['userId', 'revokedAt', 'lastActiveAt'],
        },
        {
          name: 'auth_sessions_user_device',
          fields: ['userId', 'deviceIdHash'],
        },
        {
          name: 'auth_sessions_expires_at',
          fields: ['expiresAt'],
        },
      ],
    },
  );

  return AuthSessionModel;
}
