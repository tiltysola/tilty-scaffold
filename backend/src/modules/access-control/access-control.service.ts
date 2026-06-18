import { Op } from 'sequelize';

import {
  hasPermission as hasGrantedPermission,
  systemPermissionDefinitions,
  systemPermissionKeys,
  SystemRole,
  systemRoleDefinitions,
  systemRoleKeys,
} from '@tilty/shared/access-control';

import { AppError } from '../../core/errors';
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

export class AccessControlService {
  constructor(private readonly models: AccessControlModels) {}

  async syncSystemAccessControl() {
    const sequelize = this.models.role.sequelize;

    if (!sequelize) {
      throw new Error('Access control models are not initialized.');
    }

    await sequelize.transaction(async (transaction) => {
      for (const permission of systemPermissionDefinitions) {
        const [record, created] = await this.models.permission.findOrCreate({
          transaction,
          where: {
            key: permission.key,
          },
          defaults: {
            key: permission.key,
            name: permission.name,
            description: permission.description,
            system: true,
          },
        });

        if (!created) {
          await record.update(
            {
              name: permission.name,
              description: permission.description,
              system: true,
            },
            {
              transaction,
            },
          );
        }
      }

      for (const role of systemRoleDefinitions) {
        const [record, created] = await this.models.role.findOrCreate({
          transaction,
          where: {
            key: role.key,
          },
          defaults: {
            key: role.key,
            name: role.name,
            description: role.description,
            system: true,
            available: true,
          },
        });

        if (!created) {
          await record.update(
            {
              name: role.name,
              description: role.description,
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

  async listPermissions() {
    const permissions = await this.models.permission.findAll({
      order: [['key', 'ASC']],
    });

    return permissions.map((permission) => ({
      key: permission.key,
      name: permission.name,
      description: permission.description,
      system: permission.system,
    }));
  }

  async listRoles() {
    const roles = await this.models.role.findAll({
      order: [
        ['system', 'DESC'],
        ['key', 'ASC'],
      ],
    });
    const permissionKeysByRoleId = await this.getPermissionKeysByRoleIds(roles.map((role) => role.id));

    return roles.map((role) => toRoleSummary(role, permissionKeysByRoleId.get(role.id) ?? []));
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
      throw new AppError('ROLE_NOT_FOUND', 'Role was not found.', 404);
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

  async replaceUserRoles(userId: string, roleKeys: string[]) {
    const normalizedRoleKeys = normalizeRoleKeys(roleKeys);
    const roles = await this.findAvailableRolesByKeys(normalizedRoleKeys);

    if (roles.length !== normalizedRoleKeys.length) {
      throw new AppError('ROLE_NOT_FOUND', 'One or more roles were not found.', 404);
    }

    await this.preventRemovingLastRoot(
      userId,
      roles.map((role) => role.id),
    );

    const sequelize = this.models.userRole.sequelize;

    if (!sequelize) {
      throw new Error('UserRole model is not initialized.');
    }

    await sequelize.transaction(async (transaction) => {
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
    });

    return this.getUserAccess(userId);
  }

  async can(userId: string, permissionKey: string) {
    return hasPermission(await this.getUserAccess(userId), permissionKey);
  }

  private async preventRemovingLastRoot(userId: string, nextRoleIds: string[]) {
    const rootRole = await this.findAvailableRoleByKey(SystemRole.Root);

    if (!rootRole || nextRoleIds.includes(rootRole.id)) {
      return;
    }

    const currentRootAssignment = await this.models.userRole.findOne({
      where: {
        userId,
        roleId: rootRole.id,
      },
    });

    if (!currentRootAssignment) {
      return;
    }

    const rootAssignmentCount = await this.models.userRole.count({
      where: {
        roleId: rootRole.id,
      },
    });

    if (rootAssignmentCount <= 1) {
      throw new AppError('LAST_ROOT_ROLE_REQUIRED', 'At least one available user must keep the ROOT role.', 409);
    }
  }

  private async findAvailableRoleByKey(roleKey: string) {
    return this.models.role.findOne({
      where: {
        key: roleKey,
        available: true,
      },
    });
  }

  private async findAvailableRolesByKeys(roleKeys: string[]) {
    if (!roleKeys.length) {
      return [];
    }

    return this.models.role.findAll({
      where: {
        key: {
          [Op.in]: roleKeys,
        },
        available: true,
      },
    });
  }

  private async getPermissionKeysByRoleIds(roleIds: string[]) {
    const permissionKeysByRoleId = new Map<string, string[]>();

    for (const roleId of roleIds) {
      permissionKeysByRoleId.set(roleId, []);
    }

    if (!roleIds.length) {
      return permissionKeysByRoleId;
    }

    const grants = await this.models.rolePermission.findAll({
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
    throw new AppError('AUTH_FORBIDDEN', 'You do not have permission to perform this action.', 403, {
      requiredPermission,
    });
  }
}

function toRoleSummary(role: RoleModel, permissionKeys: string[]): RoleSummary {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    system: role.system,
    available: role.available,
    permissionKeys,
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
