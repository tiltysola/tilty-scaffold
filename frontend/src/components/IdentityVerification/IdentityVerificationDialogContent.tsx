import { useState } from 'react';
import { useIntl } from 'react-intl';

import { getIdentityVerificationDescription, type VerificationCodeDelivery } from '@/lib/verification';

import { AppDialogContent, AppDialogHeader } from '@/components/AppDialog';

import { IdentityVerificationForm } from './IdentityVerificationForm';
import { type IdentityVerificationDialogContentProps } from './types';
import { getInitialVerificationContext } from './utils';
import { VerificationCodeDeliveryDescription } from './VerificationCodeDeliveryDescription';

export function IdentityVerificationDialogContent({
  description,
  formProps,
  onOpenChange,
  title,
}: IdentityVerificationDialogContentProps) {
  const [context, setContext] = useState(() =>
    getInitialVerificationContext(formProps.defaultMethod, formProps.methods),
  );
  const [delivery, setDelivery] = useState<VerificationCodeDelivery | null>(null);
  const intl = useIntl();

  return (
    <AppDialogContent className="sm:max-w-md">
      <AppDialogHeader
        description={
          delivery ? (
            <VerificationCodeDeliveryDescription delivery={delivery} />
          ) : (
            (description ?? getIdentityVerificationDescription(context, intl.formatMessage))
          )
        }
        title={title ?? intl.formatMessage({ id: 'identity.verify.identity' })}
      />
      <IdentityVerificationForm
        {...formProps}
        dialogLayout
        onCancel={() => onOpenChange(false)}
        onContextChange={setContext}
        onDeliveryChange={setDelivery}
      />
    </AppDialogContent>
  );
}
