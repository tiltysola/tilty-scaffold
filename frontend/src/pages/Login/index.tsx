import { type SubmitEventHandler, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useFormState } from '@/hooks/useFormState';
import { ApiError } from '@/lib/api';
import { fetchSsoConfig, getSsoStartUrl, isVerificationRequired, login, type SsoPublicConfig } from '@/lib/auth';
import { loginCredentialsSchema } from '@/lib/auth-validation';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

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
          setError(requestError.message);
        }
      });

    return () => {
      isActive = false;
    };
  }, [setError]);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError(null);

    const parsed = loginCredentialsSchema.safeParse(form);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Login credentials are invalid.');
      return;
    }

    const session = await run(() => login(parsed.data), 'Login could not be completed.');

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
      description="Log in with account credentials to access the dashboard."
      footer={
        <>
          <div className="flex gap-2">
            <span>Need an account?</span>
            <Link className="font-medium text-primary hover:underline" to={routePath('register')}>
              Create account
            </Link>
          </div>
          <Link className="font-medium text-primary hover:underline" to={routePath('forgotPassword')}>
            Password recovery
          </Link>
        </>
      }
      footerClassName="flex-col justify-center gap-2 text-sm text-muted-foreground"
      title="Log in"
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
                Log in with {provider.name}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>Alternative</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="identifier">Email or username</Label>
          <Input
            autoComplete="username"
            disabled={submitting}
            id="identifier"
            name="identifier"
            onChange={handleChange('identifier')}
            placeholder="name@example.com or username"
            value={form.identifier}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="current-password"
            disabled={submitting}
            id="password"
            name="password"
            onChange={handleChange('password')}
            placeholder="Enter your password"
            type="password"
            value={form.password}
          />
        </div>
        <FormMessage message={error} variant="error" />
        <Button className="w-full" disabled={submitting} type="submit">
          {submitting ? 'Logging in' : 'Log in'}
        </Button>
      </form>
    </AuthCard>
  );
};

export default Index;
