import { AppDialogRoot } from '@/components/AppDialog';

import { IdentityVerificationDialogContent } from './IdentityVerificationDialogContent';
import { type IdentityVerificationDialogProps } from './types';
import { getFormKey } from './utils';

export { IdentityVerificationForm } from './IdentityVerificationForm';
export { VerificationCodeDeliveryDescription } from './VerificationCodeDeliveryDescription';
export { type IdentityVerificationSubmitInput } from './types';

export function IdentityVerificationDialog({
  description,
  onOpenChange,
  open,
  title,
  ...formProps
}: IdentityVerificationDialogProps) {
  return (
    <AppDialogRoot open={open} onOpenChange={onOpenChange}>
      <IdentityVerificationDialogContent
        key={open ? getFormKey(formProps.defaultMethod, formProps.methods) : 'closed'}
        description={description}
        formProps={formProps}
        onOpenChange={onOpenChange}
        title={title}
      />
    </AppDialogRoot>
  );
}
