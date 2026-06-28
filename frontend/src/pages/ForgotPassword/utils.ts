import { ApiError, getApiErrorMessage } from '@/lib/api';

export const passwordRecoveryUnavailableMessage = 'Password recovery is not available. Contact the site administrator.';

export function getPasswordRecoveryErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.code === 'EMAIL_VERIFICATION_DISABLED') {
    return passwordRecoveryUnavailableMessage;
  }

  return getApiErrorMessage(error, fallback);
}
