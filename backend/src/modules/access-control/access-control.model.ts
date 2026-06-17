import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';

export class PermissionModel extends Model<InferAttributes<PermissionModel>, InferCreationAttributes<PermissionModel>> {
  declare key: string;
  declare name: string;
  declare description: string;
  declare system: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class RoleModel extends Model<InferAttributes<RoleModel>, InferCreationAttributes<RoleModel>> {
  declare id: CreationOptional<string>;
  declare key: string;
  declare name: string;
  declare description: string;
  declare system: CreationOptional<boolean>;
  declare available: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class RolePermissionModel extends Model<
  InferAttributes<RolePermissionModel>,
  InferCreationAttributes<RolePermissionModel>
> {
  declare id: CreationOptional<string>;
  declare roleId: string;
  declare permissionKey: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class UserRoleModel extends Model<InferAttributes<UserRoleModel>, InferCreationAttributes<UserRoleModel>> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare roleId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initAccessControlModels(sequelize: Sequelize) {
  PermissionModel.init(
    {
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
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'permissions',
      modelName: 'Permission',
    },
  );

  RoleModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: 'roles_key',
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
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'roles',
      modelName: 'Role',
      indexes: [
        {
          name: 'roles_available_key',
          fields: ['available', 'key'],
        },
      ],
    },
  );

  RolePermissionModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      roleId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      permissionKey: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'role_permissions',
      modelName: 'RolePermission',
      indexes: [
        {
          name: 'role_permissions_role_id_permission_key',
          fields: ['roleId', 'permissionKey'],
          unique: true,
        },
      ],
    },
  );

  UserRoleModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      roleId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'user_roles',
      modelName: 'UserRole',
      indexes: [
        {
          name: 'user_roles_user_id_role_id',
          fields: ['userId', 'roleId'],
          unique: true,
        },
      ],
    },
  );

  return {
    permission: PermissionModel,
    role: RoleModel,
    rolePermission: RolePermissionModel,
    userRole: UserRoleModel,
  };
}
