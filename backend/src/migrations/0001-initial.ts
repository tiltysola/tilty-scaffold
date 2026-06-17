import { DataTypes, QueryInterface } from 'sequelize';
import { MigrationFn } from 'umzug';

export const name = '0001-initial';

export const up: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.createTable('users', {
    id: {
      type: DataTypes.UUID,
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
};

export const down: MigrationFn<QueryInterface> = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('users');
};
