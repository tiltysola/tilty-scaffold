import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

import { type ApiKeyStatus, apiKeyStatusValues } from '@tilty/shared/api-keys';

export class ApiKeyModel extends Model<InferAttributes<ApiKeyModel>, InferCreationAttributes<ApiKeyModel>> {
  declare id: string;
  declare userId: string;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare keyPrefix: string;
  declare keySuffix: string;
  declare keyHash: string;
  declare hashSecretVersion: string;
  declare fingerprint: string;
  declare status: ApiKeyStatus;
  declare expiresAt: CreationOptional<Date | null>;
  declare lastUsedAt: CreationOptional<Date | null>;
  declare lastUsedIp: CreationOptional<string | null>;
  declare lastUsedUserAgentHash: CreationOptional<string | null>;
  declare requestCount: CreationOptional<number>;
  declare createdByUserId: string;
  declare revokedByUserId: CreationOptional<string | null>;
  declare revokedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class ApiKeyAuditEventModel extends Model<
  InferAttributes<ApiKeyAuditEventModel>,
  InferCreationAttributes<ApiKeyAuditEventModel>
> {
  declare id: CreationOptional<string>;
  declare keyId: string;
  declare actorUserId: string;
  declare eventType: string;
  declare sourceIp: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initApiKeyModels(sequelize: Sequelize) {
  ApiKeyModel.init(
    {
      id: {
        type: DataTypes.STRING(32),
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
      name: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      keyPrefix: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      keySuffix: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      keyHash: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      hashSecretVersion: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      fingerprint: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(...apiKeyStatusValues),
        allowNull: false,
        defaultValue: 'active',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastUsedIp: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      lastUsedUserAgentHash: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      requestCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdByUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      revokedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
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
      tableName: 'api_keys',
      modelName: 'ApiKey',
      indexes: [
        {
          name: 'api_keys_user_status_expires',
          fields: ['userId', 'status', 'expiresAt'],
        },
        {
          name: 'api_keys_fingerprint',
          fields: ['fingerprint'],
          unique: true,
        },
        {
          name: 'api_keys_created_at',
          fields: [
            {
              name: 'createdAt',
              order: 'DESC',
            },
          ],
        },
      ],
    },
  );

  ApiKeyAuditEventModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      keyId: {
        type: DataTypes.STRING(32),
        allowNull: false,
        references: {
          model: 'api_keys',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      actorUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      eventType: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      sourceIp: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'api_key_audit_events',
      modelName: 'ApiKeyAuditEvent',
      indexes: [
        {
          name: 'api_key_audit_events_key_created',
          fields: ['keyId', 'createdAt'],
        },
        {
          name: 'api_key_audit_events_actor_created',
          fields: ['actorUserId', 'createdAt'],
        },
      ],
    },
  );

  return {
    apiKey: ApiKeyModel,
    apiKeyAuditEvent: ApiKeyAuditEventModel,
  };
}
