import { type IntlShape } from 'react-intl';

import { formatDateValue } from '@/i18n';
import { type PhoneCountryCode } from '@/lib/auth';
import { composePhoneNumber } from '@/lib/phone';
import {
  deleteUserAvatar,
  deleteUserProfileBackground,
  deleteUserProfileBanner,
  type ManagedUserDetails,
  type RoleSummary,
  type UpdateUserInput,
  uploadUserAvatar,
  uploadUserProfileBackground,
  uploadUserProfileBanner,
  type UserListItem,
  type UserListPagination,
} from '@/lib/users';
import {
  displayNameSchema,
  emailSchema,
  passwordSchema,
  phoneNumberSchema,
  profileBioSchema,
  profileBirthdaySchema,
  profileGenderSchema,
  profileLocationSchema,
  profileWebsiteUrlSchema,
  usernameSchema,
} from '@tilty/shared/validation';

export interface EditUserForm {
  username: string;
  displayName: string;
  gender: string;
  birthday: string;
  bio: string;
  location: string;
  websiteUrl: string;
  email: string;
  emailVerified: boolean;
  phoneCountryCode: PhoneCountryCode;
  phoneLocalNumber: string;
  phoneVerified: boolean;
  password: string;
  available: boolean;
}

export type UserImageTarget = 'avatar' | 'profileBanner' | 'profileBackground';

interface UserImageConfig {
  aspect: number;
  cropShape?: 'rect' | 'round';
  getUrl: (user: UserListItem) => string | undefined;
  output: {
    contentType?: string;
    fileName: string;
    height: number;
    width: number;
  };
  remove: (userId: string) => Promise<ManagedUserDetails>;
  showAdjustments?: boolean;
  upload: (userId: string, file: File) => Promise<ManagedUserDetails>;
}

export const userPageSize = 20;

export const defaultPagination: UserListPagination = {
  page: 1,
  pageSize: userPageSize,
  total: 0,
  totalPages: 0,
};

export const defaultEditUserForm: EditUserForm = {
  username: '',
  displayName: '',
  gender: '',
  birthday: '',
  bio: '',
  location: '',
  websiteUrl: '',
  email: '',
  emailVerified: false,
  phoneCountryCode: '+86',
  phoneLocalNumber: '',
  phoneVerified: false,
  password: '',
  available: true,
};

export const userImageConfigs: Record<UserImageTarget, UserImageConfig> = {
  avatar: {
    aspect: 1,
    cropShape: 'round',
    getUrl: (user) => user.avatarUrl,
    output: {
      fileName: 'avatar.png',
      height: 512,
      width: 512,
    },
    remove: deleteUserAvatar,
    upload: uploadUserAvatar,
  },
  profileBanner: {
    aspect: 4,
    getUrl: (user) => user.profileBannerUrl,
    output: {
      contentType: 'image/webp',
      fileName: 'profile-banner.webp',
      height: 400,
      width: 1600,
    },
    remove: deleteUserProfileBanner,
    showAdjustments: true,
    upload: uploadUserProfileBanner,
  },
  profileBackground: {
    aspect: 16 / 9,
    getUrl: (user) => user.profileBackgroundUrl,
    output: {
      contentType: 'image/webp',
      fileName: 'profile-background.webp',
      height: 1080,
      width: 1920,
    },
    remove: deleteUserProfileBackground,
    showAdjustments: true,
    upload: uploadUserProfileBackground,
  },
};

export function getUniqueRoleKeys(roleKeys: string[]) {
  return [...new Set(roleKeys)];
}

export function haveSameRoleKeys(left: string[], right: string[]) {
  return left.length === right.length && left.every((roleKey) => right.includes(roleKey));
}

export function resolveSelectedPermissionKeys(roles: RoleSummary[], selectedRoleKeys: string[]) {
  const selectedRoleSet = new Set(selectedRoleKeys);
  const permissionKeySet = new Set<string>();

  roles.forEach((role) => {
    if (!selectedRoleSet.has(role.key)) {
      return;
    }

    role.permissionKeys.forEach((permissionKey) => permissionKeySet.add(permissionKey));
  });

  return Array.from(permissionKeySet).sort();
}

