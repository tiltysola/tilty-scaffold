import { useCallback, useState } from 'react';

import { formatStaticMessage } from '@/i18n';
import { getApiErrorMessage } from '@/lib/api';
import { type SendEmailVerificationInput, type VerificationCodeSendResult } from '@/lib/auth';

import { useAsyncAction } from './useAsyncAction';

type SendEmailVerification = (input: SendEmailVerificationInput) => Promise<VerificationCodeSendResult>;
type ErrorMessageResolver = (error: unknown, fallback: string) => string;

interface UseEmailVerificationOptions {
  formatNotice?: (expiresInMinutes: number) => string;
  getErrorMessage?: ErrorMessageResolver;
  sendCode: SendEmailVerification;
}

export function useEmailVerification({
  formatNotice = defaultFormatNotice,
  getErrorMessage = getApiErrorMessage,
  sendCode,
}: UseEmailVerificationOptions) {
  const [notice, setNotice] = useState<string | null>(null);
  const { clearError, error, pending, run, setError } = useAsyncAction(getErrorMessage);

  const clearMessages = useCallback(() => {
    clearError();
    setNotice(null);
  }, [clearError]);

  const requestCode = useCallback(
    async (email: string, fallbackError: string) => {
      setNotice(null);
      const result = await run(() => sendCode({ email }), fallbackError);

      if (result) {
        const expiresInMinutes = Math.ceil(result.expiresInSeconds / 60);

        setNotice(formatNotice(expiresInMinutes));
      }

      return result;
    },
    [formatNotice, run, sendCode],
  );

  return {
    clearMessages,
    error,
    notice,
    requestCode,
    sending: pending,
    setError,
  };
}

function defaultFormatNotice(expiresInMinutes: number) {
  return formatStaticMessage('email.verification.sent', {
    minutes: expiresInMinutes,
  });
}
