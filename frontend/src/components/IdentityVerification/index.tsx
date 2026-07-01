import { type SubmitEventHandler, useCallback, useEffect, useRef, useState } from 'react';
import { type IntlShape, useIntl } from 'react-intl';

import { FingerprintIcon, ShieldCheckIcon } from 'lucide-react';

import { type VerificationCodeSendResult, type VerificationMethod, type VerificationMethodName } from '@/lib/auth';
import {
  getIdentityVerificationDescription,
  getVerificationCodeDelivery,
  getVerificationMethodLabel,
  type IdentityVerificationContext,
  type VerificationCodeDelivery,
} from '@/lib/verification';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import {
  AppDialogBody,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogRoot,
} from '@/components/AppDialog';
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
  dialogLayout?: boolean;
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

interface IdentityVerificationFormContentProps extends IdentityVerificationFormProps {
  formatMessage: IntlShape['formatMessage'];
}

interface LocalizedVerificationMethod extends VerificationMethod {
  label: string;
}

type IdentityVerificationDialogFormProps = Omit<
  IdentityVerificationFormProps,
  'onCancel' | 'onContextChange' | 'onDeliveryChange'
>;

interface IdentityVerificationDialogProps extends IdentityVerificationDialogFormProps {
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title?: string;
}

interface IdentityVerificationDialogContentProps {
  description?: string;
  formProps: IdentityVerificationDialogFormProps;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function IdentityVerificationDialog({
  description,
  onOpenChange,
  open,
  title,
  ...formProps
}: IdentityVerificationDialogProps) {
  return (
    <AppDialogRoot open={open} onOpenChange={onOpenChange}>
      <IdentityVerificationDialogContent
        key={open ? getFormKey(formProps.defaultMethod, formProps.methods) : 'closed'}
        description={description}
        formProps={formProps}
        onOpenChange={onOpenChange}
        title={title}
      />
    </AppDialogRoot>
  );
}

function IdentityVerificationDialogContent({
  description,
  formProps,
  onOpenChange,
  title,
}: IdentityVerificationDialogContentProps) {
  const [context, setContext] = useState<IdentityVerificationContext>(() =>
    getInitialVerificationContext(formProps.defaultMethod, formProps.methods),
  );
  const [delivery, setDelivery] = useState<VerificationCodeDelivery | null>(null);
  const intl = useIntl();

  return (
    <AppDialogContent className="sm:max-w-md">
      <AppDialogHeader
        description={
          delivery ? (
            <VerificationCodeDeliveryDescription delivery={delivery} />
          ) : (
            (description ?? getIdentityVerificationDescription(context, intl.formatMessage))
          )
        }
        title={title ?? intl.formatMessage({ id: 'identity.verify.identity' })}
      />
      <IdentityVerificationForm
        {...formProps}
        dialogLayout
        onCancel={() => onOpenChange(false)}
        onContextChange={setContext}
        onDeliveryChange={setDelivery}
      />
    </AppDialogContent>
  );
}

export function IdentityVerificationForm(props: IdentityVerificationFormProps) {
  const intl = useIntl();

  return (
    <IdentityVerificationFormContent
      key={getFormKey(props.defaultMethod, props.methods)}
      {...props}
      formatMessage={intl.formatMessage}
    />
  );
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
  methods: LocalizedVerificationMethod[];
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
