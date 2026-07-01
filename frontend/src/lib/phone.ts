import { SetupSmsPhoneCountryCode, setupSmsPhoneCountryCodeValues } from '@tilty/shared/setup';

import { type PhoneCountryCode } from './auth';

export const supportedPhoneCountryCodes: PhoneCountryCode[] = [...setupSmsPhoneCountryCodeValues];

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

export function getPhoneCountryCodeMessageId(countryCode: PhoneCountryCode) {
  return `setup.sms.profile.phone.country.code.${countryCode.replace('+', '')}`;
}

export function getPhonePlaceholder(countryCode: PhoneCountryCode) {
  if (countryCode === SetupSmsPhoneCountryCode.ChinaMainland) {
    return '13800138000';
  }

  if (countryCode === SetupSmsPhoneCountryCode.HongKong) {
    return '51234567';
  }

  return '61234567';
}
