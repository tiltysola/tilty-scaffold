export const AuthMfaMethod = {
  Passkey: 'passkey',
  Totp: 'totp',
  Sms: 'sms',
  Email: 'email',
} as const;

export const authMfaMethodValues = [
  AuthMfaMethod.Passkey,
  AuthMfaMethod.Totp,
  AuthMfaMethod.Sms,
  AuthMfaMethod.Email,
] as const;

export type AuthMfaMethodValue = (typeof authMfaMethodValues)[number];

export const AuthVerificationMethod = {
  ...AuthMfaMethod,
  Password: 'password',
} as const;

export const authVerificationMethodValues = [...authMfaMethodValues, AuthVerificationMethod.Password] as const;

export type AuthVerificationMethodValue = (typeof authVerificationMethodValues)[number];

export const authVerificationCodeMethodValues = [AuthMfaMethod.Email, AuthMfaMethod.Sms] as const;

export type AuthVerificationCodeMethodValue = (typeof authVerificationCodeMethodValues)[number];

export const AuthVerificationPurpose = {
  ChangePassword: 'change_password',
  Login: 'login',
  ManageApiKey: 'manage_api_key',
  ManageMfa: 'manage_mfa',
  ManagePasskey: 'manage_passkey',
  ManageSso: 'manage_sso',
  ManageTotp: 'manage_totp',
  SystemSettings: 'system_settings',
  Sso: 'sso',
  UpdateContact: 'update_contact',
  UserManagement: 'user_management',
} as const;

export const authVerificationPurposeValues = [
  AuthVerificationPurpose.ChangePassword,
  AuthVerificationPurpose.Login,
  AuthVerificationPurpose.ManageApiKey,
  AuthVerificationPurpose.ManageMfa,
  AuthVerificationPurpose.ManagePasskey,
  AuthVerificationPurpose.ManageSso,
  AuthVerificationPurpose.ManageTotp,
  AuthVerificationPurpose.SystemSettings,
  AuthVerificationPurpose.Sso,
  AuthVerificationPurpose.UpdateContact,
  AuthVerificationPurpose.UserManagement,
] as const;

export type AuthVerificationPurposeValue = (typeof authVerificationPurposeValues)[number];

export const authSelectableVerificationPurposeValues = [
  AuthVerificationPurpose.ChangePassword,
  AuthVerificationPurpose.ManageApiKey,
  AuthVerificationPurpose.ManageMfa,
  AuthVerificationPurpose.ManagePasskey,
  AuthVerificationPurpose.ManageSso,
  AuthVerificationPurpose.ManageTotp,
  AuthVerificationPurpose.SystemSettings,
  AuthVerificationPurpose.UpdateContact,
  AuthVerificationPurpose.UserManagement,
] as const;

export type AuthSelectableVerificationPurposeValue = (typeof authSelectableVerificationPurposeValues)[number];

export const AuthSessionDeviceType = {
  Desktop: 'desktop',
  Mobile: 'mobile',
  Tablet: 'tablet',
} as const;

export const authSessionDeviceTypeValues = [
  AuthSessionDeviceType.Desktop,
  AuthSessionDeviceType.Mobile,
  AuthSessionDeviceType.Tablet,
] as const;

export type AuthSessionDeviceTypeValue = (typeof authSessionDeviceTypeValues)[number];

export type ProfileImageFieldName = 'avatar' | 'profileBanner' | 'profileBackground';
