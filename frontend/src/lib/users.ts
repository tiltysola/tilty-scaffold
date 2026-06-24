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
  id: string;
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneVerified: boolean;
  avatarUrl?: string;
  available: boolean;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
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

export interface UpdateUserInput {
  username?: string;
  displayName?: string;
  email?: string;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  password?: string;
  available?: boolean;
  roleKeys?: string[];
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

export async function updateUser(userId: string, input: UpdateUserInput) {
  return authenticatedApiRequest<UserListItem>(`/api/users/${userId}`, {
    body: input,
    method: 'PUT',
  });
}

export async function updateUserRoles(userId: string, roleKeys: string[]) {
  return authenticatedApiRequest<UserListItem>(`/api/users/${userId}/roles`, {
    body: {
      roleKeys,
    },
    method: 'PUT',
  });
}
