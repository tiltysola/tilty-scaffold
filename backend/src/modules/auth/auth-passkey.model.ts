import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

export class AuthPasskeyModel extends Model<
  InferAttributes<AuthPasskeyModel>,
  InferCreationAttributes<AuthPasskeyModel>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare name: string;
  declare credentialId: string;
  declare publicKey: Buffer;
  declare webauthnUserId: string;
  declare counter: CreationOptional<number>;
  declare deviceType: string;
  declare backedUp: boolean;
  declare transports: CreationOptional<string | null>;
  declare lastUsedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initAuthPasskeyModel(sequelize: Sequelize) {
  AuthPasskeyModel.init(
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
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      credentialId: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      publicKey: {
        type: DataTypes.BLOB,
        allowNull: false,
      },
      webauthnUserId: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      counter: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        get() {
          const value = this.getDataValue('counter') as unknown;

          return typeof value === 'string' ? Number(value) : (value as number);
        },
      },
      deviceType: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      backedUp: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      transports: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'auth_passkeys',
      modelName: 'AuthPasskey',
      indexes: [
        {
          name: 'auth_passkeys_user_created_at',
          fields: ['userId', 'createdAt'],
        },
        {
          name: 'auth_passkeys_credential_id',
          unique: true,
          fields: ['credentialId'],
        },
      ],
    },
  );

  return AuthPasskeyModel;
}
