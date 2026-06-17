import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { KeyRoundIcon, LinkIcon, UserPlusIcon } from 'lucide-react';
import { z } from 'zod';

import { getApiErrorMessage } from '@/lib/api';
import {
  bindSsoAccount,
  completeSsoLogin,
  createSsoAccount,
  fetchSsoConfig,
  getSsoStartUrl,
  login,
  type SsoPublicConfig,
} from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';

const loginSchema = z.object({
  email: z.string().trim().email('Provide a valid email address.'),
  password: z.string().min(8, 'Password must contain at least 8 characters.'),
});

const ssoCreateSchema = z.object({
  username: z.string().trim().min(2, 'Name must contain at least 2 characters.').max(32),
  password: z.string().min(8, 'Password must contain at least 8 characters.').max(128),
  confirmPassword: z.string().min(8, 'Confirm password.'),
});

type LoginFormState = z.input<typeof loginSchema>;
type SsoCreateFormState = z.input<typeof ssoCreateSchema>;

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const handledSsoTokenRef = useRef<string | null>(null);
  const handledSsoBindTokenRef = useRef<string | null>(null);
  const [form, setForm] = useState<LoginFormState>({
    email: '',
    password: '',
  });
  const [ssoCreateForm, setSsoCreateForm] = useState<SsoCreateFormState>({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [ssoBind, setSsoBind] = useState<{
    email: string;
    redirectPath: string;
    token: string;
    username: string;
  } | null>(null);
  const [ssoTab, setSsoTab] = useState<'create' | 'bind'>('create');
  const [ssoConfig, setSsoConfig] = useState<SsoPublicConfig>({ enabled: false });
  const [submitting, setSubmitting] = useState(false);
  const redirectPath = getRedirectPath(location.state);
  const ssoStartUrl = ssoConfig.enabled ? getSsoStartUrl(redirectPath) : null;

  useEffect(() => {
    let active = true;

    void fetchSsoConfig()
      .then((config) => {
        if (active) {
          setSsoConfig(config);
        }
      })
      .catch(() => {
        if (active) {
          setSsoConfig({ enabled: false });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('sso_token');
    const bindToken = params.get('sso_bind_token');

    if (token && handledSsoTokenRef.current !== token) {
      handledSsoTokenRef.current = token;
      const nextRedirectPath = getSafeRedirectPath(params.get('redirect'));

      navigate('/login', { replace: true });
      setSsoBind(null);
      setError(null);
      setSubmitting(true);

      void completeSsoLogin(token)
        .then(() => {
          navigate(nextRedirectPath, { replace: true });
        })
        .catch((requestError) => {
          setError(getApiErrorMessage(requestError, 'SSO authentication could not be completed.'));
          setSubmitting(false);
        });

      return;
    }

    if (!bindToken || handledSsoBindTokenRef.current === bindToken) {
      return;
    }

    handledSsoBindTokenRef.current = bindToken;
    const username = getDisplayValue(params.get('sso_username'));
    const nextRedirectPath = getSafeRedirectPath(params.get('redirect'));

    setSsoBind({
      email: getDisplayValue(params.get('sso_email')),
      redirectPath: nextRedirectPath,
      token: bindToken,
      username,
    });
    setSsoCreateForm((current) => ({
      ...current,
      username,
    }));
    setSsoTab('create');
    setError(null);
    setSubmitting(false);
    navigate('/login', { replace: true });
  }, [location.search, navigate]);

  const handleChange = (field: keyof LoginFormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleSsoCreateChange = (field: keyof SsoCreateFormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setSsoCreateForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleSsoTabChange = (value: string) => {
    if (value !== 'create' && value !== 'bind') {
      return;
    }

    setSsoTab(value);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse(form);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Login credentials are invalid.');
      return;
    }

    setSubmitting(true);

    try {
      await login(parsed.data);
      navigate(redirectPath, { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Login could not be completed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSsoAccount = async (event: FormEvent<HTMLFormElement>) => {
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

    if (parsed.data.password !== parsed.data.confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setSubmitting(true);

    try {
      await createSsoAccount({
        ...parsed.data,
        token: ssoBind.token,
      });
      navigate(ssoBind.redirectPath, { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'SSO account creation could not be completed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBindSsoAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ssoBind) {
      return;
    }

    setError(null);

    const parsed = loginSchema.safeParse(form);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Account credentials are invalid.');
      return;
    }

    setSubmitting(true);

    try {
      await bindSsoAccount({
        ...parsed.data,
        token: ssoBind.token,
      });
      navigate(ssoBind.redirectPath, { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'SSO account binding could not be completed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-muted px-4 py-10 text-foreground sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{ssoBind ? 'Complete SSO Authentication' : 'Login'}</CardTitle>
          <CardDescription>
            {ssoBind
              ? 'Select the account association method for this SSO identity.'
              : 'Log in with account credentials to access the dashboard.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ssoBind ? (
            <Tabs className="w-full" onValueChange={handleSsoTabChange} value={ssoTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">New Account</TabsTrigger>
                <TabsTrigger value="bind">Existing Account</TabsTrigger>
              </TabsList>
              {error ? (
                <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <TabsContent className="mt-2" value="create">
                <form className="grid gap-4" onSubmit={handleCreateSsoAccount}>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-username">Display Name</Label>
                    <Input
                      autoComplete="name"
                      disabled={submitting}
                      id="sso-username"
                      name="username"
                      onChange={handleSsoCreateChange('username')}
                      value={ssoCreateForm.username}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-email">Email</Label>
                    <Input
                      autoComplete="email"
                      id="sso-email"
                      name="email"
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
                      type="password"
                      value={ssoCreateForm.password}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-confirm-password">Confirm Password</Label>
                    <Input
                      autoComplete="new-password"
                      disabled={submitting}
                      id="sso-confirm-password"
                      name="confirmPassword"
                      onChange={handleSsoCreateChange('confirmPassword')}
                      type="password"
                      value={ssoCreateForm.confirmPassword}
                    />
                  </div>
                  <Button className="w-full" disabled={submitting} type="submit">
                    <UserPlusIcon />
                    {submitting ? 'Processing' : 'Create New Account'}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent className="mt-2" value="bind">
                <form className="grid gap-4" onSubmit={handleBindSsoAccount}>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      autoComplete="email"
                      disabled={submitting}
                      id="email"
                      name="email"
                      onChange={handleChange('email')}
                      type="email"
                      value={form.email}
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
                      type="password"
                      value={form.password}
                    />
                  </div>
                  <Button className="w-full" disabled={submitting} type="submit" variant="outline">
                    <LinkIcon />
                    {submitting ? 'Processing' : 'Bind Existing Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          ) : (
            <>
              {ssoStartUrl ? (
                <div className="mb-4 grid gap-4">
                  <Button disabled={submitting} onClick={() => window.location.assign(ssoStartUrl)} type="button" variant="outline">
                    <KeyRoundIcon />
                    Log In with SSO
                  </Button>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="h-px flex-1 bg-border" />
                    <span>Alternative</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </div>
              ) : null}
              <form className="grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    autoComplete="email"
                    disabled={submitting}
                    id="email"
                    name="email"
                    onChange={handleChange('email')}
                    type="email"
                    value={form.email}
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
                    type="password"
                    value={form.password}
                  />
                </div>
                {error ? (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button className="w-full" disabled={submitting} type="submit">
                  {submitting ? 'Logging In' : 'Log In'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
        {ssoBind ? null : (
          <CardFooter className="flex-col justify-center gap-2 text-sm text-muted-foreground">
            <div className="flex gap-2">
              <span>Need an account?</span>
              <Link className="font-medium text-primary hover:underline" to="/register">
                Create Account
              </Link>
            </div>
            <Link className="font-medium text-primary hover:underline" to="/forgot-password">
              Password Recovery
            </Link>
          </CardFooter>
        )}
      </Card>
    </main>
  );
};

function getRedirectPath(state: unknown) {
  if (!state || typeof state !== 'object') {
    return '/dashboard';
  }

  const from = (state as { from?: unknown }).from;

  return getSafeRedirectPath(from);
}

function getSafeRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !isSafeRedirectPath(value)) {
    return '/dashboard';
  }

  return value;
}

function isSafeRedirectPath(value: string) {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

function getDisplayValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export default Index;
