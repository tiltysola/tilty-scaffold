import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { OTPInput, type RenderProps } from 'input-otp';

import { Button } from '@/shadcn/components/ui/button';

import { VerificationCodeSlots } from './VerificationCodeSlots';

interface VerificationCodeInputProps {
  autoFocus?: boolean;
  codeSent?: boolean;
  disabled?: boolean;
  id: string;
  onChange: (value: string) => void;
  onResend?: () => void;
  resendAvailableAt?: number | null;
  resendDisabled?: boolean;
  resendPending?: boolean;
  value: string;
}

const verificationCodeLength = 6;

const Index = ({
  autoFocus = false,
  codeSent = false,
  disabled = false,
  id,
  onChange,
  onResend,
  resendAvailableAt,
  resendDisabled = false,
  resendPending = false,
  value,
}: VerificationCodeInputProps) => {
  const [now, setNow] = useState(() => Date.now());
  const intl = useIntl();

  useEffect(() => {
    if (!resendAvailableAt || resendAvailableAt <= Date.now()) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      const nextNow = Date.now();

      setNow(nextNow);

      if (resendAvailableAt <= nextNow) {
        window.clearInterval(intervalId);
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [resendAvailableAt]);

  const remainingSeconds = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0;
  const canResend = Boolean(onResend);
  const resendLabel = codeSent
    ? intl.formatMessage({ id: 'common.resend' })
    : intl.formatMessage({ id: 'common.send.code' });

  return (
    <div className="grid gap-2">
      <OTPInput
        autoFocus={autoFocus}
        className="disabled:cursor-not-allowed"
        containerClassName="flex w-full items-center has-disabled:opacity-50"
        disabled={disabled}
        id={id}
        inputMode="numeric"
        maxLength={verificationCodeLength}
        onChange={(nextValue: string) => onChange(nextValue.replace(/\D/g, ''))}
        pattern="^[0-9]+$"
        render={({ slots }: RenderProps) => <VerificationCodeSlots slots={slots} />}
        value={value}
      />
      {canResend ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>{intl.formatMessage({ id: 'identity.code.not.received' })}</span>
          <Button
            className="h-auto p-0 text-xs"
            disabled={disabled || resendDisabled || resendPending || remainingSeconds > 0}
            onClick={onResend}
            type="button"
            variant="link"
          >
            {resendPending
              ? intl.formatMessage({ id: 'common.sending' })
              : `${resendLabel}${remainingSeconds > 0 ? ` (${remainingSeconds})` : ''}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default Index;
