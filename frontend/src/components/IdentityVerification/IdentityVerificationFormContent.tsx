import { type SubmitEventHandler, useCallback, useEffect, useRef, useState } from 'react';

import { FingerprintIcon, ShieldCheckIcon } from 'lucide-react';

import { type VerificationCodeSendResult, type VerificationMethodName } from '@/lib/auth';
import {
  getVerificationCodeDelivery,
  getVerificationMethodLabel,
  type VerificationCodeDelivery,
} from '@/lib/verification';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';

import { AppDialogBody, AppDialogFooter } from '@/components/AppDialog';
import FormMessage from '@/components/FormMessage';

import { MethodHeader } from './MethodHeader';
import { type IdentityVerificationFormContentProps, type LocalizedVerificationMethod } from './types';
import { getInitialMethod } from './utils';
import VerificationCodeInput from './VerificationCodeInput';

export function IdentityVerificationFormContent({
  allowRecoveryCode = false,
  defaultMethod,
  dialogLayout = false,
  error,
  methods,
  onCancel,
  onClearError,
  onContextChange,
  onDeliveryChange,
  onSendCode,
  onSubmit,
  pending = false,
  sendPending = false,
  formatMessage,
  submitLabel,
  submittingLabel,
}: IdentityVerificationFormContentProps) {
  const [code, setCode] = useState('');
  const [delivery, setDelivery] = useState<VerificationCodeDelivery | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [method, setMethod] = useState<VerificationMethodName>(() => getInitialMethod(defaultMethod, methods));
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [usingRecoveryCode, setUsingRecoveryCode] = useState(false);
  const autoSentDeliveryKeyRef = useRef<string | null>(null);
  const autoSubmittedKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const currentMethod = methods.find((item) => item.method === method) ?? methods[0];
  const localizedMethods: LocalizedVerificationMethod[] = methods.map((item) => ({
    ...item,
    label: getVerificationMethodLabel(item.method, formatMessage),
  }));
  const busy = pending || sendPending;

  const updateDelivery = useCallback(
    (nextDelivery: VerificationCodeDelivery | null) => {
      setDelivery(nextDelivery);
      onDeliveryChange?.(nextDelivery);
    },
    [onDeliveryChange],
  );

  const resetInputs = useCallback(() => {
    setCode('');
    updateDelivery(null);
    setLocalError(null);
    setPassword('');
    setRecoveryCode('');
    setResendAvailableAt(null);
    setUsingRecoveryCode(false);
    autoSentDeliveryKeyRef.current = null;
    autoSubmittedKeyRef.current = null;
  }, [updateDelivery]);

  const clearMessages = useCallback(() => {
    setLocalError(null);
    onClearError?.();
  }, [onClearError]);

  const applySendCodeResult = useCallback(
    (result: VerificationCodeSendResult | null | undefined) => {
      if (result) {
        updateDelivery(
          getVerificationCodeDelivery(method, result.maskedTarget ?? currentMethod?.maskedTarget, formatMessage),
        );
        setResendAvailableAt(Date.now() + result.cooldownSeconds * 1000);
      }
    },
    [currentMethod?.maskedTarget, formatMessage, method, updateDelivery],
  );

  const handleSendCode = useCallback(async () => {
    clearMessages();

    if ((method !== 'email' && method !== 'sms') || !onSendCode) {
      return;
    }

    const result = await onSendCode(method);
    applySendCodeResult(result);
  }, [applySendCodeResult, clearMessages, method, onSendCode]);

  const handleMethodChange = (nextMethod: VerificationMethodName) => {
    onClearError?.();
    setMethod(nextMethod);
    onContextChange?.({ method: nextMethod, usingRecoveryCode: false });
    resetInputs();
  };

  const submitCurrentMethod = useCallback(async () => {
    clearMessages();

    if (usingRecoveryCode) {
      if (!recoveryCode.trim()) {
        setLocalError(formatMessage({ id: 'identity.enter.recovery.code' }));
        return;
      }

      await onSubmit({ method, recoveryCode });
      return;
    }

    if (method === 'password') {
      if (!password) {
        setLocalError(formatMessage({ id: 'identity.enter.password' }));
        return;
      }

      await onSubmit({ method, password });
      return;
    }

    if (method === 'passkey') {
      await onSubmit({ method });
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setLocalError(formatMessage({ id: 'identity.enter.six.digit.code' }));
      return;
    }

    await onSubmit({ method, code });
  }, [clearMessages, code, formatMessage, method, onSubmit, password, recoveryCode, usingRecoveryCode]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if ((method !== 'email' && method !== 'sms') || !onSendCode) {
      return undefined;
    }

    const deliveryKey = `${method}:${currentMethod?.maskedTarget ?? ''}`;

    if (autoSentDeliveryKeyRef.current === deliveryKey) {
      return undefined;
    }

    autoSentDeliveryKeyRef.current = deliveryKey;
    void onSendCode(method)
      .then((result) => {
        if (mountedRef.current && autoSentDeliveryKeyRef.current === deliveryKey) {
          applySendCodeResult(result);
        }
      })
      .catch(() => undefined);

    return undefined;
  }, [applySendCodeResult, currentMethod?.maskedTarget, method, onSendCode]);

  useEffect(() => {
    if (method !== 'passkey' || pending) {
      return;
    }

    const submitKey = `passkey:${currentMethod?.method ?? ''}`;

    if (autoSubmittedKeyRef.current === submitKey) {
      return;
    }

    autoSubmittedKeyRef.current = submitKey;
    void submitCurrentMethod().catch(() => undefined);
  }, [currentMethod?.method, method, pending, submitCurrentMethod]);

  useEffect(() => {
    if (
      (method !== 'email' && method !== 'sms' && method !== 'totp') ||
      usingRecoveryCode ||
      pending ||
      !/^\d{6}$/.test(code)
    ) {
      return;
    }

    const submitKey = `${method}:${code}`;

    if (autoSubmittedKeyRef.current === submitKey) {
      return;
    }

    autoSubmittedKeyRef.current = submitKey;
    void submitCurrentMethod().catch(() => undefined);
  }, [code, method, pending, submitCurrentMethod, usingRecoveryCode]);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    await submitCurrentMethod();
  };

  const fields = (
    <>
      {method === 'passkey' ? (
        <div className="grid gap-2">
          <MethodHeader
            currentMethod={method}
            disabled={busy}
            label={formatMessage({ id: 'identity.passkey' })}
            methods={localizedMethods}
            onChange={handleMethodChange}
            onSwitchOpen={clearMessages}
          />
          <p className="text-sm text-muted-foreground">{formatMessage({ id: 'identity.passkey.description' })}</p>
        </div>
      ) : method === 'password' ? (
        <div className="grid gap-2">
          <MethodHeader
            currentMethod={method}
            disabled={busy}
            htmlFor="identityVerificationPassword"
            label={formatMessage({ id: 'identity.password' })}
            methods={localizedMethods}
            onChange={handleMethodChange}
            onSwitchOpen={clearMessages}
          />
          <Input
            autoComplete="current-password"
            disabled={pending}
            id="identityVerificationPassword"
            onChange={(event) => {
              clearMessages();
              setPassword(event.target.value);
            }}
            placeholder={formatMessage({ id: 'identity.enter.password.placeholder' })}
            type="password"
            value={password}
          />
        </div>
      ) : usingRecoveryCode ? (
        <div className="grid gap-2">
          <MethodHeader
            currentMethod={method}
            disabled={busy}
            htmlFor="identityVerificationRecoveryCode"
            label={formatMessage({ id: 'identity.recovery.code' })}
            methods={localizedMethods}
            onChange={handleMethodChange}
            onSwitchOpen={clearMessages}
          />
          <Input
            autoComplete="one-time-code"
            disabled={pending}
            id="identityVerificationRecoveryCode"
            onChange={(event) => {
              clearMessages();
              setRecoveryCode(event.target.value.toUpperCase());
            }}
            placeholder="ABCD-EFGH-IJKL"
            value={recoveryCode}
          />
        </div>
      ) : (
        <div className="grid gap-2">
          <MethodHeader
            currentMethod={method}
            disabled={busy}
            htmlFor="identityVerificationCode"
            label={
              method === 'totp'
                ? formatMessage({ id: 'identity.authenticator.code' })
                : formatMessage({ id: 'identity.verification.code' })
            }
            methods={localizedMethods}
            onChange={handleMethodChange}
            onSwitchOpen={clearMessages}
          />
          <VerificationCodeInput
            autoFocus
            codeSent={Boolean(delivery)}
            disabled={pending}
            id="identityVerificationCode"
            onChange={(nextCode) => {
              clearMessages();
              setCode(nextCode);
            }}
            onResend={method === 'email' || method === 'sms' ? handleSendCode : undefined}
            resendAvailableAt={resendAvailableAt}
            resendDisabled={pending}
            resendPending={sendPending}
            value={code}
          />
        </div>
      )}

      <FormMessage message={localError ?? error} variant="error" />
    </>
  );

  const actions = (
    <>
      {method === 'passkey' ? (
        <Button disabled={pending} onClick={() => void submitCurrentMethod()} type="button" variant="outline">
          <FingerprintIcon />
          {pending
            ? (submittingLabel ?? formatMessage({ id: 'identity.verifying' }))
            : formatMessage({ id: 'identity.use.passkey' })}
        </Button>
      ) : null}
      {allowRecoveryCode && method === 'totp' ? (
        <Button
          disabled={pending}
          onClick={() => {
            clearMessages();
            setUsingRecoveryCode((current) => {
              const next = !current;

              onContextChange?.({ method, usingRecoveryCode: next });

              return next;
            });
          }}
          type="button"
          variant="outline"
        >
          {usingRecoveryCode
            ? formatMessage({ id: 'identity.use.authenticator.code' })
            : formatMessage({ id: 'identity.use.recovery.code' })}
        </Button>
      ) : null}
      {onCancel ? (
        <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
          {formatMessage({ id: 'common.cancel' })}
        </Button>
      ) : null}
      {method !== 'passkey' ? (
        <Button disabled={pending} type="submit">
          <ShieldCheckIcon />
          {pending
            ? (submittingLabel ?? formatMessage({ id: 'identity.verifying' }))
            : (submitLabel ?? formatMessage({ id: 'identity.verify' }))}
        </Button>
      ) : null}
    </>
  );

  if (dialogLayout) {
    return (
      <form className="contents" onSubmit={handleSubmit}>
        <AppDialogBody contentClassName="grid gap-4">{fields}</AppDialogBody>
        <AppDialogFooter className="flex-col sm:flex-row sm:flex-wrap sm:items-center">{actions}</AppDialogFooter>
      </form>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {fields}
      <div className="flex flex-wrap justify-end gap-2">{actions}</div>
    </form>
  );
}
