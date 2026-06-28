import { type SubmitEventHandler } from 'react';

import { ShieldCheckIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import { type TotpSetup } from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable two-step authentication</DialogTitle>
          <DialogDescription>Scan the QR code with an authenticator app, then enter the code.</DialogDescription>
        </DialogHeader>
        {recoveryCodes.length > 0 ? (
          <RecoveryCodes codes={recoveryCodes} onCopy={onCopyRecoveryCodes} />
        ) : setup ? (
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <QRCodeSVG size={192} value={setup.otpauthUrl} />
            </div>
            <div className="grid gap-2">
              <Label>Manual key</Label>
              <code className="break-all rounded-md bg-muted px-3 py-2 text-center text-sm">{setup.secret}</code>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="setupCode">Authentication code</Label>
              <Input
                autoComplete="one-time-code"
                className="text-center"
                disabled={pending}
                id="setupCode"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, ''))}
                value={code}
              />
            </div>
            <FormMessage message={error} variant="error" />
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={pending} type="submit">
                <ShieldCheckIcon />
                Enable
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
