import { useCallback, useState } from 'react';

import { getApiErrorMessage } from '@/lib/api';
import { type EmailVerificationSendResult, type SendEmailVerificationInput } from '@/lib/auth';

import { useAsyncAction } from './useAsyncAction';

type SendEmailVerification = (input: SendEmailVerificationInput) => Promise<EmailVerificationSendResult>;
type ErrorMessageResolver = (error: unknown, fallback: string) => string;

interface UseEmailVerificationOptions {
  getErrorMessage?: ErrorMessageResolver;
  sendCode: SendEmailVerification;
}

export function useEmailVerification({ getErrorMessage = getApiErrorMessage, sendCode }: UseEmailVerificationOptions) {
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

        setNotice(`Verification code sent. It expires in ${expiresInMinutes} minutes.`);
      }

      return result;
    },
    [run, sendCode],
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
