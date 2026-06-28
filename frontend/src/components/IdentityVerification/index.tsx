import { type SubmitEventHandler, useCallback, useEffect, useRef, useState } from 'react';

import { FingerprintIcon, ShieldCheckIcon } from 'lucide-react';

import { type VerificationCodeSendResult, type VerificationMethod, type VerificationMethodName } from '@/lib/auth';
import {
  getIdentityVerificationDescription,
  getVerificationCodeDelivery,
  type IdentityVerificationContext,
  type VerificationCodeDelivery,
} from '@/lib/verification';
import { Button } from '@/shadcn/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shadcn/components/ui/dialog';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import FormMessage from '@/components/FormMessage';

import VerificationCodeInput from './VerificationCodeInput';
import VerificationMethodSwitch from './VerificationMethodSwitch';

export interface IdentityVerificationSubmitInput {
  method: VerificationMethodName;
  code?: string;
  password?: string;
  recoveryCode?: string;
}

interface IdentityVerificationFormProps {
  allowRecoveryCode?: boolean;
  defaultMethod: VerificationMethodName;
  error?: string | null;
  methods: VerificationMethod[];
  onCancel?: () => void;
  onClearError?: () => void;
  onContextChange?: (context: IdentityVerificationContext) => void;
  onDeliveryChange?: (delivery: VerificationCodeDelivery | null) => void;
  onSendCode?: (method: 'email' | 'sms') => Promise<VerificationCodeSendResult | null | undefined>;
  onSubmit: (input: IdentityVerificationSubmitInput) => Promise<void> | void;
  pending?: boolean;
  sendPending?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
}

type IdentityVerificationDialogFormProps = Omit<
  IdentityVerificationFormProps,
  'onCancel' | 'onContextChange' | 'onDeliveryChange'
>;

interface IdentityVerificationDialogProps extends IdentityVerificationDialogFormProps {
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function IdentityVerificationDialog({
  description,
  open,
  onOpenChange,
  title = 'Verify identity',
  ...formProps
}: IdentityVerificationDialogProps) {
  const formKey = getFormKey(formProps.defaultMethod, formProps.methods);

  return (
    <IdentityVerificationDialogContent
      key={formKey}
      description={description}
      formProps={formProps}
      onOpenChange={onOpenChange}
      open={open}
      title={title}
    />
  );
}

function IdentityVerificationDialogContent({
  description,
  formProps,
  onOpenChange,
  open,
  title,
}: {
  description?: string;
  formProps: IdentityVerificationDialogFormProps;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const [delivery, setDelivery] = useState<VerificationCodeDelivery | null>(null);
  const [context, setContext] = useState<IdentityVerificationContext>(() =>
    getInitialVerificationContext(formProps.defaultMethod, formProps.methods),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {delivery ? (
              <VerificationCodeDeliveryDescription delivery={delivery} />
            ) : (
              (description ?? getIdentityVerificationDescription(context))
            )}
          </DialogDescription>
        </DialogHeader>
        <IdentityVerificationForm
          {...formProps}
          onCancel={() => onOpenChange(false)}
          onContextChange={setContext}
          onDeliveryChange={setDelivery}
        />
      </DialogContent>
    </Dialog>
  );
}

export function IdentityVerificationForm(props: IdentityVerificationFormProps) {
  return <IdentityVerificationFormContent key={getFormKey(props.defaultMethod, props.methods)} {...props} />;
}

export function VerificationCodeDeliveryDescription({ delivery }: { delivery: VerificationCodeDelivery }) {
  return (
    <>
      {delivery.message} <strong className="font-semibold text-foreground">{delivery.target}</strong>.
    </>
  );
}

function IdentityVerificationFormContent({
  allowRecoveryCode = false,
  defaultMethod,
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
  submitLabel = 'Verify',
  submittingLabel = 'Verifying',
}: IdentityVerificationFormProps) {
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
        updateDelivery(getVerificationCodeDelivery(method, result.maskedTarget ?? currentMethod?.maskedTarget));
        setResendAvailableAt(Date.now() + result.cooldownSeconds * 1000);
      }
    },
    [currentMethod?.maskedTarget, method, updateDelivery],
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
        setLocalError('Enter a recovery code.');
        return;
      }

      await onSubmit({ method, recoveryCode });
      return;
    }

    if (method === 'password') {
      if (!password) {
        setLocalError('Enter your password.');
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
      setLocalError('Enter the 6-digit code.');
      return;
    }

    await onSubmit({ method, code });
  }, [clearMessages, code, method, onSubmit, password, recoveryCode, usingRecoveryCode]);

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

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {method === 'passkey' ? (
        <div className="grid gap-2">
          <MethodHeader
            currentMethod={method}
            disabled={busy}
            label="Passkey"
            methods={methods}
            onChange={handleMethodChange}
            onSwitchOpen={clearMessages}
          />
        </div>
      ) : method === 'password' ? (
        <div className="grid gap-2">
          <MethodHeader
            currentMethod={method}
            disabled={busy}
            htmlFor="identityVerificationPassword"
            label="Password"
            methods={methods}
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
            placeholder="Enter your password"
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
            label="Recovery code"
            methods={methods}
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
            label={method === 'totp' ? 'Authenticator code' : 'Verification code'}
            methods={methods}
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

      <div className="flex flex-wrap justify-end gap-2">
        {method === 'passkey' ? (
          <Button disabled={pending} onClick={() => void submitCurrentMethod()} type="button" variant="outline">
            <FingerprintIcon />
            {pending ? submittingLabel : 'Use passkey'}
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
            {usingRecoveryCode ? 'Use authenticator code' : 'Use recovery code'}
          </Button>
        ) : null}
        {onCancel ? (
          <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
        ) : null}
        {method !== 'passkey' ? (
          <Button disabled={pending} type="submit">
            <ShieldCheckIcon />
            {pending ? submittingLabel : submitLabel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function MethodHeader({
  currentMethod,
  disabled,
  htmlFor,
  label,
  methods,
  onChange,
  onSwitchOpen,
}: {
  currentMethod: VerificationMethodName;
  disabled: boolean;
  htmlFor?: string;
  label: string;
  methods: VerificationMethod[];
  onChange: (method: VerificationMethodName) => void;
  onSwitchOpen: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Label htmlFor={htmlFor}>{label}</Label>
      <VerificationMethodSwitch
        currentMethod={currentMethod}
        disabled={disabled}
        methods={methods}
        onChange={onChange}
        onOpen={onSwitchOpen}
      />
    </div>
  );
}

function getInitialMethod(defaultMethod: VerificationMethodName, methods: VerificationMethod[]) {
  return methods.some((method) => method.method === defaultMethod) ? defaultMethod : methods[0]!.method;
}

function getInitialVerificationContext(
  defaultMethod: VerificationMethodName,
  methods: VerificationMethod[],
): IdentityVerificationContext {
  return {
    method: getInitialMethod(defaultMethod, methods),
    usingRecoveryCode: false,
  };
}

function getFormKey(defaultMethod: VerificationMethodName, methods: VerificationMethod[]) {
  return [defaultMethod, ...methods.map((method) => `${method.method}:${method.maskedTarget ?? ''}`)].join('|');
}
