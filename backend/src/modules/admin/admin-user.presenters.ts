import { type UserAccess } from '../access-control/access-control.service';
import { type UserModel } from '../users/user.model';

export function toUserListItem(user: UserModel, access: UserAccess = { roles: [], permissions: [] }) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    ...(user.gender ? { gender: user.gender } : {}),
    ...(user.birthday ? { birthday: user.birthday } : {}),
    ...(user.bio ? { bio: user.bio } : {}),
    ...(user.location ? { location: user.location } : {}),
    ...(user.websiteUrl ? { websiteUrl: user.websiteUrl } : {}),
    email: user.email,
    emailVerified: user.emailVerified,
    ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
    phoneVerified: user.phoneVerified,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.profileBannerUrl ? { profileBannerUrl: user.profileBannerUrl } : {}),
    ...(user.profileBackgroundUrl ? { profileBackgroundUrl: user.profileBackgroundUrl } : {}),
    available: user.available,
    roles: access.roles,
    permissions: access.permissions,
    createdAt: toIsoString(user.createdAt),
    updatedAt: toIsoString(user.updatedAt),
  };
}

function toIsoString(value: Date) {
  return value.toISOString();
}
