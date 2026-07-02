import { useIntl } from 'react-intl';

import { IdentityVerificationFormContent } from './IdentityVerificationFormContent';
import { type IdentityVerificationFormProps } from './types';
import { getFormKey } from './utils';

export function IdentityVerificationForm(props: IdentityVerificationFormProps) {
  const intl = useIntl();

  return (
    <IdentityVerificationFormContent
      key={getFormKey(props.defaultMethod, props.methods)}
      {...props}
      formatMessage={intl.formatMessage}
    />
  );
}
