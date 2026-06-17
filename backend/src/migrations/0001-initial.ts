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
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
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

  const indexes = (await queryInterface.showIndex('users')) as Array<{ name?: string }>;

  if (!indexes.some((index) => index.name === 'users_available_created_at')) {
    await queryInterface.addIndex('users', ['available', 'createdAt'], {
      name: 'users_available_created_at',
    });
  }

  if (!indexes.some((index) => index.name === 'users_sso_subject')) {
    await queryInterface.addIndex('users', ['ssoSubject'], {
      name: 'users_sso_subject',
      unique: true,
    });
  }

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
  await queryInterface.dropTable('users');
};
