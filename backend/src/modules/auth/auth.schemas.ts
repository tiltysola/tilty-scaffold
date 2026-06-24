import { z } from 'zod';

import { isSafeRelativePath } from '@tilty/shared/paths';
import { hasMatchingPasswordConfirmation, isValidPhoneNumber, normalizePhoneNumber } from '@tilty/shared/validation';

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/)
  .transform((username) => username.toLowerCase());

export const displayNameSchema = z.string().trim().min(2).max(64);

export const emailSchema = z
  .string()
  .trim()
  .max(255)
  .pipe(z.email())
  .transform((email) => email.toLowerCase());

export const phoneNumberSchema = z.string().trim().max(32).transform(normalizePhoneNumber).refine(isValidPhoneNumber, {
  message: 'Phone number must use E.164 format.',
});

export const optionalPhoneNumberSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  phoneNumberSchema.nullable().optional(),
);

export const emailVerificationCodeSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional(),
);

export const passwordSchema = z.string().min(8).max(128);

const passwordConfirmationIssue = {
  message: 'Password confirmation does not match.',
  path: ['confirmPassword'],
};

export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .transform((identifier) => identifier.toLowerCase())
  .refine((identifier) => emailSchema.safeParse(identifier).success || usernameSchema.safeParse(identifier).success, {
    message: 'Enter a valid email address or username.',
  });

export const registerSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
  email: emailSchema,
  emailVerificationCode: emailVerificationCodeSchema,
});

export const loginSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
});

export const updateCurrentUserSchema = z.object({
  displayName: displayNameSchema,
  phoneNumber: optionalPhoneNumberSchema,
});

export const sendEmailVerificationSchema = z.object({
  email: emailSchema,
});

export const sendProfilePhoneVerificationSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const resetPasswordSchema = createPasswordFormSchema({
  email: emailSchema,
  emailVerificationCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export const verifyProfileEmailSchema = z.object({
  emailVerificationCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export const verifyProfilePhoneSchema = z.object({
  phoneNumber: phoneNumberSchema,
  phoneVerificationCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export const ssoSessionSchema = z.object({
  token: z.string().min(1),
});

export const ssoCreateAccountSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    password: passwordSchema,
    confirmPassword: passwordSchema,
    token: z.string().min(1),
  })
  .refine(hasMatchingPasswordConfirmation, passwordConfirmationIssue);

export const ssoBindAccountSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
  token: z.string().min(1),
});

export const redirectPathSchema = z.string().refine(isSafeRelativePath, {
  message: 'Redirect path is invalid.',
});

export const ssoProviderIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

export const ssoStartQuerySchema = z.object({
  providerId: ssoProviderIdSchema.optional(),
  redirect: redirectPathSchema.optional(),
});

function createPasswordFormSchema<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      ...shape,
      password: passwordSchema,
      confirmPassword: passwordSchema,
    })
    .refine(hasMatchingPasswordConfirmation, passwordConfirmationIssue);
}