export function getUserFallback(displayName: string) {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U'
  );
}

export function getVerifiedStateTooltip(label: string, verified: boolean, reason?: string) {
  const state = `${label} ${verified ? 'verified' : 'unverified'}`;

  return reason ? `${state} ${reason}` : state;
}

export function formatVerifiedStateTooltip(intl: IntlShape, label: string, verified: boolean, reason?: string) {
  const messageId = reason
    ? 'users.edit.verification.state.tooltip.with.reason'
    : 'users.edit.verification.state.tooltip';

  return intl.formatMessage(
    { id: messageId },
    {
      label,
      reason,
      state: intl.formatMessage({ id: verified ? 'users.edit.verified.state' : 'users.edit.unverified.state' }),
    },
  );
}

export function getImageLabel(target: UserImageTarget | null, intl: IntlShape) {
  if (target === 'avatar') {
    return intl.formatMessage({ id: 'profile.avatar' });
  }

  if (target === 'profileBanner') {
    return intl.formatMessage({ id: 'profile.banner' });
  }

  return intl.formatMessage({ id: 'profile.background' });
}

export function getImageUploadTitle(target: UserImageTarget, intl: IntlShape) {
  if (target === 'avatar') {
    return intl.formatMessage({ id: 'profile.image.upload.avatar' });
  }

  if (target === 'profileBanner') {
    return intl.formatMessage({ id: 'profile.image.upload.banner' });
  }

  return intl.formatMessage({ id: 'profile.image.upload.background' });
}

export function getImageUploadDescription(target: UserImageTarget, intl: IntlShape) {
  if (target === 'avatar') {
    return intl.formatMessage({ id: 'users.profile.visuals.avatar.upload.description' });
  }

  if (target === 'profileBanner') {
    return intl.formatMessage({ id: 'users.profile.visuals.banner.upload.description' });
  }

  return intl.formatMessage({ id: 'users.profile.visuals.background.upload.description' });
}

export function getImageUpdatedMessageId(target: UserImageTarget | null) {
  if (target === 'avatar') {
    return 'profile.avatar.updated';
  }

  if (target === 'profileBanner') {
    return 'profile.banner.updated';
  }

  return 'profile.background.updated';
}

export function getImageRemovedMessageId(target: UserImageTarget | null) {
  if (target === 'avatar') {
    return 'profile.avatar.removed';
  }

  if (target === 'profileBanner') {
    return 'profile.banner.removed';
  }

  return 'profile.background.removed';
}

export function isEditUserFormChanged(
  form: EditUserForm,
  user: UserListItem,
  phoneBindingEnabled: boolean,
  profileEmailVerificationEnabled: boolean,
) {
  const phoneNumber = phoneBindingEnabled ? composePhoneNumber(form) : (user.phoneNumber ?? '');

  return (
    form.username !== user.username ||
    form.displayName !== user.displayName ||
    form.gender !== (user.gender ?? '') ||
    form.birthday !== (user.birthday ?? '') ||
    form.bio !== (user.bio ?? '') ||
    form.location !== (user.location ?? '') ||
    form.websiteUrl !== (user.websiteUrl ?? '') ||
    form.email !== user.email ||
    (profileEmailVerificationEnabled && form.emailVerified !== user.emailVerified) ||
    (phoneBindingEnabled && phoneNumber !== (user.phoneNumber ?? '')) ||
    (phoneBindingEnabled && form.phoneVerified !== user.phoneVerified) ||
    form.password.length > 0 ||
    form.available !== user.available
  );
}

