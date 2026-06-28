import { type AuthenticationResponseJSON, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';

import { isSafeRelativePath } from '@tilty/shared/paths';
import { hasMatchingPasswordConfirmation, isValidPhoneNumber, normalizePhoneNumber } from '@tilty/shared/validation';

import { mfaMethods } from './auth.mfa';

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/)
  .transform((username) => username.toLowerCase());

export const displayNameSchema = z.string().trim().min(2).max(64);
export const profileGenderSchema = createOptionalTrimmedStringSchema(64);
export const profileBirthdaySchema = z.preprocess(
  normalizeEmptyString,
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
    .nullable()
    .optional(),
);
export const profileBioSchema = createOptionalTrimmedStringSchema(280);
export const profileLocationSchema = createOptionalTrimmedStringSchema(128);
export const profileWebsiteUrlSchema = z.preprocess(
  normalizeEmptyString,
  z
    .string()
    .trim()
    .max(2048)
    .refine(isHttpUrl, {
      message: 'Homepage must be an HTTP or HTTPS URL.',
    })
    .nullable()
    .optional(),
);

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

export const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine(hasMatchingPasswordConfirmation, passwordConfirmationIssue)
  .refine((input) => input.currentPassword !== input.password, {
    message: 'New password must be different from current password.',
    path: ['password'],
  });

export const loginSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
});

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

export const totpRecoveryCodeSchema = z
  .string()
  .trim()
  .min(8)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/);

export const totpSetupEnableSchema = z.object({
  code: totpCodeSchema,
  setupToken: z.string().uuid(),
});

export const authDeviceSessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

export const authPasskeyIdSchema = z.object({
  passkeyId: z.string().uuid(),
});

export const mfaMethodSchema = z.enum(mfaMethods);
export const verificationMethodSchema = z.union([mfaMethodSchema, z.literal('password')]);

export const mfaSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    requiredForSso: z.boolean().optional(),
  })
  .strict()
  .refine((input) => input.enabled !== undefined || input.requiredForSso !== undefined, {
    message: 'At least one MFA setting is required.',
  });

export const verificationChallengeCreateSchema = z.object({
  purpose: z.enum([
    'change_password',
    'manage_mfa',
    'manage_passkey',
    'manage_sso',
    'manage_totp',
    'system_settings',
    'update_contact',
    'user_management',
  ]),
});

export const verificationTokenSchema = z.object({
  verificationToken: z.string().uuid(),
});

export const verificationCodeSendSchema = z.object({
  method: z.enum(['email', 'sms']),
  verificationToken: z.string().uuid(),
});

const authenticatorAttachmentSchema = z.enum(['cross-platform', 'platform']);
const authenticatorTransportsSchema = z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']);
const clientExtensionResultsSchema = z.record(z.string(), z.unknown());

const webAuthnCredentialResponseBaseSchema = {
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  authenticatorAttachment: authenticatorAttachmentSchema.optional(),
  clientExtensionResults: clientExtensionResultsSchema,
};

const webAuthnAuthenticationResponseSchema = z
  .object({
    ...webAuthnCredentialResponseBaseSchema,
    response: z.object({
      authenticatorData: z.string().min(1),
      clientDataJSON: z.string().min(1),
      signature: z.string().min(1),
      userHandle: z.string().optional(),
    }),
  })
  .transform(
    (credential): AuthenticationResponseJSON => ({
      id: credential.id,
      rawId: credential.rawId,
      response: {
        authenticatorData: credential.response.authenticatorData,
        clientDataJSON: credential.response.clientDataJSON,
        signature: credential.response.signature,
        ...(credential.response.userHandle ? { userHandle: credential.response.userHandle } : {}),
      },
      type: credential.type,
      ...(credential.authenticatorAttachment ? { authenticatorAttachment: credential.authenticatorAttachment } : {}),
      clientExtensionResults: credential.clientExtensionResults,
    }),
  );

const webAuthnRegistrationResponseSchema = z
  .object({
    ...webAuthnCredentialResponseBaseSchema,
    response: z.object({
      attestationObject: z.string().min(1),
      authenticatorData: z.string().min(1).optional(),
      clientDataJSON: z.string().min(1),
      publicKey: z.string().min(1).optional(),
      publicKeyAlgorithm: z.number().optional(),
      transports: z.array(authenticatorTransportsSchema).optional(),
    }),
  })
  .transform(
    (credential): RegistrationResponseJSON => ({
      id: credential.id,
      rawId: credential.rawId,
      response: {
        attestationObject: credential.response.attestationObject,
        clientDataJSON: credential.response.clientDataJSON,
        ...(credential.response.authenticatorData ? { authenticatorData: credential.response.authenticatorData } : {}),
        ...(credential.response.publicKey ? { publicKey: credential.response.publicKey } : {}),
        ...(credential.response.publicKeyAlgorithm !== undefined
          ? { publicKeyAlgorithm: credential.response.publicKeyAlgorithm }
          : {}),
        ...(credential.response.transports ? { transports: credential.response.transports } : {}),
      },
      type: credential.type,
      ...(credential.authenticatorAttachment ? { authenticatorAttachment: credential.authenticatorAttachment } : {}),
      clientExtensionResults: credential.clientExtensionResults,
    }),
  );

export const verificationConfirmSchema = z
  .object({
    method: verificationMethodSchema,
    code: totpCodeSchema.optional(),
    password: passwordSchema.optional(),
    recoveryCode: totpRecoveryCodeSchema.optional(),
    passkeyResponse: webAuthnAuthenticationResponseSchema.optional(),
    verificationToken: z.string().uuid(),
  })
  .refine(
    (input) =>
      (input.method === 'password' && Boolean(input.password)) ||
      (input.method === 'passkey' && Boolean(input.passkeyResponse)) ||
      (input.method === 'totp' && Boolean(input.code || input.recoveryCode)) ||
      ((input.method === 'email' || input.method === 'sms') && Boolean(input.code)),
    {
      message: 'Verification response is required.',
      path: ['method'],
    },
  );

export const passkeyRegistrationVerifySchema = z.object({
  name: z.string().trim().min(1).max(128),
  registrationToken: z.string().uuid(),
  response: webAuthnRegistrationResponseSchema,
});

export const updateCurrentUserSchema = z.object({
  displayName: displayNameSchema,
  gender: profileGenderSchema,
  birthday: profileBirthdaySchema,
  bio: profileBioSchema,
  location: profileLocationSchema,
  websiteUrl: profileWebsiteUrlSchema,
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

function normalizeEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

function createOptionalTrimmedStringSchema(maxLength: number) {
  return z.preprocess(normalizeEmptyString, z.string().trim().max(maxLength).nullable().optional());
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

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

function isValidDateOnly(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(parsed.getTime()) && formatDateOnly(parsed) === value;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}
