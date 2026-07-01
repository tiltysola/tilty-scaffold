import { Op, type Transaction } from 'sequelize';

import {
  hasPermission as hasGrantedPermission,
  isSystemPermissionKey,
  isSystemRoleKey,
  SystemPermission,
  systemPermissionDefinitions,
  type SystemPermissionKey,
  systemPermissionKeys,
  SystemRole,
  systemRoleDefinitions,
  type SystemRoleKey,
  systemRoleKeys,
} from '@tilty/shared/access-control';
import { defaultLocale, type SupportedLocale } from '@tilty/shared/i18n';

import { AppError } from '../../core/errors';
import { type BackendMessageId, getBackendMessage } from '../../i18n';
import { type UserModel } from '../users/user.model';
import {
  type PermissionModel,
  type RoleModel,
  type RolePermissionModel,
  type UserRoleModel,
} from './access-control.model';

interface AccessControlModels {
  permission: typeof PermissionModel;
  role: typeof RoleModel;
  rolePermission: typeof RolePermissionModel;
  user: typeof UserModel;
  userRole: typeof UserRoleModel;
}

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  system: boolean;
  available: boolean;
  permissionKeys: string[];
}

export interface UserAccess {
  roles: string[];
  permissions: string[];
}

interface DatabaseWriteOptions {
  transaction?: Transaction;
}

type SystemAccessMessageIds<Key extends string> = Record<
  Key,
  { description: BackendMessageId; name: BackendMessageId }
>;

const systemPermissionMessageIds = {
  [SystemPermission.Root]: {
    description: 'access.permission.ROOT.description',
    name: 'access.permission.ROOT.name',
  },
  [SystemPermission.UserAdmin]: {
    description: 'access.permission.USER_ADMIN.description',
    name: 'access.permission.USER_ADMIN.name',
  },
  [SystemPermission.UserList]: {
    description: 'access.permission.USER_LIST.description',
    name: 'access.permission.USER_LIST.name',
  },
} as const satisfies SystemAccessMessageIds<SystemPermissionKey>;

const systemRoleMessageIds = {
  [SystemRole.Root]: {
    description: 'access.role.ROOT.description',
    name: 'access.role.ROOT.name',
  },
  [SystemRole.UserAdmin]: {
    description: 'access.role.USER_ADMIN.description',
    name: 'access.role.USER_ADMIN.name',
  },
  [SystemRole.UserList]: {
    description: 'access.role.USER_LIST.description',
    name: 'access.role.USER_LIST.name',
  },
} as const satisfies SystemAccessMessageIds<SystemRoleKey>;

export class AccessControlService {
  constructor(private readonly models: AccessControlModels) {}

  async syncSystemAccessControl() {
    const sequelize = this.models.role.sequelize;

    if (!sequelize) {
      throw new Error('Access control models are not initialized.');
    }

    await sequelize.transaction(async (transaction) => {
      for (const permission of systemPermissionDefinitions) {
        const messages = systemPermissionMessageIds[permission.key];
        const name = getBackendMessage(defaultLocale, messages.name);
        const description = getBackendMessage(defaultLocale, messages.description);
        const [record, created] = await this.models.permission.findOrCreate({
          transaction,
          where: {
            key: permission.key,
          },
          defaults: {
            key: permission.key,
            name,
            description,
            system: true,
          },
        });

        if (!created) {
          await record.update(
            {
              name,
              description,
              system: true,
            },
            {
              transaction,
            },
          );
        }
      }

      for (const role of systemRoleDefinitions) {
        const messages = systemRoleMessageIds[role.key];
        const name = getBackendMessage(defaultLocale, messages.name);
        const description = getBackendMessage(defaultLocale, messages.description);
        const [record, created] = await this.models.role.findOrCreate({
          transaction,
          where: {
            key: role.key,
          },
          defaults: {
            key: role.key,
            name,
            description,
            system: true,
            available: true,
          },
        });

        if (!created) {
          await record.update(
            {
              name,
              description,
              system: true,
              available: true,
            },
            {
              transaction,
            },
          );
        }

        await this.models.rolePermission.destroy({
          transaction,
          where: {
            roleId: record.id,
            permissionKey: {
              [Op.notIn]: [...role.permissionKeys],
            },
          },
        });

        await this.models.rolePermission.bulkCreate(
          role.permissionKeys.map((permissionKey) => ({
            roleId: record.id,
            permissionKey,
          })),
          {
            ignoreDuplicates: true,
            transaction,
          },
        );
      }
    });
  }

  async listPermissions(locale: SupportedLocale = defaultLocale) {
    const permissions = await this.models.permission.findAll({
      order: [['key', 'ASC']],
    });

    return permissions.map((permission) => toPermissionSummary(permission, locale));
  }

