import { type ProfileImageFieldName } from '@tilty/shared/auth';

import {
  type AuthDeviceSession,
  authenticatedApiRequest,
  type MfaSettings,
  type PasskeySummary,
  type SsoIdentityPublic,
  type TotpStatus,
} from './auth';

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
  gender?: string;
  birthday?: string;
  bio?: string;
  location?: string;
  websiteUrl?: string;
  email: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneVerified: boolean;
  avatarUrl?: string;
  profileBannerUrl?: string;
  profileBackgroundUrl?: string;
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

export interface ManagedUserSecurity {
  mfaSettings: MfaSettings;
  passkeys: PasskeySummary[];
  totpStatus: TotpStatus;
}

export interface ManagedUserDetails {
  user: UserListItem;
  security: ManagedUserSecurity;
  devices: AuthDeviceSession[];
  ssoIdentities: SsoIdentityPublic[];
}

interface FetchUsersOptions {
  page?: number;
  pageSize?: number;
}

type UserImagePathSegment = 'avatar' | 'profile-banner' | 'profile-background';

export interface UpdateUserInput {
  username?: string;
  displayName?: string;
  gender?: string | null;
  birthday?: string | null;
  bio?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
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

  return authenticatedApiRequest<UserListResponse>(`/api/admin/users/${query ? `?${query}` : ''}`);
}

export async function updateUser(userId: string, input: UpdateUserInput) {
  return authenticatedApiRequest<UserListItem>(`/api/admin/users/${userId}`, {
    body: input,
    method: 'PUT',
  });
}

export async function fetchUserDetails(userId: string) {
  return authenticatedApiRequest<ManagedUserDetails>(`/api/admin/users/${userId}/details`, {
    method: 'GET',
  });
}

export function revokeUserDeviceSession(userId: string, sessionId: string) {
  return authenticatedApiRequest<{ revoked: true }>(`/api/admin/users/${userId}/devices/${sessionId}`, {
    method: 'DELETE',
  });
}

export function revokeUserDeviceSessions(userId: string) {
  return authenticatedApiRequest<{ revoked: true }>(`/api/admin/users/${userId}/devices`, {
    method: 'DELETE',
  });
}

export async function updateUserRoles(userId: string, roleKeys: string[]) {
  return authenticatedApiRequest<UserListItem>(`/api/admin/users/${userId}/roles`, {
    body: {
      roleKeys,
    },
    method: 'PUT',
  });
}

export async function updateUserMfaSettings(userId: string, input: { enabled?: boolean; requiredForSso?: boolean }) {
  return authenticatedApiRequest<ManagedUserSecurity>(`/api/admin/users/${userId}/mfa`, {
    body: input,
    method: 'PATCH',
  });
}

export async function disableUserTotp(userId: string) {
  return authenticatedApiRequest<ManagedUserSecurity>(`/api/admin/users/${userId}/totp/disable`, {
    method: 'POST',
  });
}

export async function deleteUserPasskey(userId: string, passkeyId: string) {
  return authenticatedApiRequest<ManagedUserSecurity>(`/api/admin/users/${userId}/passkeys/${passkeyId}`, {
    method: 'DELETE',
  });
}

export async function deleteUserSsoIdentity(userId: string, providerId: string) {
  return authenticatedApiRequest<{ identities: SsoIdentityPublic[] }>(
    `/api/admin/users/${userId}/sso-identities/${providerId}`,
    {
      method: 'DELETE',
    },
  );
}

export function uploadUserAvatar(userId: string, file: File) {
  return uploadUserImage(userId, 'avatar', 'avatar', file);
}

export function deleteUserAvatar(userId: string) {
  return authenticatedApiRequest<ManagedUserDetails>(`/api/admin/users/${userId}/avatar`, {
    method: 'DELETE',
  });
}

export function uploadUserProfileBanner(userId: string, file: File) {
  return uploadUserImage(userId, 'profile-banner', 'profileBanner', file);
}

export function deleteUserProfileBanner(userId: string) {
  return authenticatedApiRequest<ManagedUserDetails>(`/api/admin/users/${userId}/profile-banner`, {
    method: 'DELETE',
  });
}

export function uploadUserProfileBackground(userId: string, file: File) {
  return uploadUserImage(userId, 'profile-background', 'profileBackground', file);
}

export function deleteUserProfileBackground(userId: string) {
  return authenticatedApiRequest<ManagedUserDetails>(`/api/admin/users/${userId}/profile-background`, {
    method: 'DELETE',
  });
}

function uploadUserImage(userId: string, segment: UserImagePathSegment, fieldName: ProfileImageFieldName, file: File) {
  const form = new FormData();

  form.append(fieldName, file);

  return authenticatedApiRequest<ManagedUserDetails>(`/api/admin/users/${userId}/${segment}`, {
    body: form,
    method: 'POST',
  });
}
