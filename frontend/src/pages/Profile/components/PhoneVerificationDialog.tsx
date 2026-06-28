import { type SubmitEventHandler } from 'react';

import { ChevronDownIcon, ShieldCheckIcon } from 'lucide-react';

import { type PhoneCountryCode } from '@/lib/auth';
import { formatPhoneCountryCode, getPhonePlaceholder } from '@/lib/phone';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import FormMessage from '@/components/FormMessage';
import { VerificationCodeDeliveryDescription } from '@/components/IdentityVerification';

export function PhoneVerificationDialog({
  bindingEnabled,
  code,
  confirming,
  countryCode,
  countryCodes,
  delivery,
  error,
  hasPhoneNumber,
  localNumber,
  onCodeChange,
  onCountryCodeChange,
  onLocalNumberChange,
  onOpenChange,
  onSendCode,
  onSubmit,
  open,
  pending,
  required,
  sending,
}: {
  bindingEnabled: boolean;
  code: string;
  confirming: boolean;
  countryCode: PhoneCountryCode;
  countryCodes: PhoneCountryCode[];
  delivery: VerificationCodeDelivery | null;
  error?: string | null;
  hasPhoneNumber: boolean;
  localNumber: string;
  onCodeChange: (value: string) => void;
  onCountryCodeChange: (countryCode: PhoneCountryCode) => void;
  onLocalNumberChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSendCode: () => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  open: boolean;
  pending: boolean;
  required: boolean;
  sending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasPhoneNumber ? 'Change phone' : 'Bind phone'}</DialogTitle>
          <DialogDescription>Verify the phone number for this account.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="phoneLocalNumber">Phone number</Label>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={pending || !bindingEnabled}>
                  <Button
                    className="w-24 shrink-0 justify-between"
                    id="phoneCountryCode"
                    type="button"
                    variant="outline"
                  >
                    {countryCode}
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-[60] min-w-56">
                  {countryCodes.map((availableCountryCode) => (
                    <DropdownMenuItem
                      key={availableCountryCode}
                      onSelect={() => onCountryCodeChange(availableCountryCode)}
                    >
                      {formatPhoneCountryCode(availableCountryCode)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                autoComplete="tel-national"
                disabled={pending || !bindingEnabled}
                id="phoneLocalNumber"
                name="phoneLocalNumber"
                onChange={(event) => onLocalNumberChange(event.target.value)}
                placeholder={getPhonePlaceholder(countryCode)}
                value={localNumber}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phoneVerificationCode">Verification code</Label>
            <div className="flex gap-2">
              <Input
                autoComplete="one-time-code"
                disabled={pending || !bindingEnabled}
                id="phoneVerificationCode"
                inputMode="numeric"
                maxLength={6}
                name="phoneVerificationCode"
                onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
                pattern="[0-9]{6}"
                placeholder="000000"
                value={code}
              />
              <Button disabled={pending || !bindingEnabled} onClick={onSendCode} type="button" variant="outline">
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
              <Button disabled={pending} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={pending || !required || code.trim().length === 0} type="submit">
              <ShieldCheckIcon />
              {confirming ? 'Verifying' : 'Verify phone'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
