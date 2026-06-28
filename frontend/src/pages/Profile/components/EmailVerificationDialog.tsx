import { type SubmitEventHandler } from 'react';

import { ShieldCheckIcon } from 'lucide-react';

import { type VerificationCodeDelivery } from '@/lib/verification';
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify email</DialogTitle>
          <DialogDescription>Enter the verification code sent to {email}.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="emailVerificationCode">Verification code</Label>
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
                {sending ? 'Sending' : delivery ? 'Resend code' : 'Send code'}
              </Button>
            </div>
            {delivery ? (
              <p className="text-xs leading-5 text-muted-foreground">
                <VerificationCodeDeliveryDescription delivery={delivery} />
              </p>
            ) : null}
          </div>
          <FormMessage message={error} variant="error" />
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={sending || confirming} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={sending || confirming} type="submit">
              <ShieldCheckIcon />
              {confirming ? 'Verifying' : 'Verify email'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
