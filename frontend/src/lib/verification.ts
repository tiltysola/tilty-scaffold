import { type IntlShape } from 'react-intl';

import { type VerificationMethodName } from './auth';

export interface IdentityVerificationContext {
  method: VerificationMethodName;
  usingRecoveryCode: boolean;
}

export interface VerificationCodeDelivery {
  message: string;
  target: string;
}

type FormatMessage = IntlShape['formatMessage'];

export function getIdentityVerificationDescription(context: IdentityVerificationContext, formatMessage: FormatMessage) {
  if (context.usingRecoveryCode) {
    return formatMessage({ id: 'identity.recovery.code.description' });
  }

  if (context.method === 'passkey') {
    return formatMessage({ id: 'identity.passkey.description' });
  }

  if (context.method === 'totp') {
    return formatMessage({ id: 'identity.totp.description' });
  }

  if (context.method === 'sms') {
    return formatMessage({ id: 'identity.sms.code.description' });
  }

  if (context.method === 'email') {
    return formatMessage({ id: 'identity.email.code.description' });
  }

  return formatMessage({ id: 'identity.password.description' });
}

export function getVerificationCodeDelivery(
  method: VerificationMethodName,
  target: string | undefined,
  formatMessage: FormatMessage,
): VerificationCodeDelivery | null {
  if (method === 'email') {
    return {
      message: formatMessage({ id: 'identity.email.delivery' }),
      target: target ?? formatMessage({ id: 'identity.email.target.fallback' }),
    };
  }

  if (method === 'sms') {
    return {
      message: formatMessage({ id: 'identity.sms.delivery' }),
      target: target ?? formatMessage({ id: 'identity.sms.target.fallback' }),
    };
  }

  return null;
}

export function getVerificationMethodLabel(method: VerificationMethodName, formatMessage: FormatMessage) {
  if (method === 'password') {
    return formatMessage({ id: 'identity.password' });
  }

  if (method === 'passkey') {
    return formatMessage({ id: 'identity.passkey' });
  }

  if (method === 'totp') {
    return formatMessage({ id: 'identity.authenticator.app' });
  }

  if (method === 'sms') {
    return formatMessage({ id: 'identity.sms' });
  }

  return formatMessage({ id: 'identity.email' });
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
