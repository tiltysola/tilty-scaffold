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

export const systemPermissionDefinitions = [
  {
    key: SystemPermission.Root,
  },
  {
    key: SystemPermission.UserAdmin,
  },
  {
    key: SystemPermission.UserList,
  },
] as const satisfies readonly { key: SystemPermissionKey }[];

export const SystemRole = {
  Root: 'ROOT',
  UserAdmin: 'USER_ADMIN',
  UserList: 'USER_LIST',
} as const;

export const systemRoleKeys = [SystemRole.Root, SystemRole.UserAdmin, SystemRole.UserList] as const;

export type SystemRoleKey = (typeof systemRoleKeys)[number];

export const systemRoleDefinitions = [
  {
    key: SystemRole.Root,
    permissionKeys: [SystemPermission.Root, SystemPermission.UserAdmin, SystemPermission.UserList],
  },
  {
    key: SystemRole.UserAdmin,
    permissionKeys: [SystemPermission.UserAdmin, SystemPermission.UserList],
  },
  {
    key: SystemRole.UserList,
    permissionKeys: [SystemPermission.UserList],
  },
] as const satisfies readonly { key: SystemRoleKey; permissionKeys: readonly SystemPermissionKey[] }[];

export function hasPermission(permissionKeys: readonly string[] | undefined, requiredPermission: string) {
  return Boolean(permissionKeys?.includes(SystemPermission.Root) || permissionKeys?.includes(requiredPermission));
}

export function isSystemPermissionKey(value: string): value is SystemPermissionKey {
  return systemPermissionKeys.some((permissionKey) => permissionKey === value);
}

export function isSystemRoleKey(value: string): value is SystemRoleKey {
  return systemRoleKeys.some((roleKey) => roleKey === value);
}
