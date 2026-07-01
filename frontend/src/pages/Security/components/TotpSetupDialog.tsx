import { type SubmitEventHandler } from 'react';
import { useIntl } from 'react-intl';

import { ShieldCheckIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { type TotpSetup } from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import {
  AppDialogBody,
  AppDialogClose,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogRoot,
} from '@/components/AppDialog';
import FormMessage from '@/components/FormMessage';

import { RecoveryCodes } from './RecoveryCodes';

export function TotpSetupDialog({
  code,
  error,
  onCodeChange,
  onCopyRecoveryCodes,
  onOpenChange,
  onSubmit,
  open,
  pending,
  recoveryCodes,
  setup,
}: {
  code: string;
  error?: string | null;
  onCodeChange: (value: string) => void;
  onCopyRecoveryCodes: () => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  open: boolean;
  pending: boolean;
  recoveryCodes: string[];
  setup: TotpSetup | null;
}) {
  const intl = useIntl();

  return (
    <AppDialogRoot open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader
          description={intl.formatMessage({ id: 'security.totp.setup.description' })}
          title={intl.formatMessage({ id: 'security.totp.setup' })}
        />
        {recoveryCodes.length > 0 ? (
          <RecoveryCodes codes={recoveryCodes} onCopy={onCopyRecoveryCodes} />
        ) : setup ? (
          <form className="contents" onSubmit={onSubmit}>
            <AppDialogBody contentClassName="grid gap-4">
              <div className="flex justify-center rounded-lg border bg-white p-4">
                <QRCodeSVG size={192} value={setup.otpauthUrl} />
              </div>
              <div className="grid gap-2">
                <Label>{intl.formatMessage({ id: 'security.totp.manual.key' })}</Label>
                <code className="break-all rounded-md bg-muted px-3 py-2 text-center text-sm">{setup.secret}</code>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="setupCode">{intl.formatMessage({ id: 'security.totp.code' })}</Label>
                <Input
                  autoComplete="one-time-code"
                  className="text-center"
                  disabled={pending}
                  id="setupCode"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, ''))}
                  placeholder={intl.formatMessage({ id: 'security.totp.code.placeholder' })}
                  value={code}
                />
              </div>
              <FormMessage message={error} variant="error" />
            </AppDialogBody>
            <AppDialogFooter>
              <AppDialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">
                  {intl.formatMessage({ id: 'common.cancel' })}
                </Button>
              </AppDialogClose>
              <Button disabled={pending} type="submit">
                <ShieldCheckIcon />
                {intl.formatMessage({ id: 'common.enable' })}
              </Button>
            </AppDialogFooter>
          </form>
        ) : null}
      </AppDialogContent>
    </AppDialogRoot>
  );
}
