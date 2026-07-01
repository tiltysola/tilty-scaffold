import { type SubmitEventHandler, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useFormState } from '@/hooks/useFormState';
import { ApiError, getApiErrorMessage } from '@/lib/api';
import { fetchSsoConfig, getSsoStartUrl, isVerificationRequired, login, type SsoPublicConfig } from '@/lib/auth';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { loginCredentialsSchema } from '@tilty/shared/validation';

import { AuthCard } from '@/components/AuthCard';
import FormMessage from '@/components/FormMessage';
import SsoProviderIcon from '@/components/SsoProviderIcon';

import { createVerificationParams, getRedirectPath } from './utils';

type LoginFormState = z.input<typeof loginCredentialsSchema>;

const Index = () => {
  const [ssoConfig, setSsoConfig] = useState<SsoPublicConfig>({
    enabled: false,
    loginEnabled: false,
    providers: [],
  });
  const location = useLocation();
  const navigate = useNavigate();
  const intl = useIntl();
  const { error, pending: submitting, run, setError } = useAsyncAction();
  const { form, handleChange } = useFormState<LoginFormState>({
    identifier: '',
    password: '',
  });
  const redirectPath = getRedirectPath(location.state);
  const ssoLoginProviders =
    ssoConfig.enabled && ssoConfig.loginEnabled ? ssoConfig.providers.filter((provider) => provider.loginEnabled) : [];

  useEffect(() => {
    let isActive = true;

    void fetchSsoConfig()
      .then((config) => {
        if (isActive) {
          setSsoConfig(config);
        }
      })
      .catch((requestError: unknown) => {
        if (!isActive) {
          return;
        }

        setSsoConfig({ enabled: false, loginEnabled: false, providers: [] });
        if (requestError instanceof ApiError && requestError.code === 'SETUP_RESTART_REQUIRED') {
          setError(getApiErrorMessage(requestError, intl.formatMessage({ id: 'api.error.SETUP_RESTART_REQUIRED' })));
        }
      });

    return () => {
      isActive = false;
    };
  }, [intl, setError]);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError(null);

    const parsed = loginCredentialsSchema.safeParse(form);

    if (!parsed.success) {
      setError(intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'validation.login.credentials.invalid' }));
      return;
    }

    const session = await run(() => login(parsed.data), intl.formatMessage({ id: 'auth.login.failed' }));

    if (session) {
      if (isVerificationRequired(session)) {
        navigate(
          `${routePath('verifySignIn')}?${createVerificationParams(
            session.verificationToken,
            redirectPath,
            session.defaultMethod,
            session.methods,
          )}`,
          { replace: true },
        );
        return;
      }

      navigate(redirectPath, { replace: true });
    }
  };

  return (
    <AuthCard
      description={intl.formatMessage({ id: 'auth.login.description' })}
      footer={
        <>
          <div className="flex gap-2">
            <span>{intl.formatMessage({ id: 'auth.need.account' })}</span>
            <Link className="font-medium text-primary hover:underline" to={routePath('register')}>
              {intl.formatMessage({ id: 'auth.create.account' })}
            </Link>
          </div>
          <Link className="font-medium text-primary hover:underline" to={routePath('forgotPassword')}>
            {intl.formatMessage({ id: 'auth.forgot.password.title' })}
          </Link>
        </>
      }
      footerClassName="flex-col justify-center gap-2 text-sm text-muted-foreground"
      title={intl.formatMessage({ id: 'auth.login' })}
    >
      {ssoLoginProviders.length > 0 ? (
        <div className="mb-4 grid gap-4">
          <div className="grid gap-2">
            {ssoLoginProviders.map((provider) => (
              <Button
                disabled={submitting}
                key={provider.id}
                onClick={() => window.location.assign(getSsoStartUrl(redirectPath, provider.id))}
                type="button"
                variant="outline"
              >
                <SsoProviderIcon iconUrl={provider.iconUrl} name={provider.name} size="compact" />
                {intl.formatMessage({ id: 'auth.login.with.provider' }, { name: provider.name })}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>{intl.formatMessage({ id: 'auth.alternative' })}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="identifier">{intl.formatMessage({ id: 'auth.email.or.username' })}</Label>
          <Input
            autoComplete="username"
            disabled={submitting}
            id="identifier"
            name="identifier"
            onChange={handleChange('identifier')}
            placeholder={intl.formatMessage({ id: 'auth.email.or.username.placeholder' })}
            value={form.identifier}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{intl.formatMessage({ id: 'auth.password' })}</Label>
          <Input
            autoComplete="current-password"
            disabled={submitting}
            id="password"
            name="password"
            onChange={handleChange('password')}
            placeholder={intl.formatMessage({ id: 'auth.password.placeholder' })}
            type="password"
            value={form.password}
          />
        </div>
        <FormMessage message={error} variant="error" />
        <Button className="w-full" disabled={submitting} type="submit">
          {intl.formatMessage({ id: submitting ? 'auth.processing' : 'auth.login' })}
        </Button>
      </form>
    </AuthCard>
  );
};

export default Index;
