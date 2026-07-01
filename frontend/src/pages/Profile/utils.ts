import { type PhoneCountryCode } from '@/lib/auth';
import { getPhoneCountryCode, getPhoneLocalNumber, supportedPhoneCountryCodes } from '@/lib/phone';

export function formatRoleAccessSummary(
  roles: string[] | undefined,
  permissions: string[] | undefined,
  noRoles: string,
) {
  const roleList = roles?.length ? roles.join(', ') : noRoles;

  return permissions?.length ? `${roleList} (${permissions.join(', ')})` : roleList;
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
