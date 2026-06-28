import { type PhoneCountryCode } from '@/lib/auth';
import { getPhoneCountryCode, getPhoneLocalNumber, supportedPhoneCountryCodes } from '@/lib/phone';

const profileImageMimeTypes = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const profileImageTypeError = 'Use a JPEG, PNG, WebP, or GIF image.';

export function formatRoleAccessSummary(roles: string[] | undefined, permissions: string[] | undefined) {
  const roleList = roles?.length ? roles.join(', ') : 'No roles';

  return permissions?.length ? `${roleList} (${permissions.join(', ')})` : roleList;
}

export function getHashParams(hash: string) {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

export function createProfileImageObjectUrl(file: File, setError: (message: string | null) => void) {
  if (file.type && !profileImageMimeTypes.has(file.type)) {
    setError(profileImageTypeError);
    return null;
  }

  setError(null);
  return URL.createObjectURL(file);
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
