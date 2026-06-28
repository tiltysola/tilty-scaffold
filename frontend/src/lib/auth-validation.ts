import { z } from 'zod';

import { hasMatchingPasswordConfirmation, isValidPhoneNumber, normalizePhoneNumber } from '@tilty/shared/validation';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must contain at least 3 characters.')
  .max(32)
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/,
    'Username may contain letters, numbers, underscores, and hyphens.',
  )
  .transform((username) => username.toLowerCase());
export const displayNameSchema = z.string().trim().min(2, 'Display name must contain at least 2 characters.').max(64);
export const profileGenderSchema = createOptionalProfileTextSchema(64);
export const profileBirthdaySchema = z.preprocess(
  normalizeEmptyProfileValue,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Birthday must use YYYY-MM-DD format.')
    .refine(isValidDateOnly, {
      message: 'Birthday must be a valid date.',
    })
    .refine((birthday) => birthday <= formatDateOnly(new Date()), {
      message: 'Birthday cannot be in the future.',
    })
    .nullable(),
);
export const profileBioSchema = createOptionalProfileTextSchema(280);
export const profileLocationSchema = createOptionalProfileTextSchema(128);
export const profileWebsiteUrlSchema = z.preprocess(
  normalizeEmptyProfileValue,
  z
    .string()
    .trim()
    .max(2048)
    .refine(isHttpUrl, {
      message: 'Homepage must be an HTTP or HTTPS URL.',
    })
    .nullable(),
);
export const emailSchema = z.string().trim().pipe(z.email('Provide a valid email address.'));
export const phoneNumberSchema = z.string().trim().max(32).transform(normalizePhoneNumber).refine(isValidPhoneNumber, {
  message: 'Phone number must use E.164 format.',
});
export const optionalVerificationCodeSchema = z.string().trim();
export const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Provide the 6-digit verification code.');
export const passwordSchema = z.string().min(8, 'Password must contain at least 8 characters.').max(128);
export const confirmPasswordSchema = z.string().min(8, 'Confirm password.').max(128);
const passwordConfirmationIssue = {
  message: 'Password confirmation does not match.',
  path: ['confirmPassword'],
};
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter an email address or username.')
  .max(255)
  .transform((identifier) => identifier.toLowerCase())
  .refine((identifier) => emailSchema.safeParse(identifier).success || usernameSchema.safeParse(identifier).success, {
    message: 'Enter a valid email address or username.',
  });

export const loginCredentialsSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
});

export const changePasswordSchema = createPasswordFormSchema({
  currentPassword: passwordSchema,
}).refine((input) => input.currentPassword !== input.password, {
  message: 'New password must be different from current password.',
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

function normalizeEmptyProfileValue(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

function createOptionalProfileTextSchema(maxLength: number) {
  return z.preprocess(normalizeEmptyProfileValue, z.string().trim().max(maxLength).nullable());
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
