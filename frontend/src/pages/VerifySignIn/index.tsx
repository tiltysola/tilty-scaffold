import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { sendVerificationCode, verifyAuthenticationChallenge, verifyWithPasskey } from '@/lib/auth';
import {
  getIdentityVerificationDescription,
  type IdentityVerificationContext,
  type VerificationCodeDelivery,
} from '@/lib/verification';
import { routePath } from '@/router';

import { AuthCard } from '@/components/AuthCard';
import {
  IdentityVerificationForm,
  type IdentityVerificationSubmitInput,
  VerificationCodeDeliveryDescription,
} from '@/components/IdentityVerification';

import { getInitialMethod, getMethodOptions, getSafeRedirectPath } from './utils';

const Index = () => {
  const [context, setContext] = useState<IdentityVerificationContext | null>(null);
  const [delivery, setDelivery] = useState<VerificationCodeDelivery | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const intl = useIntl();
  const action = useAsyncAction();
  const sendAction = useAsyncAction();
  const token = params.get('token') ?? '';
  const methodOptions = useMemo(() => getMethodOptions(params.get('methods'), params.get('method_details')), [params]);
  const methods = useMemo(() => methodOptions.map((item) => item.method), [methodOptions]);
  const defaultMethod = getInitialMethod(params.get('default_method'), methods);
  const redirectPath = getSafeRedirectPath(params.get('redirect'));

  const handleSendCode = async (method: 'email' | 'sms') => {
    sendAction.clearError();

    if (!token) {
      sendAction.setError(intl.formatMessage({ id: 'identity.verification.token.missing' }));
      return null;
    }

    return sendAction.run(
      () =>
        sendVerificationCode({
          method,
          verificationToken: token,
        }),
      intl.formatMessage({ id: 'identity.verification.code.send.failed' }),
    );
  };

  const handleSubmit = async (input: IdentityVerificationSubmitInput) => {
    action.clearError();

    if (!token) {
      action.setError(intl.formatMessage({ id: 'identity.verification.token.missing' }));
      return;
    }

    const result = await action.run(
      () =>
        input.method === 'passkey'
          ? verifyWithPasskey(token)
          : verifyAuthenticationChallenge({
              verificationToken: token,
              ...input,
            }),
      input.method === 'passkey'
        ? intl.formatMessage({ id: 'identity.passkey.verification.failed' })
        : intl.formatMessage({ id: 'identity.verification.failed' }),
    );

    if (result && 'accessTokenExpiresAt' in result) {
      navigate(redirectPath, { replace: true });
    }
  };

  return (
    <AuthCard
      description={
        delivery ? (
          <VerificationCodeDeliveryDescription delivery={delivery} />
        ) : (
          getIdentityVerificationDescription(
            context ?? { method: defaultMethod, usingRecoveryCode: false },
            intl.formatMessage,
          )
        )
      }
      footer={
        <Link
          className="font-medium text-muted-foreground hover:text-foreground hover:underline"
          to={routePath('login')}
        >
          {intl.formatMessage({ id: 'sso.return.to.login' })}
        </Link>
      }
      footerClassName="justify-center text-sm"
      title={intl.formatMessage({ id: 'route.verify.sign.in' })}
    >
      <IdentityVerificationForm
        allowRecoveryCode
        defaultMethod={defaultMethod}
        error={action.error ?? sendAction.error}
        methods={methodOptions}
        onClearError={() => {
          action.clearError();
          sendAction.clearError();
        }}
        onContextChange={setContext}
        onDeliveryChange={setDelivery}
        onSendCode={handleSendCode}
        onSubmit={handleSubmit}
        pending={action.pending}
        sendPending={sendAction.pending}
      />
    </AuthCard>
  );
};

export default Index;
