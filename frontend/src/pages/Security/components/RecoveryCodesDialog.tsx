import { RefreshCwIcon } from 'lucide-react';

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recovery codes</DialogTitle>
          <DialogDescription>
            Regenerate one-time recovery codes. Existing unused codes will stop working.
          </DialogDescription>
        </DialogHeader>
        {recoveryCodes.length > 0 ? (
          <RecoveryCodes codes={recoveryCodes} onCopy={onCopy} />
        ) : (
          <div className="grid gap-4">
            <FormMessage message={error} variant="error" />
            <DialogFooter>
              <DialogClose asChild>
                <Button disabled={pending} type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <ConfirmActionDialog
                confirmLabel="Regenerate"
                description="Existing unused recovery codes will stop working immediately."
                onConfirm={onRegenerate}
                title="Regenerate recovery codes?"
              >
                <Button disabled={pending} type="button">
                  <RefreshCwIcon />
                  Regenerate
                </Button>
              </ConfirmActionDialog>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
