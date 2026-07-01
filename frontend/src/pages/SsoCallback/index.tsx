import { type SubmitEventHandler, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router-dom';

import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useFormState } from '@/hooks/useFormState';
import { bindSsoAccount, completeSsoLogin, createSsoAccount } from '@/lib/auth';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';
import {
  createPasswordFormSchema,
  displayNameSchema,
  loginCredentialsSchema,
  usernameSchema,
} from '@tilty/shared/validation';

import { AuthCard } from '@/components/AuthCard';
import FormMessage from '@/components/FormMessage';

import { SsoBindTabs } from './components/SsoBindTabs';
import {
  clearCallbackFragment,
  createVerificationParams,
  getInitialCallbackHash,
  getPageDescription,
  getPageTitle,
  type ParsedSsoCallback,
  parseSsoCallback,
  type SsoCallbackStatus,
  withProfileBindResult,
} from './utils';

type LoginFormState = z.input<typeof loginCredentialsSchema>;
type SsoCreateFormState = z.input<typeof ssoCreateSchema>;

const ssoCreateSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
});

const Index = () => {
  const [callback] = useState<ParsedSsoCallback>(() => parseSsoCallback(getInitialCallbackHash()));
  const ssoBind = callback.type === 'bind' ? callback.ssoBind : null;
  const [ssoTab, setSsoTab] = useState<'create' | 'bind'>('create');
  const [status, setStatus] = useState<SsoCallbackStatus>(
    callback.type === 'bind' ? 'bind' : callback.type === 'invalid' ? 'invalid' : 'processing',
  );
  const handledCallbackRef = useRef(false);
  const navigate = useNavigate();
  const intl = useIntl();
  const { error, pending: submitting, run, setError } = useAsyncAction();
  const { form, handleChange } = useFormState<LoginFormState>({
    identifier: '',
    password: '',
  });
  const { form: ssoCreateForm, handleChange: handleSsoCreateChange } = useFormState<SsoCreateFormState>({
    username: ssoBind?.username ?? '',
    displayName: ssoBind?.displayName ?? '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (handledCallbackRef.current) {
      return;
    }

    handledCallbackRef.current = true;

    if (callback.type === 'invalid') {
      clearCallbackFragment();
      return;
    }

    clearCallbackFragment();

    if (callback.type === 'profileBind') {
      navigate(withProfileBindResult(callback.redirectPath), { replace: true });
      return;
    }

    if (callback.type === 'verification') {
      navigate(
        `${routePath('verifySignIn')}?${createVerificationParams(
          callback.token,
          callback.redirectPath,
          callback.defaultMethod,
          callback.methods,
          callback.methodDetails,
        )}`,
        { replace: true },
      );
      return;
    }

    if (callback.type === 'session') {
      void run(() => completeSsoLogin(callback.token), intl.formatMessage({ id: 'sso.authentication.invalid' })).then(
        (session) => {
          if (session) {
            navigate(callback.redirectPath, { replace: true });
            return;
          }

          setStatus('invalid');
        },
      );

      return;
    }
  }, [callback, intl, navigate, run]);

  const handleSsoTabChange = (value: string) => {
    if (value !== 'create' && value !== 'bind') {
      return;
    }

    setSsoTab(value);
    setError(null);
  };

  const handleCreateSsoAccount: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (!ssoBind) {
      return;
    }

    setError(null);

    const parsed = ssoCreateSchema.safeParse(ssoCreateForm);

    if (!parsed.success) {
      setError(intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'sso.account.registration.invalid' }));
      return;
    }

    const session = await run(
      () =>
        createSsoAccount({
          ...parsed.data,
          token: ssoBind.token,
        }),
      intl.formatMessage({ id: 'sso.create.account.failed' }),
    );

    if (session) {
      navigate(ssoBind.redirectPath, { replace: true });
    }
  };

  const handleBindSsoAccount: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (!ssoBind) {
      return;
    }

    setError(null);

    const parsed = loginCredentialsSchema.safeParse(form);

    if (!parsed.success) {
      setError(intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'sso.account.credentials.invalid' }));
      return;
    }

    const result = await run(
      () =>
        bindSsoAccount({
          ...parsed.data,
          token: ssoBind.token,
        }),
      intl.formatMessage({ id: 'sso.bind.account.failed' }),
    );

    if (!result) {
      return;
    }

    if ('requiresVerification' in result) {
      navigate(
        `${routePath('verifySignIn')}?${createVerificationParams(
          result.verificationToken,
          ssoBind.redirectPath,
          result.defaultMethod,
          result.methods,
        )}`,
        { replace: true },
      );
      return;
    }

    navigate(ssoBind.redirectPath, { replace: true });
  };

  return (
    <AuthCard
      description={getPageDescription(status, ssoBind, intl.formatMessage)}
      maxWidth={status === 'bind' ? '2xl' : 'md'}
      title={getPageTitle(status, intl.formatMessage)}
    >
      {status === 'bind' && ssoBind ? (
        <SsoBindTabs
          bindForm={form}
          createForm={ssoCreateForm}
          error={error}
          onBindChange={handleChange}
          onBindSubmit={handleBindSsoAccount}
          onCreateChange={handleSsoCreateChange}
          onCreateSubmit={handleCreateSsoAccount}
          onTabChange={handleSsoTabChange}
          ssoBind={ssoBind}
          submitting={submitting}
          tab={ssoTab}
        />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          {status === 'processing' ? <Spinner className="size-6 text-muted-foreground" /> : null}
          <FormMessage
            message={error ?? (status === 'invalid' ? intl.formatMessage({ id: 'sso.authentication.invalid' }) : null)}
            variant="error"
          />
          {status === 'invalid' ? (
            <Button asChild variant="outline">
              <Link to={routePath('login')}>{intl.formatMessage({ id: 'sso.return.to.login' })}</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{intl.formatMessage({ id: 'sso.wait' })}</p>
          )}
        </div>
      )}
    </AuthCard>
  );
};

export default Index;
