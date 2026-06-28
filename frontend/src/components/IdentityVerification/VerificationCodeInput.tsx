import { useEffect, useState } from 'react';

import { OTPInput, type RenderProps } from 'input-otp';

import { Button } from '@/shadcn/components/ui/button';
import { cn } from '@/shadcn/lib/utils';

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

const VerificationCodeInput = ({
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
  const resendLabel = codeSent ? 'Resend' : 'Send code';

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
          <span>Code not received?</span>
          <Button
            className="h-auto p-0 text-xs"
            disabled={disabled || resendDisabled || resendPending || remainingSeconds > 0}
            onClick={onResend}
            type="button"
            variant="link"
          >
            {resendPending ? 'Sending' : `${resendLabel}${remainingSeconds > 0 ? ` (${remainingSeconds})` : ''}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
};

function VerificationCodeSlots({ slots }: { slots: RenderProps['slots'] }) {
  return (
    <div className="flex w-full items-center rounded-lg has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40">
      {slots.map((slot, index) => (
        <VerificationCodeSlot key={index} slot={slot} />
      ))}
    </div>
  );
}

function VerificationCodeSlot({ slot }: { slot: RenderProps['slots'][number] }) {
  return (
    <div
      className={cn(
        'relative flex h-11 flex-1 items-center justify-center border-y border-r border-input text-base transition-all outline-none first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive dark:bg-input/30',
        slot.isActive &&
          'z-10 border-ring ring-3 ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
      )}
      data-active={slot.isActive}
      data-slot="verification-code-slot"
    >
      {slot.char}
      {slot.hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      ) : null}
    </div>
  );
}

export default VerificationCodeInput;
