import { type VerificationMethodName } from './auth';

export interface IdentityVerificationContext {
  method: VerificationMethodName;
  usingRecoveryCode: boolean;
}

export interface VerificationCodeDelivery {
  message: string;
  target: string;
}

export function getIdentityVerificationDescription(context: IdentityVerificationContext) {
  if (context.usingRecoveryCode) {
    return 'Enter one of your recovery codes to continue.';
  }

  if (context.method === 'passkey') {
    return 'Use your passkey to verify your identity.';
  }

  if (context.method === 'totp') {
    return 'Enter the code from your authenticator app to continue.';
  }

  if (context.method === 'sms') {
    return 'Enter the SMS verification code to continue.';
  }

  if (context.method === 'email') {
    return 'Enter the email verification code to continue.';
  }

  return 'Enter your password to continue.';
}

export function getVerificationCodeDelivery(
  method: VerificationMethodName,
  target?: string,
): VerificationCodeDelivery | null {
  if (method === 'email') {
    return {
      message: 'A verification email was sent to',
      target: target ?? 'your email address',
    };
  }

  if (method === 'sms') {
    return {
      message: 'A verification code was sent to',
      target: target ?? 'your phone number',
    };
  }

  return null;
}

export function maskEmailAddress(email: string) {
  const [, domain = ''] = email.split('@');

  if (!domain) {
    return email;
  }

  return `***@${domain}`;
}

export function maskPhoneNumber(phoneNumber: string) {
  if (phoneNumber.length <= 9) {
    return '***';
  }

  return `${phoneNumber.slice(0, 6)}****${phoneNumber.slice(-4)}`;
}
