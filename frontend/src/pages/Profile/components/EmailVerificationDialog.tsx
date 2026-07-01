import { type SubmitEventHandler } from 'react';
import { useIntl } from 'react-intl';

import { ShieldCheckIcon } from 'lucide-react';

import { type VerificationCodeDelivery } from '@/lib/verification';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import { AppDialogClose, AppDialogForm } from '@/components/AppDialog';
import FormMessage from '@/components/FormMessage';
import { VerificationCodeDeliveryDescription } from '@/components/IdentityVerification';

export function EmailVerificationDialog({
  code,
  confirming,
  delivery,
  email,
  error,
  onCodeChange,
  onOpenChange,
  onSendCode,
  onSubmit,
  open,
  sending,
}: {
  code: string;
  confirming: boolean;
  delivery: VerificationCodeDelivery | null;
  email: string;
  error?: string | null;
  onCodeChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSendCode: () => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  open: boolean;
  sending: boolean;
}) {
  const intl = useIntl();

  return (
    <AppDialogForm
      bodyContentClassName="grid gap-4"
      description={intl.formatMessage({ id: 'profile.verify.email.description' }, { email })}
      footer={
        <>
          <AppDialogClose asChild>
            <Button disabled={sending || confirming} type="button" variant="outline">
              {intl.formatMessage({ id: 'common.cancel' })}
            </Button>
          </AppDialogClose>
          <Button disabled={sending || confirming} type="submit">
            <ShieldCheckIcon />
            {confirming
              ? intl.formatMessage({ id: 'identity.verifying' })
              : intl.formatMessage({ id: 'profile.verify.email' })}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      open={open}
      title={intl.formatMessage({ id: 'profile.verify.email' })}
    >
      <div className="grid gap-2">
        <Label htmlFor="emailVerificationCode">{intl.formatMessage({ id: 'identity.verification.code' })}</Label>
        <div className="flex gap-2">
          <Input
            autoComplete="one-time-code"
            disabled={confirming}
            id="emailVerificationCode"
            inputMode="numeric"
            maxLength={6}
            name="emailVerificationCode"
            onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
            pattern="[0-9]{6}"
            placeholder="000000"
            value={code}
          />
          <Button disabled={sending || confirming} onClick={onSendCode} type="button" variant="outline">
            {sending
              ? intl.formatMessage({ id: 'common.sending' })
              : delivery
                ? intl.formatMessage({ id: 'common.resend' })
                : intl.formatMessage({ id: 'common.send.code' })}
          </Button>
        </div>
        {delivery ? (
          <p className="text-xs leading-5 text-muted-foreground">
            <VerificationCodeDeliveryDescription delivery={delivery} />
          </p>
        ) : null}
      </div>
      <FormMessage message={error} variant="error" />
    </AppDialogForm>
  );
}
