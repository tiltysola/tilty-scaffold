import { type ComponentProps, type ReactNode } from 'react';
import { useIntl } from 'react-intl';

import { AlertTriangleIcon } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shadcn/components/ui/alert-dialog';
import { type Button } from '@/shadcn/components/ui/button';

import { AppAlertDialogContent } from '@/components/AppDialog';

interface ConfirmActionDialogProps {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel: string;
  confirmVariant?: ComponentProps<typeof Button>['variant'];
  description: ReactNode;
  icon?: ReactNode;
  onOpenChange?: (open: boolean) => void;
  onConfirm: () => void;
  open?: boolean;
  title: string;
}

export function ConfirmActionDialog({
  cancelLabel,
  children,
  confirmLabel,
  confirmVariant = 'destructive',
  description,
  icon = <AlertTriangleIcon />,
  onOpenChange,
  onConfirm,
  open,
  title,
}: ConfirmActionDialogProps) {
  const intl = useIntl();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {children ? <AlertDialogTrigger asChild>{children}</AlertDialogTrigger> : null}
      <AppAlertDialogContent className="grid-rows-[auto_auto]">
        <div className={icon ? 'grid grid-cols-[auto_minmax(0,1fr)] gap-4 pb-4' : 'grid gap-3 pb-4 text-center'}>
          {icon ? (
            <AlertDialogMedia className="!m-0 bg-destructive/10 text-destructive sm:!row-span-1">
              {icon}
            </AlertDialogMedia>
          ) : null}
          <div className={icon ? 'grid min-w-0 gap-3 text-left' : 'grid gap-3'}>
            <AlertDialogTitle className="sm:!col-start-auto">{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel ?? intl.formatMessage({ id: 'common.cancel' })}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant={confirmVariant}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  );
}
