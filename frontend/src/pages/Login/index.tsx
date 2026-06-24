import { type SubmitEventHandler, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { KeyRoundIcon, LinkIcon, UserPlusIcon } from 'lucide-react';
import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useFormState } from '@/hooks/useFormState';
import { ApiError } from '@/lib/api';
import {
  bindSsoAccount,
  completeSsoLogin,
  createSsoAccount,
  fetchSsoConfig,
  getSsoCallbackParams,
  getSsoStartUrl,
  login,
  type SsoPublicConfig,
} from '@/lib/auth';
import {
  createPasswordFormSchema,
  displayNameSchema,
  loginCredentialsSchema,
  usernameSchema,
} from '@/lib/auth-validation';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';
import { isSafeRelativePath } from '@tilty/shared/paths';

import FormMessage from '@/components/FormMessage';

const ssoCreateSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
});

type LoginFormState = z.input<typeof loginCredentialsSchema>;
type SsoCreateFormState = z.input<typeof ssoCreateSchema>;

const Index = () => {
  const [ssoBind, setSsoBind] = useState<{
    username: string;
    displayName: string;
    email: string;
    providerName: string;
    token: string;
    redirectPath: string;
  } | null>(null);
  const [ssoTab, setSsoTab] = useState<'create' | 'bind'>('create');
  const [ssoConfig, setSsoConfig] = useState<SsoPublicConfig>({
    enabled: false,
    loginEnabled: false,
    providers: [],
  });
  const handledSsoTokenRef = useRef<string | null>(null);
  const handledSsoBindTokenRef = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { error, pending: submitting, run, setError, setPending: setSubmitting } = useAsyncAction();
  const { form, handleChange } = useFormState<LoginFormState>({
    identifier: '',
    password: '',
  });
  const {
    form: ssoCreateForm,
    handleChange: handleSsoCreateChange,
    setForm: setSsoCreateForm,
  } = useFormState<SsoCreateFormState>({
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });
  const redirectPath = getRedirectPath(location.state);
  const ssoLoginProviders =
    ssoConfig.enabled && ssoConfig.loginEnabled ? ssoConfig.providers.filter((provider) => provider.loginEnabled) : [];

  useEffect(() => {
    let active = true;

    void fetchSsoConfig()
      .then((config) => {
        if (active) {
          setSsoConfig(config);
        }
      })
      .catch((requestError: unknown) => {
        if (!active) {
          return;
        }

        setSsoConfig({ enabled: false, loginEnabled: false, providers: [] });
        if (requestError instanceof ApiError && requestError.code === 'SETUP_RESTART_REQUIRED') {
          setError(requestError.message);
        }
      });

    return () => {
      active = false;
    };
  }, [setError]);

  useEffect(() => {
    const params = getSsoCallbackParams(location.hash);
    const token = params.get('sso_token');
    const bindToken = params.get('sso_bind_token');
    const profileBindResult = params.get('sso_profile_bind');

    if (profileBindResult === 'success') {
      navigate(getSafeRedirectPath(params.get('redirect')), { replace: true });
      return;
    }

    if (token && handledSsoTokenRef.current !== token) {
      handledSsoTokenRef.current = token;
      const nextRedirectPath = getSafeRedirectPath(params.get('redirect'));

      navigate(routePath('login'), { replace: true });
      setSsoBind(null);

      void run(() => completeSsoLogin(token), 'SSO authentication could not be completed.').then((session) => {
        if (!session) {
          return;
        }

        navigate(nextRedirectPath, { replace: true });
      });

      return;
    }

    if (!bindToken || handledSsoBindTokenRef.current === bindToken) {
      return;
    }

    handledSsoBindTokenRef.current = bindToken;
    const username = params.get('sso_username') ?? '';
    const displayName = params.get('sso_display_name') ?? '';
    const nextRedirectPath = getSafeRedirectPath(params.get('redirect'));

    setSsoBind({
      username,
      displayName,
      email: params.get('sso_email') ?? '',
      providerName: params.get('sso_provider_name') ?? 'SSO',
      token: bindToken,
      redirectPath: nextRedirectPath,
    });
    setSsoCreateForm((current) => ({
      ...current,
      displayName,
      username,
    }));
    setSsoTab('create');
    setError(null);
    setSubmitting(false);
    navigate(routePath('login'), { replace: true });
  }, [location.hash, location.search, navigate, run, setError, setSsoCreateForm, setSubmitting]);

  const handleSsoTabChange = (value: string) => {
    if (value !== 'create' && value !== 'bind') {
      return;
    }

    setSsoTab(value);
    setError(null);
  };

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
      navigate(redirectPath, { replace: true });
    }
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

    const session = await run(
      () =>
        bindSsoAccount({
          ...parsed.data,
          token: ssoBind.token,
        }),
      'SSO account binding could not be completed.',
    );

    if (session) {
      navigate(ssoBind.redirectPath, { replace: true });
    }
  };

  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-muted px-4 py-10 text-foreground sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{ssoBind ? 'Complete SSO authentication' : 'Log in'}</CardTitle>
          <CardDescription>
            {ssoBind
              ? `Select the account association method for ${ssoBind.providerName}.`
              : 'Log in with account credentials to access the dashboard.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ssoBind ? (
            <Tabs className="w-full" onValueChange={handleSsoTabChange} value={ssoTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">New account</TabsTrigger>
                <TabsTrigger value="bind">Existing account</TabsTrigger>
              </TabsList>
              <div className="mt-2">
                <FormMessage message={error} variant="error" />
              </div>
              <TabsContent className="mt-2" value="create">
                <form className="grid gap-4" onSubmit={handleCreateSsoAccount}>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-username">Username</Label>
                    <Input
                      autoComplete="username"
                      disabled={submitting}
                      id="sso-username"
                      name="username"
                      onChange={handleSsoCreateChange('username')}
                      placeholder="sso_user"
                      value={ssoCreateForm.username}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-display-name">Display name</Label>
                    <Input
                      autoComplete="name"
                      disabled={submitting}
                      id="sso-display-name"
                      name="displayName"
                      onChange={handleSsoCreateChange('displayName')}
                      placeholder="SSO User"
                      value={ssoCreateForm.displayName}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-email">Email</Label>
                    <Input
                      autoComplete="email"
                      id="sso-email"
                      name="email"
                      placeholder="name@example.com"
                      readOnly
                      type="email"
                      value={ssoBind.email}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-password">Password</Label>
                    <Input
                      autoComplete="new-password"
                      disabled={submitting}
                      id="sso-password"
                      name="password"
                      onChange={handleSsoCreateChange('password')}
                      placeholder="At least 8 characters"
                      type="password"
                      value={ssoCreateForm.password}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-confirm-password">Confirm password</Label>
                    <Input
                      autoComplete="new-password"
                      disabled={submitting}
                      id="sso-confirm-password"
                      name="confirmPassword"
                      onChange={handleSsoCreateChange('confirmPassword')}
                      placeholder="Repeat password"
                      type="password"
                      value={ssoCreateForm.confirmPassword}
                    />
                  </div>
                  <Button className="w-full" disabled={submitting} type="submit">
                    <UserPlusIcon />
                    {submitting ? 'Processing' : 'Create new account'}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent className="mt-2" value="bind">
                <form className="grid gap-4" onSubmit={handleBindSsoAccount}>
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
                  <Button className="w-full" disabled={submitting} type="submit" variant="outline">
                    <LinkIcon />
                    {submitting ? 'Processing' : 'Bind existing account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          ) : (
            <>
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
                        <SsoProviderIcon iconUrl={provider.iconUrl} name={provider.name} />
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
            </>
          )}
        </CardContent>
        {ssoBind ? null : (
          <CardFooter className="flex-col justify-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-2">
              <span>Need an account?</span>
              <Link className="font-medium text-primary hover:underline" to={routePath('register')}>
                Create account
              </Link>
            </div>
            <Link className="font-medium text-primary hover:underline" to={routePath('forgotPassword')}>
              Password recovery
            </Link>
          </CardFooter>
        )}
      </Card>
    </main>
  );
};

function SsoProviderIcon({ iconUrl, name }: { iconUrl?: string; name: string }) {
  return iconUrl ? (
    <img alt="" className="size-4 rounded-sm object-contain" referrerPolicy="no-referrer" src={iconUrl} />
  ) : (
    <KeyRoundIcon aria-label={name} />
  );
}

function getRedirectPath(state: unknown) {
  if (!state || typeof state !== 'object') {
    return routePath('dashboard');
  }

  const from = (state as { from?: unknown }).from;

  return getSafeRedirectPath(from);
}

function getSafeRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !isSafeRelativePath(value)) {
    return routePath('dashboard');
  }

  return value;
}

export default Index;
