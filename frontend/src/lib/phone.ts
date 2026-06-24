import { type PhoneCountryCode } from './auth';

export const supportedPhoneCountryCodes: PhoneCountryCode[] = ['+86', '+852', '+853'];

export function getPhoneCountryCode(phoneNumber: string | undefined, phoneCountryCodes: readonly PhoneCountryCode[]) {
  return [...phoneCountryCodes]
    .sort((left, right) => right.length - left.length)
    .find((code) => phoneNumber?.startsWith(code));
}

export function getPhoneLocalNumber(phoneNumber: string | undefined, phoneCountryCode: PhoneCountryCode | undefined) {
  return phoneNumber && phoneCountryCode ? phoneNumber.slice(phoneCountryCode.length) : '';
}

export function composePhoneNumber(form: { phoneCountryCode: PhoneCountryCode; phoneLocalNumber: string }) {
  const localNumber = form.phoneLocalNumber.trim();

  return localNumber ? `${form.phoneCountryCode}${localNumber}` : '';
}

export function formatPhoneCountryCode(countryCode: PhoneCountryCode) {
  if (countryCode === '+86') {
    return 'China Mainland (+86)';
  }

  if (countryCode === '+852') {
    return 'Hong Kong, China (+852)';
  }

  return 'Macao, China (+853)';
}

export function getPhonePlaceholder(countryCode: PhoneCountryCode) {
  if (countryCode === '+86') {
    return '13800138000';
  }

  if (countryCode === '+852') {
    return '51234567';
  }

  return '61234567';
}
