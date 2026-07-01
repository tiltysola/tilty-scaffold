import { formatDateValue } from '@/i18n';
import { type PhoneCountryCode } from '@/lib/auth';
import { composePhoneNumber } from '@/lib/phone';
import { type UpdateUserInput, type UserListItem, type UserListPagination } from '@/lib/users';
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

export function unique(values: string[]) {
  return [...new Set(values)];
}

export function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export function getVerifiedStateTooltip(label: string, verified: boolean, reason?: string) {
  const state = `${label} ${verified ? 'verified' : 'unverified'}`;

  return reason ? `${state} ${reason}` : state;
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
  const data: UpdateUserInput = {};

  if (form.username !== user.username) {
    const username = usernameSchema.safeParse(form.username);

    if (!username.success) {
      return { success: false, error: username.error.issues[0]?.message ?? 'validation.username.invalid' };
    }

    data.username = username.data;
  }

  if (form.displayName !== user.displayName) {
    const displayName = displayNameSchema.safeParse(form.displayName);

    if (!displayName.success) {
      return { success: false, error: displayName.error.issues[0]?.message ?? 'validation.display.name.invalid' };
    }

    data.displayName = displayName.data;
  }

  if (form.gender !== (user.gender ?? '')) {
    const gender = profileGenderSchema.safeParse(form.gender);

    if (!gender.success) {
      return { success: false, error: gender.error.issues[0]?.message ?? 'validation.profile.gender.invalid' };
    }

    data.gender = gender.data;
  }

  if (form.birthday !== (user.birthday ?? '')) {
    const birthday = profileBirthdaySchema.safeParse(form.birthday);

    if (!birthday.success) {
      return { success: false, error: birthday.error.issues[0]?.message ?? 'validation.birthday.invalid' };
    }

    data.birthday = birthday.data;
  }

  if (form.bio !== (user.bio ?? '')) {
    const bio = profileBioSchema.safeParse(form.bio);

    if (!bio.success) {
      return { success: false, error: bio.error.issues[0]?.message ?? 'validation.profile.bio.invalid' };
    }

    data.bio = bio.data;
  }

  if (form.location !== (user.location ?? '')) {
    const location = profileLocationSchema.safeParse(form.location);

    if (!location.success) {
      return { success: false, error: location.error.issues[0]?.message ?? 'validation.profile.location.invalid' };
    }

    data.location = location.data;
  }

  if (form.websiteUrl !== (user.websiteUrl ?? '')) {
    const websiteUrl = profileWebsiteUrlSchema.safeParse(form.websiteUrl);

    if (!websiteUrl.success) {
      return { success: false, error: websiteUrl.error.issues[0]?.message ?? 'validation.homepage.url.invalid' };
    }

    data.websiteUrl = websiteUrl.data;
  }

  if (form.email !== user.email) {
    const email = emailSchema.safeParse(form.email);

    if (!email.success) {
      return { success: false, error: email.error.issues[0]?.message ?? 'validation.email.invalid' };
    }

    data.email = email.data;
  }

  if (profileEmailVerificationEnabled && (data.email !== undefined || form.emailVerified !== user.emailVerified)) {
    data.emailVerified = form.emailVerified;
  }

  const phoneNumberDraft = phoneBindingEnabled ? composePhoneNumber(form) : (user.phoneNumber ?? '');

  if (phoneBindingEnabled && phoneNumberDraft !== (user.phoneNumber ?? '')) {
    if (phoneNumberDraft) {
      const phoneNumber = phoneNumberSchema.safeParse(phoneNumberDraft);

      if (!phoneNumber.success) {
        return { success: false, error: phoneNumber.error.issues[0]?.message ?? 'validation.phone.number.invalid' };
      }

      data.phoneNumber = phoneNumber.data;
    } else {
      data.phoneNumber = null;
    }
  }

  const nextPhoneNumber = data.phoneNumber !== undefined ? data.phoneNumber : (user.phoneNumber ?? null);

  if (phoneBindingEnabled && form.phoneVerified && !nextPhoneNumber) {
    return { success: false, error: 'users.edit.phone.required.before.verification' };
  }

  if (phoneBindingEnabled && (data.phoneNumber !== undefined || form.phoneVerified !== user.phoneVerified)) {
    data.phoneVerified = form.phoneVerified;
  }

  if (form.password.length > 0) {
    const password = passwordSchema.safeParse(form.password);

    if (!password.success) {
      return { success: false, error: password.error.issues[0]?.message ?? 'validation.password.invalid' };
    }

    data.password = password.data;
  }

  if (form.available !== user.available) {
    data.available = form.available;
  }

  return { success: true, data };
}

export function formatDate(value: string, locale: string) {
  return formatDateValue(value, locale);
}
