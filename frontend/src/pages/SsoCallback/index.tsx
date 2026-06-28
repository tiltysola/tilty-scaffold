import { type SubmitEventHandler, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useFormState } from '@/hooks/useFormState';
import { bindSsoAccount, completeSsoLogin, createSsoAccount } from '@/lib/auth';
import {
  createPasswordFormSchema,
  displayNameSchema,
  loginCredentialsSchema,
  usernameSchema,
} from '@/lib/auth-validation';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';

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

const ssoCreateSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
});

type LoginFormState = z.input<typeof loginCredentialsSchema>;
type SsoCreateFormState = z.input<typeof ssoCreateSchema>;

const Index = () => {
  const [callback] = useState<ParsedSsoCallback>(() => parseSsoCallback(getInitialCallbackHash()));
  const ssoBind = callback.type === 'bind' ? callback.ssoBind : null;
  const [ssoTab, setSsoTab] = useState<'create' | 'bind'>('create');
  const [status, setStatus] = useState<SsoCallbackStatus>(
    callback.type === 'bind' ? 'bind' : callback.type === 'invalid' ? 'invalid' : 'processing',
  );
  const handledCallbackRef = useRef(false);
  const navigate = useNavigate();
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
      void run(() => completeSsoLogin(callback.token), 'SSO authentication could not be completed.').then((session) => {
        if (session) {
          navigate(callback.redirectPath, { replace: true });
          return;
        }

        setStatus('invalid');
      });

      return;
    }
  }, [callback, navigate, run]);

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
      setError(parsed.error.issues[0]?.message ?? 'Account registration details are invalid.');
      return;
    }

    const session = await run(
      () =>
        createSsoAccount({
          ...parsed.data,
          token: ssoBind.token,
        }),
      'SSO account creation could not be completed.',
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
      setError(parsed.error.issues[0]?.message ?? 'Account credentials are invalid.');
      return;
    }

    const result = await run(
      () =>
        bindSsoAccount({
          ...parsed.data,
          token: ssoBind.token,
        }),
      'SSO account binding could not be completed.',
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
      description={getPageDescription(status, ssoBind)}
      maxWidth={status === 'bind' ? '2xl' : 'md'}
      title={getPageTitle(status)}
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
            message={error ?? (status === 'invalid' ? 'The SSO callback does not contain valid credentials.' : null)}
            variant="error"
          />
          {status === 'invalid' ? (
            <Button asChild variant="outline">
              <Link to={routePath('login')}>Return to login</Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Please wait.</p>
          )}
        </div>
      )}
    </AuthCard>
  );
};

export default Index;
