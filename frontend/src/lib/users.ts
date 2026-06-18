import { authenticatedApiRequest } from './auth';

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  system: boolean;
  available: boolean;
  permissionKeys: string[];
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

export interface UserListPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UserListResponse {
  pagination: UserListPagination;
  roles: RoleSummary[];
  users: UserListItem[];
}

interface FetchUsersOptions {
  page?: number;
  pageSize?: number;
}

export async function fetchUsers(options: FetchUsersOptions = {}) {
  const params = new URLSearchParams();

  if (options.page !== undefined) {
    params.set('page', String(options.page));
  }

  if (options.pageSize !== undefined) {
    params.set('pageSize', String(options.pageSize));
  }

  const query = params.toString();

  return authenticatedApiRequest<UserListResponse>(`/api/users/${query ? `?${query}` : ''}`);
}

export async function updateUserRoles(userId: string, roleKeys: string[]) {
  return authenticatedApiRequest<UserListItem>(`/api/users/${userId}/roles`, {
    body: {
      roleKeys,
    },
    method: 'PUT',
  });
}
