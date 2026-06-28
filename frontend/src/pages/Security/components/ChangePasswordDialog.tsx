import { type SubmitEventHandler, useState } from 'react';

import { KeyRoundIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import FormMessage from '@/components/FormMessage';

export interface ChangePasswordFormState {
  currentPassword: string;
  password: string;
  confirmPassword: string;
}

export function ChangePasswordDialog({
  disabled,
  error,
  form,
  onFieldChange,
  onOpenChange,
  onSubmit,
  open,
}: {
  disabled: boolean;
  error?: string | null;
  form: ChangePasswordFormState;
  onFieldChange: (field: keyof ChangePasswordFormState, value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
}) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setConfirmationOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Update the password used for this account.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              autoComplete="current-password"
              disabled={disabled}
              id="currentPassword"
              onChange={(event) => onFieldChange('currentPassword', event.target.value)}
              placeholder="Enter current password"
              type="password"
              value={form.currentPassword}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              autoComplete="new-password"
              disabled={disabled}
              id="newPassword"
              onChange={(event) => onFieldChange('password', event.target.value)}
              placeholder="At least 8 characters"
              type="password"
              value={form.password}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmNewPassword">Confirm password</Label>
            <Input
              autoComplete="new-password"
              disabled={disabled}
              id="confirmNewPassword"
              onChange={(event) => onFieldChange('confirmPassword', event.target.value)}
              placeholder="Repeat password"
              type="password"
              value={form.confirmPassword}
            />
          </div>
          <FormMessage message={error} variant="error" />
          <DialogFooter>
            <Button disabled={disabled} onClick={() => onOpenChange(false)} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={disabled} type="submit">
              <KeyRoundIcon />
              {disabled ? 'Changing password' : 'Change password'}
            </Button>
          </DialogFooter>
          <ConfirmActionDialog
            confirmLabel="Change password"
            description="Your password will be changed and other active device sessions will be signed out."
            onConfirm={onSubmit}
            onOpenChange={setConfirmationOpen}
            open={confirmationOpen}
            title="Change account password?"
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
