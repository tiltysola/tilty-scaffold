import { useIntl } from 'react-intl';

import { RefreshCwIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';

import {
  AppDialogBody,
  AppDialogClose,
  AppDialogContent,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogRoot,
} from '@/components/AppDialog';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import FormMessage from '@/components/FormMessage';

import { RecoveryCodes } from './RecoveryCodes';

export function RecoveryCodesDialog({
  error,
  onCopy,
  onOpenChange,
  onRegenerate,
  open,
  pending,
  recoveryCodes,
}: {
  error?: string | null;
  onCopy: () => void;
  onOpenChange: (open: boolean) => void;
  onRegenerate: () => void;
  open: boolean;
  pending: boolean;
  recoveryCodes: string[];
}) {
  const intl = useIntl();

  return (
    <AppDialogRoot open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <AppDialogHeader
          description={intl.formatMessage({ id: 'security.recovery.codes.description' })}
          title={intl.formatMessage({ id: 'security.recovery.codes' })}
        />
        {recoveryCodes.length > 0 ? (
          <RecoveryCodes codes={recoveryCodes} onCopy={onCopy} />
        ) : (
          <>
            <AppDialogBody contentClassName="grid gap-4">
              <FormMessage message={error} variant="error" />
            </AppDialogBody>
            <AppDialogFooter>
              <AppDialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">
                  {intl.formatMessage({ id: 'common.cancel' })}
                </Button>
              </AppDialogClose>
              <ConfirmActionDialog
                confirmLabel={intl.formatMessage({ id: 'common.regenerate' })}
                description={intl.formatMessage({ id: 'security.regenerate.recovery.codes.description' })}
                onConfirm={onRegenerate}
                title={intl.formatMessage({ id: 'security.regenerate.recovery.codes.title' })}
              >
                <Button disabled={pending} type="button">
                  <RefreshCwIcon />
                  {intl.formatMessage({ id: 'common.regenerate' })}
                </Button>
              </ConfirmActionDialog>
            </AppDialogFooter>
          </>
        )}
      </AppDialogContent>
    </AppDialogRoot>
  );
}
