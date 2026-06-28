import { DataTypes, type QueryInterface } from 'sequelize';
import { type MigrationFn } from 'umzug';

export const name = '0001-initial';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('users', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
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
      unique: true,
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  });

  await queryInterface.addIndex('users', ['available', 'createdAt'], {
    name: 'users_available_created_at',
  });
  await queryInterface.addIndex('users', ['username'], {
    name: 'users_username',
    unique: true,
  });
  await queryInterface.addIndex('users', {
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
    name: 'users_created_at_email',
  });
  await queryInterface.addIndex('users', ['phoneNumber'], {
    name: 'users_phone_number',
    unique: true,
  });

  await queryInterface.createTable('user_sso_identities', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.addIndex('user_sso_identities', ['providerId', 'providerSubject'], {
    name: 'user_sso_identities_provider_subject',
    unique: true,
  });
  await queryInterface.addIndex('user_sso_identities', ['userId'], {
    name: 'user_sso_identities_user_id',
  });
  await queryInterface.addIndex('user_sso_identities', ['userId', 'providerId'], {
    name: 'user_sso_identities_user_provider',
    unique: true,
  });

  await queryInterface.createTable('auth_passkeys', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.createTable('auth_sessions', {
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.addIndex('auth_passkeys', ['userId', 'createdAt'], {
    name: 'auth_passkeys_user_created_at',
  });
  await queryInterface.addIndex('auth_passkeys', ['credentialId'], {
    name: 'auth_passkeys_credential_id',
    unique: true,
  });
  await queryInterface.addIndex('auth_sessions', ['userId', 'revokedAt', 'lastActiveAt'], {
    name: 'auth_sessions_user_revoked_last_active',
  });
  await queryInterface.addIndex('auth_sessions', ['userId', 'deviceIdHash'], {
    name: 'auth_sessions_user_device',
  });
  await queryInterface.addIndex('auth_sessions', ['expiresAt'], {
    name: 'auth_sessions_expires_at',
  });

  await queryInterface.createTable('permissions', {
    key: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    system: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.createTable('roles', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    key: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(512),
      allowNull: false,
    },
    system: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    available: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.createTable('role_permissions', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    permissionKey: {
      type: DataTypes.STRING(64),
      allowNull: false,
      references: {
        model: 'permissions',
        key: 'key',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.createTable('user_roles', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
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
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await queryInterface.addIndex('roles', ['available', 'key'], {
    name: 'roles_available_key',
  });
  await queryInterface.addIndex('role_permissions', ['roleId', 'permissionKey'], {
    name: 'role_permissions_role_id_permission_key',
    unique: true,
  });
  await queryInterface.addIndex('user_roles', ['userId', 'roleId'], {
    name: 'user_roles_user_id_role_id',
    unique: true,
  });
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('user_roles');
  await queryInterface.dropTable('role_permissions');
  await queryInterface.dropTable('roles');
  await queryInterface.dropTable('permissions');
  await queryInterface.dropTable('auth_sessions');
  await queryInterface.dropTable('auth_passkeys');
  await queryInterface.dropTable('user_sso_identities');
  await queryInterface.dropTable('users');
};
