import { authenticatedApiRequest } from './auth';

export interface RoleSummary {
  available: boolean;
  description: string;
  id: string;
  key: string;
  name: string;
  permissionKeys: string[];
  system: boolean;
}

export interface UserListItem {
  available: boolean;
  avatarUrl?: string;
  createdAt: string;
  email: string;
  id: string;
  permissions: string[];
  roles: string[];
  updatedAt: string;
  username: string;
}

export interface UserListResponse {
  roles: RoleSummary[];
  users: UserListItem[];
}

export async function fetchUsers() {
  return authenticatedApiRequest<UserListResponse>('/api/users/');
}

export async function updateUserRoles(userId: string, roleKeys: string[]) {
  return authenticatedApiRequest<UserListItem>(`/api/users/${userId}/roles`, {
    body: {
      roleKeys,
    },
    method: 'PUT',
  });
}
