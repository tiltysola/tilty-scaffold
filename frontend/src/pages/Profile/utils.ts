import { formatDateOnlyValue } from '@/i18n';
import { type AuthUser, type PhoneCountryCode } from '@/lib/auth';
import { getPhoneCountryCode, getPhoneLocalNumber, supportedPhoneCountryCodes } from '@/lib/phone';
import {
  displayNameSchema,
  profileBioSchema,
  profileBirthdaySchema,
  profileGenderSchema,
  profileLocationSchema,
  profileWebsiteUrlSchema,
} from '@tilty/shared/validation';

export interface ProfileDetailsDraft {
  displayName: string;
  gender: string;
  birthday: string;
  bio: string;
  location: string;
  websiteUrl: string;
}

export function createProfileDetailsDraft(user: AuthUser): ProfileDetailsDraft {
  return {
    displayName: user.displayName,
    gender: user.gender ?? '',
    birthday: user.birthday ?? '',
    bio: user.bio ?? '',
    location: user.location ?? '',
    websiteUrl: user.websiteUrl ?? '',
  };
}

export function hasProfileDetailsChanged(left: ProfileDetailsDraft, right: ProfileDetailsDraft) {
  return (
    left.displayName !== right.displayName ||
    left.gender !== right.gender ||
    left.birthday !== right.birthday ||
    left.bio !== right.bio ||
    left.location !== right.location ||
    left.websiteUrl !== right.websiteUrl
  );
}

export function parseProfileDetailsDraft(draft: ProfileDetailsDraft) {
  const displayName = displayNameSchema.safeParse(draft.displayName);

  if (!displayName.success) {
    return {
      success: false,
      error: displayName.error.issues[0]?.message ?? 'validation.display.name.invalid',
    } as const;
  }

  const gender = profileGenderSchema.safeParse(draft.gender);

  if (!gender.success) {
    return {
      success: false,
      error: gender.error.issues[0]?.message ?? 'validation.profile.gender.invalid',
    } as const;
  }

  const birthday = profileBirthdaySchema.safeParse(draft.birthday);

  if (!birthday.success) {
    return {
      success: false,
      error: birthday.error.issues[0]?.message ?? 'validation.birthday.invalid',
    } as const;
  }

  const bio = profileBioSchema.safeParse(draft.bio);

  if (!bio.success) {
    return {
      success: false,
      error: bio.error.issues[0]?.message ?? 'validation.profile.bio.invalid',
    } as const;
  }

  const location = profileLocationSchema.safeParse(draft.location);

  if (!location.success) {
    return {
      success: false,
      error: location.error.issues[0]?.message ?? 'validation.profile.location.invalid',
    } as const;
  }

  const websiteUrl = profileWebsiteUrlSchema.safeParse(draft.websiteUrl);

  if (!websiteUrl.success) {
    return {
      success: false,
      error: websiteUrl.error.issues[0]?.message ?? 'validation.homepage.url.invalid',
    } as const;
  }

  return {
    success: true,
    data: {
      displayName: displayName.data,
      gender: gender.data,
      birthday: birthday.data,
      bio: bio.data,
      location: location.data,
      websiteUrl: websiteUrl.data,
    },
  } as const;
}

export function formatRoleAccessSummary(
  roles: string[] | undefined,
  permissions: string[] | undefined,
  noRoles: string,
) {
  const roleList = roles?.length ? roles.join(', ') : noRoles;

  return permissions?.length ? `${roleList} (${permissions.join(', ')})` : roleList;
}

export function formatProfileDetail(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function formatProfileBirthday(value: string | undefined, fallback: string, locale: string) {
  const normalizedValue = value?.trim();

  return normalizedValue ? formatDateOnlyValue(normalizedValue, locale) : fallback;
}

export function formatProfileLocation(value: string | undefined, fallback: string) {
  const locationLevels = value
    ?.split(',')
    .map((level) => level.trim())
    .filter(Boolean);

  return locationLevels?.length ? [...locationLevels].reverse().join(', ') : fallback;
}

export function getHashParams(hash: string) {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

export function syncPhoneDraft(
  phoneNumber: string | undefined,
  phoneCountryCodes: PhoneCountryCode[],
  setPhoneCountryCode: (countryCode: PhoneCountryCode) => void,
  setPhoneLocalNumber: (phoneNumber: string) => void,
) {
  const countryCode =
    getPhoneCountryCode(phoneNumber, phoneCountryCodes.length ? phoneCountryCodes : supportedPhoneCountryCodes) ??
    phoneCountryCodes[0] ??
    '+86';

  setPhoneCountryCode(countryCode);
  setPhoneLocalNumber(getPhoneLocalNumber(phoneNumber, countryCode));
}