export function parseEditUserForm(
  form: EditUserForm,
  user: UserListItem,
  phoneBindingEnabled: boolean,
  profileEmailVerificationEnabled: boolean,
):
  | {
      success: true;
      data: UpdateUserInput;
    }
  | {
      success: false;
      error: string;
    } {
  const updateUserInput: UpdateUserInput = {};

  if (form.username !== user.username) {
    const username = usernameSchema.safeParse(form.username);

    if (!username.success) {
      return { success: false, error: username.error.issues[0]?.message ?? 'validation.username.invalid' };
    }

    updateUserInput.username = username.data;
  }

  if (form.displayName !== user.displayName) {
    const displayName = displayNameSchema.safeParse(form.displayName);

    if (!displayName.success) {
      return { success: false, error: displayName.error.issues[0]?.message ?? 'validation.display.name.invalid' };
    }

    updateUserInput.displayName = displayName.data;
  }

  if (form.gender !== (user.gender ?? '')) {
    const gender = profileGenderSchema.safeParse(form.gender);

    if (!gender.success) {
      return { success: false, error: gender.error.issues[0]?.message ?? 'validation.profile.gender.invalid' };
    }

    updateUserInput.gender = gender.data;
  }

  if (form.birthday !== (user.birthday ?? '')) {
    const birthday = profileBirthdaySchema.safeParse(form.birthday);

    if (!birthday.success) {
      return { success: false, error: birthday.error.issues[0]?.message ?? 'validation.birthday.invalid' };
    }

    updateUserInput.birthday = birthday.data;
  }

  if (form.bio !== (user.bio ?? '')) {
    const bio = profileBioSchema.safeParse(form.bio);

    if (!bio.success) {
      return { success: false, error: bio.error.issues[0]?.message ?? 'validation.profile.bio.invalid' };
    }

    updateUserInput.bio = bio.data;
  }

  if (form.location !== (user.location ?? '')) {
    const location = profileLocationSchema.safeParse(form.location);

    if (!location.success) {
      return { success: false, error: location.error.issues[0]?.message ?? 'validation.profile.location.invalid' };
    }

    updateUserInput.location = location.data;
  }

  if (form.websiteUrl !== (user.websiteUrl ?? '')) {
    const websiteUrl = profileWebsiteUrlSchema.safeParse(form.websiteUrl);

    if (!websiteUrl.success) {
      return { success: false, error: websiteUrl.error.issues[0]?.message ?? 'validation.homepage.url.invalid' };
    }

    updateUserInput.websiteUrl = websiteUrl.data;
  }

  if (form.email !== user.email) {
    const email = emailSchema.safeParse(form.email);

    if (!email.success) {
      return { success: false, error: email.error.issues[0]?.message ?? 'validation.email.invalid' };
    }

    updateUserInput.email = email.data;
  }

  if (
    profileEmailVerificationEnabled &&
    (updateUserInput.email !== undefined || form.emailVerified !== user.emailVerified)
  ) {
    updateUserInput.emailVerified = form.emailVerified;
  }

  const phoneNumberDraft = phoneBindingEnabled ? composePhoneNumber(form) : (user.phoneNumber ?? '');

  if (phoneBindingEnabled && phoneNumberDraft !== (user.phoneNumber ?? '')) {
    if (phoneNumberDraft) {
      const phoneNumber = phoneNumberSchema.safeParse(phoneNumberDraft);

      if (!phoneNumber.success) {
        return { success: false, error: phoneNumber.error.issues[0]?.message ?? 'validation.phone.number.invalid' };
      }

      updateUserInput.phoneNumber = phoneNumber.data;
    } else {
      updateUserInput.phoneNumber = null;
    }
  }

  const nextPhoneNumber =
    updateUserInput.phoneNumber !== undefined ? updateUserInput.phoneNumber : (user.phoneNumber ?? null);

  if (phoneBindingEnabled && form.phoneVerified && !nextPhoneNumber) {
    return { success: false, error: 'users.edit.phone.required.before.verification' };
  }

  if (phoneBindingEnabled && (updateUserInput.phoneNumber !== undefined || form.phoneVerified !== user.phoneVerified)) {
    updateUserInput.phoneVerified = form.phoneVerified;
  }

  if (form.password.length > 0) {
    const password = passwordSchema.safeParse(form.password);

    if (!password.success) {
      return { success: false, error: password.error.issues[0]?.message ?? 'validation.password.invalid' };
    }

    updateUserInput.password = password.data;
  }

  if (form.available !== user.available) {
    updateUserInput.available = form.available;
  }

  return { success: true, data: updateUserInput };
}

export function formatDate(value: string, locale: string) {
  return formatDateValue(value, locale);
}
