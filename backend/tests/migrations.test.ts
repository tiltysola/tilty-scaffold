import { describe, expect, it } from 'vitest';

import { createSequelize } from '../src/infra/database';
import { assertDatabaseMigrationsApplied, createMigrator } from '../src/infra/migrator';
import { initModels } from '../src/modules';
import { AccessControlService } from '../src/modules/access-control/access-control.service';

interface DatabaseIndex {
  name?: string;
}

describe('database migrations', () => {
  it('applies and rolls back migrations', async () => {
    const sequelize = createSequelize({ dialect: 'sqlite', storage: ':memory:' });
    const migrator = createMigrator(sequelize);
    const queryInterface = sequelize.getQueryInterface();

    try {
      await expect(assertDatabaseMigrationsApplied(sequelize)).rejects.toThrow(
        'Run `npm run db:migrate` from backend/ before starting the backend.',
      );

      const applied = await migrator.up();
      const users = await queryInterface.describeTable('users');
      const permissions = await queryInterface.describeTable('permissions');
      const roles = await queryInterface.describeTable('roles');
      const rolePermissions = await queryInterface.describeTable('role_permissions');
      const userRoles = await queryInterface.describeTable('user_roles');
      const userIndexes = (await queryInterface.showIndex('users')) as unknown as DatabaseIndex[];
      const roleIndexes = (await queryInterface.showIndex('roles')) as unknown as DatabaseIndex[];
      const rolePermissionIndexes = (await queryInterface.showIndex('role_permissions')) as unknown as DatabaseIndex[];
      const userRoleIndexes = (await queryInterface.showIndex('user_roles')) as unknown as DatabaseIndex[];

      expect(applied.map((migration) => migration.name)).toEqual(['0001-initial']);
      await expect(assertDatabaseMigrationsApplied(sequelize)).resolves.toBeUndefined();
      expect(users.avatarStorageKey).toBeDefined();
      expect(users.avatarUrl).toBeDefined();
      expect(users.displayName).toBeDefined();
      expect(users.email).toBeDefined();
      expect(users.ssoSubject).toBeDefined();
      expect(userIndexes.some((index) => index.name === 'users_available_created_at')).toBe(true);
      expect(userIndexes.some((index) => index.name === 'users_created_at_email')).toBe(true);
      expect(userIndexes.some((index) => index.name === 'users_sso_subject')).toBe(true);
      expect(userIndexes.some((index) => index.name === 'users_username')).toBe(true);
      expect(permissions.key).toBeDefined();
      expect(roles.key).toBeDefined();
      expect(rolePermissions.permissionKey).toBeDefined();
      expect(userRoles.roleId).toBeDefined();
      expect(roleIndexes.some((index) => index.name === 'roles_available_key')).toBe(true);
      expect(rolePermissionIndexes.some((index) => index.name === 'role_permissions_role_id_permission_key')).toBe(
        true,
      );
      expect(userRoleIndexes.some((index) => index.name === 'user_roles_user_id_role_id')).toBe(true);
      await expect(queryInterface.select(null, 'permissions')).resolves.toHaveLength(0);

      await new AccessControlService(initModels(sequelize)).syncSystemAccessControl();
      await expect(queryInterface.select(null, 'permissions')).resolves.toHaveLength(3);
      await expect(queryInterface.select(null, 'roles')).resolves.toHaveLength(3);

      const reverted = await migrator.down({ to: 0 });

      expect(reverted.map((migration) => migration.name)).toEqual(['0001-initial']);
      await expect(queryInterface.describeTable('users')).rejects.toThrow();
      await expect(queryInterface.describeTable('roles')).rejects.toThrow();
    } finally {
      await sequelize.close();
    }
  });
});
