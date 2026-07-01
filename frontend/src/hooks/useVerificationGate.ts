import { useCallback, useEffect, useRef, useState } from 'react';

import { formatStaticMessage } from '@/i18n';
import { getApiErrorMessage } from '@/lib/api';
import {
  createVerificationChallenge,
  sendVerificationCode,
  type VerificationCodeSendResult,
  type VerificationMethodName,
  type VerificationRequired,
  verifyAuthenticationChallenge,
  verifyWithPasskey,
} from '@/lib/auth';
import { type AuthVerificationCodeMethodValue, AuthVerificationMethod } from '@tilty/shared/auth';

export interface VerificationGateSubmitInput {
  method: VerificationMethodName;
  code?: string;
  password?: string;
  recoveryCode?: string;
}

interface UseVerificationGateOptions {
  codeSendErrorMessage?: string;
  passkeyErrorMessage?: string;
  purpose: Parameters<typeof createVerificationChallenge>[0];
  verificationErrorMessage?: string;
}

export function useVerificationGate({
  codeSendErrorMessage,
  passkeyErrorMessage,
  purpose,
  verificationErrorMessage,
}: UseVerificationGateOptions) {
  const [error, setError] = useState<string | null>(null);
  const [pendingChallenge, setPendingChallenge] = useState<VerificationRequired | null>(null);
  const [requestPending, setRequestPending] = useState(false);
  const [sendPending, setSendPending] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const mountedRef = useRef(false);
  const resolvedCodeSendErrorMessage =
    codeSendErrorMessage ?? formatStaticMessage('identity.verification.code.send.failed');
  const resolvedPasskeyErrorMessage =
    passkeyErrorMessage ?? formatStaticMessage('identity.passkey.verification.failed');
  const resolvedVerificationErrorMessage =
    verificationErrorMessage ?? formatStaticMessage('identity.verification.failed');

  const clearError = useCallback(() => {
    if (mountedRef.current) {
      setError(null);
    }
  }, []);

  const requestChallenge = useCallback(async () => {
    if (mountedRef.current) {
      setError(null);
      setPendingChallenge(null);
      setRequestPending(true);
    }

    try {
      const challenge = await createVerificationChallenge(purpose);

      if ('verified' in challenge) {
        if (mountedRef.current) {
          setPendingChallenge(null);
        }

        return true;
      }

      if (mountedRef.current) {
        setPendingChallenge(challenge);
      }

      return false;
    } finally {
      if (mountedRef.current) {
        setRequestPending(false);
      }
    }
  }, [purpose]);

  const sendCode = useCallback(
    async (method: AuthVerificationCodeMethodValue): Promise<VerificationCodeSendResult | null> => {
      if (!pendingChallenge) {
        return null;
      }

      if (mountedRef.current) {
        setError(null);
        setSendPending(true);
      }

      try {
        return await sendVerificationCode({
          method,
          verificationToken: pendingChallenge.verificationToken,
        });
      } catch (requestError: unknown) {
        if (mountedRef.current) {
          setError(getApiErrorMessage(requestError, resolvedCodeSendErrorMessage));
        }

        return null;
      } finally {
        if (mountedRef.current) {
          setSendPending(false);
        }
      }
    },
    [pendingChallenge, resolvedCodeSendErrorMessage],
  );

  const confirmChallenge = useCallback(
    async (input: VerificationGateSubmitInput) => {
      if (!pendingChallenge) {
        return false;
      }

      if (mountedRef.current) {
        setError(null);
        setSubmitPending(true);
      }

      try {
        if (input.method === AuthVerificationMethod.Passkey) {
          await verifyWithPasskey(pendingChallenge.verificationToken);
        } else {
          await verifyAuthenticationChallenge({
            verificationToken: pendingChallenge.verificationToken,
            ...input,
          });
        }

        if (mountedRef.current) {
          setPendingChallenge(null);
        }

        return true;
      } catch (requestError: unknown) {
        if (mountedRef.current) {
          setError(
            getApiErrorMessage(
              requestError,
              input.method === AuthVerificationMethod.Passkey
                ? resolvedPasskeyErrorMessage
                : resolvedVerificationErrorMessage,
            ),
          );
        }

        return false;
      } finally {
        if (mountedRef.current) {
          setSubmitPending(false);
        }
      }
    },
    [pendingChallenge, resolvedPasskeyErrorMessage, resolvedVerificationErrorMessage],
  );

  const dismissChallenge = useCallback(() => {
    if (mountedRef.current) {
      setPendingChallenge(null);
      setError(null);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  return {
    clearError,
    confirmChallenge,
    dismissChallenge,
    error,
    pendingChallenge,
    requestChallenge,
    requestPending,
    sendCode,
    sendPending,
    submitPending,
  };
}
