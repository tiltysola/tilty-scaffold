import { parseIncompletePhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js/min';

export function hasMatchingPasswordConfirmation(input: unknown) {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const form = input as Record<string, unknown>;

  return form.password === form.confirmPassword;
}

export function normalizePhoneNumber(value: string) {
  const parsedInput = parseIncompletePhoneNumber(value);
  const phoneNumber = parsePhoneNumberFromString(parsedInput);

  return phoneNumber?.number ?? parsedInput;
}

export function isValidPhoneNumber(value: string) {
  const phoneNumber = parsePhoneNumberFromString(parseIncompletePhoneNumber(value));

  return phoneNumber?.isValid() ?? false;
}