  async listRoles(locale: SupportedLocale = defaultLocale) {
    const roles = await this.models.role.findAll({
      order: [
        ['system', 'DESC'],
        ['key', 'ASC'],
      ],
    });
    const permissionKeysByRoleId = await this.getPermissionKeysByRoleIds(roles.map((role) => role.id));

    return roles.map((role) => toRoleSummary(role, permissionKeysByRoleId.get(role.id) ?? [], locale));
  }

  async getUserAccess(userId: string) {
    return (await this.getUsersAccess([userId])).get(userId) ?? createEmptyAccess();
  }

  async getUsersAccess(userIds: string[]) {
    const accessByUserId = new Map<string, UserAccess>();

    for (const userId of userIds) {
      accessByUserId.set(userId, createEmptyAccess());
    }

    if (!userIds.length) {
      return accessByUserId;
    }

    const assignments = await this.models.userRole.findAll({
      where: {
        userId: {
          [Op.in]: userIds,
        },
      },
    });
    const roleIds = unique(assignments.map((assignment) => assignment.roleId));

    if (!roleIds.length) {
      return accessByUserId;
    }

    const roles = await this.models.role.findAll({
      where: {
        id: {
          [Op.in]: roleIds,
        },
        available: true,
      },
    });
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const permissionKeysByRoleId = await this.getPermissionKeysByRoleIds(roles.map((role) => role.id));

    for (const assignment of assignments) {
      const role = roleById.get(assignment.roleId);

      if (!role) {
        continue;
      }

      const access = accessByUserId.get(assignment.userId) ?? createEmptyAccess();

      access.roles = sortKeys(unique([...access.roles, role.key]), systemRoleKeys);
      access.permissions = sortKeys(
        unique([...access.permissions, ...(permissionKeysByRoleId.get(role.id) ?? [])]),
        systemPermissionKeys,
      );
      accessByUserId.set(assignment.userId, access);
    }

    return accessByUserId;
  }

  async assignSystemRoleToUser(userId: string, roleKey: string) {
    const role = await this.findAvailableRoleByKey(roleKey);

    if (!role?.system) {
      throw new AppError('ROLE_NOT_FOUND', 'error.ROLE_NOT_FOUND', 404);
    }

    await this.models.userRole.findOrCreate({
      where: {
        userId,
        roleId: role.id,
      },
      defaults: {
        userId,
        roleId: role.id,
      },
    });
  }

  async replaceUserRoles(userId: string, roleKeys: string[], options: DatabaseWriteOptions = {}) {
    const normalizedRoleKeys = normalizeRoleKeys(roleKeys);
    const roles = await this.findAvailableRolesByKeys(normalizedRoleKeys, options);

    if (roles.length !== normalizedRoleKeys.length) {
      throw new AppError('ROLE_NOT_FOUND', 'error.ROLE_NOT_FOUND', 404);
    }

    await this.preventRemovingLastRoot(
      userId,
      roles.map((role) => role.id),
      options,
    );

    const sequelize = this.models.userRole.sequelize;

    if (!sequelize) {
      throw new Error('UserRole model is not initialized.');
    }

    const replaceAssignments = async (transaction: Transaction) => {
      await this.models.userRole.destroy({
        transaction,
        where: {
          userId,
        },
      });

      if (!roles.length) {
        return;
      }

      await this.models.userRole.bulkCreate(
        roles.map((role) => ({
          userId,
          roleId: role.id,
        })),
        {
          transaction,
        },
      );
    };

    if (options.transaction) {
      await replaceAssignments(options.transaction);
    } else {
      await sequelize.transaction(replaceAssignments);
    }

    const permissionKeysByRoleId = await this.getPermissionKeysByRoleIds(
      roles.map((role) => role.id),
      options,
    );

    return createAccessFromRoles(roles, permissionKeysByRoleId);
  }

  async assertCanDisableUser(userId: string, options: DatabaseWriteOptions = {}) {
    const rootRole = await this.findAvailableRoleByKey(SystemRole.Root, options);

    if (!rootRole) {
      return;
    }

    const currentRootAssignment = await this.models.userRole.findOne({
      ...withTransaction(options),
      where: {
        userId,
        roleId: rootRole.id,
      },
    });

    if (!currentRootAssignment) {
      return;
    }

    const otherAvailableRootUsers = await this.countOtherAvailableRootUsers(userId, rootRole.id, options);

    if (otherAvailableRootUsers <= 0) {
      throwLastRootRequired();
    }
  }

  async can(userId: string, permissionKey: string) {
    return hasPermission(await this.getUserAccess(userId), permissionKey);
  }

  private async preventRemovingLastRoot(userId: string, nextRoleIds: string[], options: DatabaseWriteOptions = {}) {
    const rootRole = await this.findAvailableRoleByKey(SystemRole.Root, options);

    if (!rootRole || nextRoleIds.includes(rootRole.id)) {
      return;
    }

    const currentRootAssignment = await this.models.userRole.findOne({
      ...withTransaction(options),
      where: {
        userId,
        roleId: rootRole.id,
      },
    });

    if (!currentRootAssignment) {
      return;
    }

    const otherAvailableRootUsers = await this.countOtherAvailableRootUsers(userId, rootRole.id, options);

    if (otherAvailableRootUsers <= 0) {
      throwLastRootRequired();
    }
  }

