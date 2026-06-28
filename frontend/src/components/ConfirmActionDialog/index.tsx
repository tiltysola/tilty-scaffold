import { type ComponentProps, type ReactNode } from 'react';

import { AlertTriangleIcon } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shadcn/components/ui/alert-dialog';
import { type Button } from '@/shadcn/components/ui/button';

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
  cancelLabel = 'Cancel',
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
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {children ? <AlertDialogTrigger asChild>{children}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          {icon ? <AlertDialogMedia className="bg-destructive/10 text-destructive">{icon}</AlertDialogMedia> : null}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} variant={confirmVariant}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
