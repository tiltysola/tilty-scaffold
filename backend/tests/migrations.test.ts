import { describe, expect, it } from 'vitest';

import { initModels } from '../src/composition/models';
import { createSequelize } from '../src/infra/database';
import { assertDatabaseMigrationsApplied, createMigrator } from '../src/infra/migrator';
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
      const authPasskeys = await queryInterface.describeTable('auth_passkeys');
      const authSessions = await queryInterface.describeTable('auth_sessions');
      const ssoIdentities = await queryInterface.describeTable('user_sso_identities');
      const userRoles = await queryInterface.describeTable('user_roles');
      const userIndexes = (await queryInterface.showIndex('users')) as unknown as DatabaseIndex[];
      const authPasskeyIndexes = (await queryInterface.showIndex('auth_passkeys')) as unknown as DatabaseIndex[];
      const authSessionIndexes = (await queryInterface.showIndex('auth_sessions')) as unknown as DatabaseIndex[];
      const roleIndexes = (await queryInterface.showIndex('roles')) as unknown as DatabaseIndex[];
      const rolePermissionIndexes = (await queryInterface.showIndex('role_permissions')) as unknown as DatabaseIndex[];
      const ssoIdentityIndexes = (await queryInterface.showIndex('user_sso_identities')) as unknown as DatabaseIndex[];
      const userRoleIndexes = (await queryInterface.showIndex('user_roles')) as unknown as DatabaseIndex[];

      expect(applied.map((migration) => migration.name)).toEqual(['0001-initial']);
      await expect(assertDatabaseMigrationsApplied(sequelize)).resolves.toBeUndefined();
      expect(users.avatarUrl).toBeDefined();
      expect(users.avatarStorageKey).toBeDefined();
      expect(users.displayName).toBeDefined();
      expect(users.gender).toBeDefined();
      expect(users.birthday).toBeDefined();
      expect(users.bio).toBeDefined();
      expect(users.location).toBeDefined();
      expect(users.websiteUrl).toBeDefined();
      expect(users.email).toBeDefined();
      expect(users.emailVerified).toBeDefined();
      expect(users.mfaAllowedMethods).toBeDefined();
      expect(users.mfaRequiredForSso).toBeDefined();
      expect(users.phoneNumber).toBeDefined();
      expect(users.phoneVerified).toBeDefined();
      expect(users.profileBannerUrl).toBeDefined();
      expect(users.profileBannerStorageKey).toBeDefined();
      expect(users.profileBackgroundUrl).toBeDefined();
      expect(users.profileBackgroundStorageKey).toBeDefined();
      expect(users.totpEnabled).toBeDefined();
      expect(users.totpRecoveryCodeHashes).toBeDefined();
      expect(users.totpSecretEncrypted).toBeDefined();
      expect(userIndexes.some((index) => index.name === 'users_available_created_at')).toBe(true);
      expect(userIndexes.some((index) => index.name === 'users_created_at_email')).toBe(true);
      expect(userIndexes.some((index) => index.name === 'users_phone_number')).toBe(true);
      expect(userIndexes.some((index) => index.name === 'users_username')).toBe(true);
      expect(authSessions.userId).toBeDefined();
      expect(authSessions.deviceIdHash).toBeDefined();
      expect(authSessions.deviceName).toBeDefined();
      expect(authSessions.deviceType).toBeDefined();
      expect(authSessions.browser).toBeDefined();
      expect(authSessions.os).toBeDefined();
      expect(authSessions.ipAddress).toBeDefined();
      expect(authSessions.userAgentHash).toBeDefined();
      expect(authSessions.lastActiveAt).toBeDefined();
      expect(authSessions.expiresAt).toBeDefined();
      expect(authSessions.revokedAt).toBeDefined();
      expect(authPasskeys.userId).toBeDefined();
      expect(authPasskeys.name).toBeDefined();
      expect(authPasskeys.credentialId).toBeDefined();
      expect(authPasskeys.publicKey).toBeDefined();
      expect(authPasskeys.webauthnUserId).toBeDefined();
      expect(authPasskeys.counter).toBeDefined();
      expect(authPasskeys.deviceType).toBeDefined();
      expect(authPasskeys.backedUp).toBeDefined();
      expect(authPasskeys.transports).toBeDefined();
      expect(authPasskeys.lastUsedAt).toBeDefined();
      expect(permissions.key).toBeDefined();
      expect(roles.key).toBeDefined();
      expect(rolePermissions.permissionKey).toBeDefined();
      expect(ssoIdentities.providerId).toBeDefined();
      expect(ssoIdentities.providerSubject).toBeDefined();
      expect(ssoIdentities.userId).toBeDefined();
      expect(userRoles.roleId).toBeDefined();
      expect(authPasskeyIndexes.some((index) => index.name === 'auth_passkeys_credential_id')).toBe(true);
      expect(authPasskeyIndexes.some((index) => index.name === 'auth_passkeys_user_created_at')).toBe(true);
      expect(authSessionIndexes.some((index) => index.name === 'auth_sessions_expires_at')).toBe(true);
      expect(authSessionIndexes.some((index) => index.name === 'auth_sessions_user_device')).toBe(true);
      expect(authSessionIndexes.some((index) => index.name === 'auth_sessions_user_revoked_last_active')).toBe(true);
      expect(roleIndexes.some((index) => index.name === 'roles_available_key')).toBe(true);
      expect(rolePermissionIndexes.some((index) => index.name === 'role_permissions_role_id_permission_key')).toBe(
        true,
      );
      expect(ssoIdentityIndexes.some((index) => index.name === 'user_sso_identities_provider_subject')).toBe(true);
      expect(ssoIdentityIndexes.some((index) => index.name === 'user_sso_identities_user_id')).toBe(true);
      expect(ssoIdentityIndexes.some((index) => index.name === 'user_sso_identities_user_provider')).toBe(true);
      expect(userRoleIndexes.some((index) => index.name === 'user_roles_user_id_role_id')).toBe(true);
      await expect(queryInterface.select(null, 'permissions')).resolves.toHaveLength(0);

      await new AccessControlService(initModels(sequelize)).syncSystemAccessControl();
      await expect(queryInterface.select(null, 'permissions')).resolves.toHaveLength(3);
      await expect(queryInterface.select(null, 'roles')).resolves.toHaveLength(3);

      const reverted = await migrator.down({ to: 0 });

      expect(reverted.map((migration) => migration.name)).toEqual(['0001-initial']);
      await expect(queryInterface.describeTable('auth_passkeys')).rejects.toThrow();
      await expect(queryInterface.describeTable('auth_sessions')).rejects.toThrow();
      await expect(queryInterface.describeTable('users')).rejects.toThrow();
      await expect(queryInterface.describeTable('roles')).rejects.toThrow();
    } finally {
      await sequelize.close();
    }
  });
});