  private async countOtherAvailableRootUsers(userId: string, rootRoleId: string, options: DatabaseWriteOptions = {}) {
    const assignments = await this.models.userRole.findAll({
      ...withTransaction(options),
      where: {
        roleId: rootRoleId,
        userId: {
          [Op.ne]: userId,
        },
      },
    });
    const userIds = unique(assignments.map((assignment) => assignment.userId));

    if (!userIds.length) {
      return 0;
    }

    return this.models.user.count({
      ...withTransaction(options),
      where: {
        id: {
          [Op.in]: userIds,
        },
        available: true,
      },
    });
  }

  private async findAvailableRoleByKey(roleKey: string, options: DatabaseWriteOptions = {}) {
    return this.models.role.findOne({
      ...withTransaction(options),
      where: {
        key: roleKey,
        available: true,
      },
    });
  }

  private async findAvailableRolesByKeys(roleKeys: string[], options: DatabaseWriteOptions = {}) {
    if (!roleKeys.length) {
      return [];
    }

    return this.models.role.findAll({
      ...withTransaction(options),
      where: {
        key: {
          [Op.in]: roleKeys,
        },
        available: true,
      },
    });
  }

  private async getPermissionKeysByRoleIds(roleIds: string[], options: DatabaseWriteOptions = {}) {
    const permissionKeysByRoleId = new Map<string, string[]>();

    for (const roleId of roleIds) {
      permissionKeysByRoleId.set(roleId, []);
    }

    if (!roleIds.length) {
      return permissionKeysByRoleId;
    }

    const grants = await this.models.rolePermission.findAll({
      ...withTransaction(options),
      where: {
        roleId: {
          [Op.in]: roleIds,
        },
      },
    });

    for (const grant of grants) {
      permissionKeysByRoleId.set(
        grant.roleId,
        sortKeys(
          unique([...(permissionKeysByRoleId.get(grant.roleId) ?? []), grant.permissionKey]),
          systemPermissionKeys,
        ),
      );
    }

    return permissionKeysByRoleId;
  }
}

export function hasPermission(access: UserAccess, requiredPermission: string) {
  return hasGrantedPermission(access.permissions, requiredPermission);
}

export function assertPermission(access: UserAccess, requiredPermission: string) {
  if (!hasPermission(access, requiredPermission)) {
    throw new AppError('AUTH_FORBIDDEN', 'error.AUTH_FORBIDDEN', 403, {
      requiredPermission,
    });
  }
}

function toPermissionSummary(permission: PermissionModel, locale: SupportedLocale) {
  const systemMessages =
    permission.system && isSystemPermissionKey(permission.key) ? systemPermissionMessageIds[permission.key] : null;

  return {
    key: permission.key,
    name: systemMessages ? getBackendMessage(locale, systemMessages.name) : permission.name,
    description: systemMessages ? getBackendMessage(locale, systemMessages.description) : permission.description,
    system: permission.system,
  };
}

function toRoleSummary(role: RoleModel, permissionKeys: string[], locale: SupportedLocale): RoleSummary {
  const systemMessages = role.system && isSystemRoleKey(role.key) ? systemRoleMessageIds[role.key] : null;

  return {
    id: role.id,
    key: role.key,
    name: systemMessages ? getBackendMessage(locale, systemMessages.name) : role.name,
    description: systemMessages ? getBackendMessage(locale, systemMessages.description) : role.description,
    system: role.system,
    available: role.available,
    permissionKeys,
  };
}

function createAccessFromRoles(roles: RoleModel[], permissionKeysByRoleId: Map<string, string[]>): UserAccess {
  return {
    roles: sortKeys(unique(roles.map((role) => role.key)), systemRoleKeys),
    permissions: sortKeys(
      unique(roles.flatMap((role) => permissionKeysByRoleId.get(role.id) ?? [])),
      systemPermissionKeys,
    ),
  };
}

function createEmptyAccess(): UserAccess {
  return {
    roles: [],
    permissions: [],
  };
}

function normalizeRoleKeys(roleKeys: string[]) {
  return unique(roleKeys.map((roleKey) => roleKey.trim()).filter(Boolean));
}

function withTransaction(options: DatabaseWriteOptions) {
  return options.transaction ? { transaction: options.transaction } : {};
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function sortKeys(keys: string[], systemOrder: readonly string[]) {
  const order = new Map(systemOrder.map((key, index) => [key, index]));

  return [...keys].sort((left, right) => {
    const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.localeCompare(right);
  });
}

function throwLastRootRequired(): never {
  throw new AppError('LAST_ROOT_ROLE_REQUIRED', 'error.LAST_ROOT_ROLE_REQUIRED', 409);
}
