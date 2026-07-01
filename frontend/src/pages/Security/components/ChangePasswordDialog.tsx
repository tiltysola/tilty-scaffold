import { type SubmitEventHandler, useState } from 'react';
import { useIntl } from 'react-intl';

import { KeyRoundIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import { AppDialogForm } from '@/components/AppDialog';
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
  const intl = useIntl();

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setConfirmationOpen(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setConfirmationOpen(false);
    }

    onOpenChange(nextOpen);
  };

  return (
    <>
      <AppDialogForm
        bodyContentClassName="grid gap-4"
        description={intl.formatMessage({ id: 'security.change.password.description' })}
        footer={
          <>
            <Button disabled={disabled} onClick={() => onOpenChange(false)} type="button" variant="outline">
              {intl.formatMessage({ id: 'common.cancel' })}
            </Button>
            <Button disabled={disabled} type="submit">
              <KeyRoundIcon />
              {disabled
                ? intl.formatMessage({ id: 'security.changing.password' })
                : intl.formatMessage({ id: 'security.change.password' })}
            </Button>
          </>
        }
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
        open={open}
        title={intl.formatMessage({ id: 'security.change.password' })}
      >
        <div className="grid gap-2">
          <Label htmlFor="currentPassword">{intl.formatMessage({ id: 'security.current.password' })}</Label>
          <Input
            autoComplete="current-password"
            disabled={disabled}
            id="currentPassword"
            onChange={(event) => onFieldChange('currentPassword', event.target.value)}
            placeholder={intl.formatMessage({ id: 'security.current.password.placeholder' })}
            type="password"
            value={form.currentPassword}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="newPassword">{intl.formatMessage({ id: 'security.new.password' })}</Label>
          <Input
            autoComplete="new-password"
            disabled={disabled}
            id="newPassword"
            onChange={(event) => onFieldChange('password', event.target.value)}
            placeholder={intl.formatMessage({ id: 'security.new.password.placeholder' })}
            type="password"
            value={form.password}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmNewPassword">{intl.formatMessage({ id: 'auth.password.confirm' })}</Label>
          <Input
            autoComplete="new-password"
            disabled={disabled}
            id="confirmNewPassword"
            onChange={(event) => onFieldChange('confirmPassword', event.target.value)}
            placeholder={intl.formatMessage({ id: 'security.confirm.password.placeholder' })}
            type="password"
            value={form.confirmPassword}
          />
        </div>
        <FormMessage message={error} variant="error" />
      </AppDialogForm>
      <ConfirmActionDialog
        confirmLabel={intl.formatMessage({ id: 'security.change.password' })}
        description={intl.formatMessage({ id: 'security.change.password.confirmation.description' })}
        onConfirm={onSubmit}
        onOpenChange={setConfirmationOpen}
        open={confirmationOpen}
        title={intl.formatMessage({ id: 'security.change.password.title' })}
      />
    </>
  );
}
