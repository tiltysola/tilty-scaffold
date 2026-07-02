import { type IntlShape } from 'react-intl';

import { type VerificationCodeSendResult, type VerificationMethod, type VerificationMethodName } from '@/lib/auth';
import { type IdentityVerificationContext, type VerificationCodeDelivery } from '@/lib/verification';

export interface IdentityVerificationSubmitInput {
  method: VerificationMethodName;
  code?: string;
  password?: string;
  recoveryCode?: string;
}

export interface IdentityVerificationFormProps {
  allowRecoveryCode?: boolean;
  defaultMethod: VerificationMethodName;
  dialogLayout?: boolean;
  error?: string | null;
  methods: VerificationMethod[];
  onCancel?: () => void;
  onClearError?: () => void;
  onContextChange?: (context: IdentityVerificationContext) => void;
  onDeliveryChange?: (delivery: VerificationCodeDelivery | null) => void;
  onSendCode?: (method: 'email' | 'sms') => Promise<VerificationCodeSendResult | null | undefined>;
  onSubmit: (input: IdentityVerificationSubmitInput) => Promise<void> | void;
  pending?: boolean;
  sendPending?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
}

export interface IdentityVerificationFormContentProps extends IdentityVerificationFormProps {
  formatMessage: IntlShape['formatMessage'];
}

export interface LocalizedVerificationMethod extends VerificationMethod {
  label: string;
}

export type IdentityVerificationDialogFormProps = Omit<
  IdentityVerificationFormProps,
  'onCancel' | 'onContextChange' | 'onDeliveryChange'
>;

export interface IdentityVerificationDialogProps extends IdentityVerificationDialogFormProps {
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title?: string;
}

export interface IdentityVerificationDialogContentProps {
  description?: string;
  formProps: IdentityVerificationDialogFormProps;
  onOpenChange: (open: boolean) => void;
  title?: string;
}
