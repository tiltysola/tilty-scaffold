import { z } from 'zod';

import { hasMatchingPasswordConfirmation } from '@tilty/shared/validation';

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
export const emailSchema = z.string().trim().pipe(z.email('Provide a valid email address.'));
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

export function createPasswordFormSchema<T extends z.ZodRawShape>(shape: T) {
  return z
    .object({
      ...shape,
      password: passwordSchema,
      confirmPassword: confirmPasswordSchema,
    })
    .refine(hasMatchingPasswordConfirmation, passwordConfirmationIssue);
}
