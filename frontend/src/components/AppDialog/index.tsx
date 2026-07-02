import { type ComponentProps, type FormEventHandler, type ReactNode } from 'react';

import { AlertDialogContent } from '@/shadcn/components/ui/alert-dialog';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { ScrollArea } from '@/shadcn/components/ui/scroll-area';
import { cn } from '@/shadcn/lib/utils';

type DialogContentProps = ComponentProps<typeof DialogContent>;

interface DialogRootProps {
  defaultOpen?: boolean;
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

interface AppDialogHeaderProps {
  className?: string;
  description?: ReactNode;
  title: ReactNode;
}

interface AppDialogBodyProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

interface AppDialogProps extends DialogRootProps {
  bodyClassName?: string;
  bodyContentClassName?: string;
  children: ReactNode;
  contentClassName?: string;
  contentProps?: Omit<DialogContentProps, 'children' | 'className'>;
  description?: ReactNode;
  footer?: ReactNode;
  title: ReactNode;
}

interface AppDialogFormProps extends Omit<AppDialogProps, 'footer'> {
  footer: ReactNode;
  formClassName?: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

const appDialogContentClassName =
  'grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden';

export function AppDialog({
  bodyClassName,
  bodyContentClassName,
  children,
  contentClassName,
  contentProps,
  description,
  footer,
  title,
  ...dialogProps
}: AppDialogProps) {
  return (
    <Dialog {...dialogProps}>
      <AppDialogContent className={contentClassName} {...contentProps}>
        <AppDialogHeader description={description} title={title} />
        <AppDialogBody className={bodyClassName} contentClassName={bodyContentClassName}>
          {children}
        </AppDialogBody>
        {footer ? <AppDialogFooter>{footer}</AppDialogFooter> : null}
      </AppDialogContent>
    </Dialog>
  );
}

export function AppDialogForm({
  bodyClassName,
  bodyContentClassName,
  children,
  contentClassName,
  contentProps,
  description,
  footer,
  formClassName,
  onSubmit,
  title,
  ...dialogProps
}: AppDialogFormProps) {
  return (
    <Dialog {...dialogProps}>
      <AppDialogContent className={contentClassName} {...contentProps}>
        <AppDialogHeader description={description} title={title} />
        <form className={cn('contents', formClassName)} onSubmit={onSubmit}>
          <AppDialogBody className={bodyClassName} contentClassName={bodyContentClassName}>
            {children}
          </AppDialogBody>
          <AppDialogFooter>{footer}</AppDialogFooter>
        </form>
      </AppDialogContent>
    </Dialog>
  );
}

export function AppDialogContent({ className, ...props }: DialogContentProps) {
  return <DialogContent className={cn(appDialogContentClassName, className)} {...props} />;
}

export function AppAlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogContent>) {
  return <AlertDialogContent className={cn(appDialogContentClassName, className)} {...props} />;
}

export function AppDialogHeader({ className, description, title }: AppDialogHeaderProps) {
  return (
    <DialogHeader className={className}>
      <DialogTitle>{title}</DialogTitle>
      {description ? <DialogDescription>{description}</DialogDescription> : null}
    </DialogHeader>
  );
}

export function AppDialogBody({ children, className, contentClassName }: AppDialogBodyProps) {
  return (
    <ScrollArea className={cn('-mx-4 mt-4 min-h-0 overflow-hidden', className)}>
      <div className={cn('px-4 pb-4', contentClassName)}>{children}</div>
    </ScrollArea>
  );
}

export function AppDialogFooter({ className, ...props }: ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={className} {...props} />;
}

export function AppSheetBody({ children, className, contentClassName }: AppDialogBodyProps) {
  return (
    <ScrollArea className={cn('min-h-0 flex-1 overflow-hidden', className)}>
      <div className={contentClassName}>{children}</div>
    </ScrollArea>
  );
}

export const AppDialogClose = DialogClose;
export const AppDialogRoot = Dialog;
