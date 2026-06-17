export const SystemPermission = {
  Root: 'ROOT',
  UserAdmin: 'USER_ADMIN',
  UserList: 'USER_LIST',
} as const;

export const systemPermissionKeys = [
  SystemPermission.Root,
  SystemPermission.UserAdmin,
  SystemPermission.UserList,
] as const;

export type SystemPermissionKey = (typeof systemPermissionKeys)[number];

export interface SystemPermissionDefinition {
  description: string;
  key: SystemPermissionKey;
  name: string;
}

export const systemPermissionDefinitions = [
  {
    key: SystemPermission.Root,
    name: 'Root',
    description: 'Bypass all permission checks.',
  },
  {
    key: SystemPermission.UserAdmin,
    name: 'User Administration',
    description: 'Manage user roles and user administration settings.',
  },
  {
    key: SystemPermission.UserList,
    name: 'User List',
    description: 'View the user directory.',
  },
] as const satisfies readonly SystemPermissionDefinition[];

export const SystemRole = {
  Root: 'ROOT',
  UserAdmin: 'USER_ADMIN',
  UserList: 'USER_LIST',
} as const;

export const systemRoleKeys = [SystemRole.Root, SystemRole.UserAdmin, SystemRole.UserList] as const;

export type SystemRoleKey = (typeof systemRoleKeys)[number];

export interface SystemRoleDefinition {
  description: string;
  key: SystemRoleKey;
  name: string;
  permissionKeys: readonly SystemPermissionKey[];
}

export const systemRoleDefinitions = [
  {
    key: SystemRole.Root,
    name: 'Root',
    description: 'Full platform administration.',
    permissionKeys: [SystemPermission.Root, SystemPermission.UserAdmin, SystemPermission.UserList],
  },
  {
    key: SystemRole.UserAdmin,
    name: 'User Administrator',
    description: 'Manage users and grant user-facing roles.',
    permissionKeys: [SystemPermission.UserAdmin, SystemPermission.UserList],
  },
  {
    key: SystemRole.UserList,
    name: 'User List Viewer',
    description: 'View the user directory.',
    permissionKeys: [SystemPermission.UserList],
  },
] as const satisfies readonly SystemRoleDefinition[];

export function hasPermission(permissionKeys: readonly string[] | undefined, requiredPermission: string) {
  return Boolean(permissionKeys?.includes(SystemPermission.Root) || permissionKeys?.includes(requiredPermission));
}

export function isSystemPermissionKey(value: string): value is SystemPermissionKey {
  return systemPermissionKeys.some((permissionKey) => permissionKey === value);
}

export function isSystemRoleKey(value: string): value is SystemRoleKey {
  return systemRoleKeys.some((roleKey) => roleKey === value);
}
