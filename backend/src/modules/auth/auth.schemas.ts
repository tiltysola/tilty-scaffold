import { type AuthenticationResponseJSON, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';

import {
  authSelectableVerificationPurposeValues,
  authVerificationCodeMethodValues,
  AuthVerificationMethod,
  authVerificationMethodValues,
} from '@tilty/shared/auth';
import { isSafeRelativePath } from '@tilty/shared/paths';
import {
  changePasswordSchema as sharedChangePasswordSchema,
  createPasswordFormSchema,
  displayNameSchema,
  emailSchema,
  emailVerificationCodeSchema,
  loginCredentialsSchema,
  loginIdentifierSchema,
  optionalPhoneNumberSchema,
  passwordSchema,
  phoneNumberSchema,
  profileBioSchema as baseProfileBioSchema,
  profileBirthdaySchema as baseProfileBirthdaySchema,
  profileGenderSchema as baseProfileGenderSchema,
  profileLocationSchema as baseProfileLocationSchema,
  profileWebsiteUrlSchema as baseProfileWebsiteUrlSchema,
  usernameSchema,
  verificationCodeSchema,
} from '@tilty/shared/validation';

import { mfaMethods } from './auth.mfa';

export {
  displayNameSchema,
  emailSchema,
  loginIdentifierSchema,
  optionalPhoneNumberSchema,
  passwordSchema,
  phoneNumberSchema,
  usernameSchema,
};

export const profileGenderSchema = baseProfileGenderSchema.optional();
export const profileBirthdaySchema = baseProfileBirthdaySchema.optional();
export const profileBioSchema = baseProfileBioSchema.optional();
export const profileLocationSchema = baseProfileLocationSchema.optional();
export const profileWebsiteUrlSchema = baseProfileWebsiteUrlSchema.optional();

export const registerSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
  email: emailSchema,
  emailVerificationCode: emailVerificationCodeSchema,
});

export const changePasswordSchema = sharedChangePasswordSchema;

export const loginSchema = loginCredentialsSchema;

export const totpCodeSchema = verificationCodeSchema;

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
export const verificationMethodSchema = z.enum(authVerificationMethodValues);

export const mfaSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    requiredForSso: z.boolean().optional(),
  })
  .strict()
  .refine((input) => input.enabled !== undefined || input.requiredForSso !== undefined, {
    message: 'validation.mfa.settings.required',
  });

export const verificationChallengeCreateSchema = z.object({
  purpose: z.enum(authSelectableVerificationPurposeValues),
});

export const verificationTokenSchema = z.object({
  verificationToken: z.string().uuid(),
});

export const verificationCodeSendSchema = z.object({
  method: z.enum(authVerificationCodeMethodValues),
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
      (input.method === AuthVerificationMethod.Password && Boolean(input.password)) ||
      (input.method === AuthVerificationMethod.Passkey && Boolean(input.passkeyResponse)) ||
      (input.method === AuthVerificationMethod.Totp && Boolean(input.code || input.recoveryCode)) ||
      ((input.method === AuthVerificationMethod.Email || input.method === AuthVerificationMethod.Sms) &&
        Boolean(input.code)),
    {
      message: 'validation.verification.response.required',
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
  emailVerificationCode: verificationCodeSchema,
});

export const verifyProfileEmailSchema = z.object({
  emailVerificationCode: verificationCodeSchema,
});

export const verifyProfilePhoneSchema = z.object({
  phoneNumber: phoneNumberSchema,
  phoneVerificationCode: verificationCodeSchema,
});

export const ssoSessionSchema = z.object({
  token: z.string().min(1),
});

export const ssoCreateAccountSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
  token: z.string().min(1),
});

export const ssoBindAccountSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
  token: z.string().min(1),
});

export const redirectPathSchema = z.string().refine(isSafeRelativePath, {
  message: 'validation.redirect.path.invalid',
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
