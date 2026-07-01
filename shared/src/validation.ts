import { parseIncompletePhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { z } from 'zod';

export const usernameMinLength = 3;
export const usernameMaxLength = 32;
export const usernamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/;
export const displayNameMinLength = 2;
export const displayNameMaxLength = 64;
export const emailMaxLength = 255;
export const phoneNumberMaxLength = 32;
export const passwordMinLength = 8;
export const passwordMaxLength = 128;
export const profileGenderMaxLength = 64;
export const profileBioMaxLength = 280;
export const profileLocationMaxLength = 128;
export const profileWebsiteUrlMaxLength = 2048;
export const verificationCodePattern = /^\d{6}$/;

export const usernameSchema = z
  .string()
  .trim()
  .min(usernameMinLength, 'validation.username.min')
  .max(usernameMaxLength, 'validation.username.max')
  .regex(usernamePattern, 'validation.username.pattern')
  .transform((username) => username.toLowerCase());

export const displayNameSchema = z
  .string()
  .trim()
  .min(displayNameMinLength, 'validation.display.name.min')
  .max(displayNameMaxLength, 'validation.display.name.max');

export const profileGenderSchema = createOptionalProfileTextSchema(
  profileGenderMaxLength,
  'validation.profile.gender.max',
);
export const profileBirthdaySchema = z.preprocess(
  normalizeEmptyString,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.birthday.format')
    .refine(isValidDateOnly, {
      message: 'validation.birthday.invalid',
    })
    .refine((birthday) => birthday <= formatDateOnly(new Date()), {
      message: 'validation.birthday.future',
    })
    .nullable(),
);
export const profileBioSchema = createOptionalProfileTextSchema(profileBioMaxLength, 'validation.profile.bio.max');
export const profileLocationSchema = createOptionalProfileTextSchema(
  profileLocationMaxLength,
  'validation.profile.location.max',
);
export const profileWebsiteUrlSchema = z.preprocess(
  normalizeEmptyString,
  z
    .string()
    .trim()
    .max(profileWebsiteUrlMaxLength, 'validation.homepage.url.max')
    .refine(isHttpUrl, {
      message: 'validation.homepage.url.invalid',
    })
    .nullable(),
);

export const emailSchema = z
  .string()
  .trim()
  .max(emailMaxLength, 'validation.email.max')
  .pipe(z.email('validation.email.invalid'))
  .transform((email) => email.toLowerCase());

export const phoneNumberSchema = z
  .string()
  .trim()
  .max(phoneNumberMaxLength, 'validation.phone.number.max')
  .transform(normalizePhoneNumber)
  .refine(isValidPhoneNumber, {
    message: 'validation.phone.number.invalid',
  });

export const optionalPhoneNumberSchema = z.preprocess(normalizeEmptyString, phoneNumberSchema.nullable().optional());
export const optionalVerificationCodeSchema = z.string().trim();
export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(verificationCodePattern, 'validation.verification.code.invalid');
export const emailVerificationCodeSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  verificationCodeSchema.optional(),
);

export const passwordSchema = z
  .string()
  .min(passwordMinLength, 'validation.password.min')
  .max(passwordMaxLength, 'validation.password.max');
export const confirmPasswordSchema = z
  .string()
  .min(passwordMinLength, 'validation.confirm.password.required')
  .max(passwordMaxLength, 'validation.confirm.password.max');

export const passwordConfirmationIssue = {
  message: 'validation.password.confirmation.mismatch',
  path: ['confirmPassword'],
};

export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'validation.identifier.required')
  .max(emailMaxLength, 'validation.identifier.max')
  .transform((identifier) => identifier.toLowerCase())
  .refine((identifier) => emailSchema.safeParse(identifier).success || usernameSchema.safeParse(identifier).success, {
    message: 'validation.identifier.invalid',
  });

export const loginCredentialsSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
});

export const changePasswordSchema = createPasswordFormSchema({
  currentPassword: passwordSchema,
}).refine((input) => input.currentPassword !== input.password, {
  message: 'validation.password.different',
  path: ['password'],
});

export function createPasswordFormSchema<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      ...shape,
      password: passwordSchema,
      confirmPassword: confirmPasswordSchema,
    })
    .refine(hasMatchingPasswordConfirmation, passwordConfirmationIssue);
}

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

function normalizeEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

function createOptionalProfileTextSchema(maxLength: number, maxLengthMessage: string) {
  return z.preprocess(normalizeEmptyString, z.string().trim().max(maxLength, maxLengthMessage).nullable());
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidDateOnly(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && formatDateOnly(parsed) === value;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}
