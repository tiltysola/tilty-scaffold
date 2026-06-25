import { type SubmitEventHandler, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { LinkIcon, UserPlusIcon } from 'lucide-react';
import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useFormState } from '@/hooks/useFormState';
import { bindSsoAccount, completeSsoLogin, createSsoAccount, getSsoCallbackParams } from '@/lib/auth';
import {
  createPasswordFormSchema,
  displayNameSchema,
  loginCredentialsSchema,
  usernameSchema,
} from '@/lib/auth-validation';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';
import { isSafeRelativePath } from '@tilty/shared/paths';

import FormMessage from '@/components/FormMessage';

const ssoCreateSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
});

type LoginFormState = z.input<typeof loginCredentialsSchema>;
type SsoCallbackStatus = 'bind' | 'invalid' | 'processing';
type SsoCreateFormState = z.input<typeof ssoCreateSchema>;

interface SsoBindState {
  username: string;
  displayName: string;
  email: string;
  providerName: string;
  redirectPath: string;
  token: string;
}

type ParsedSsoCallback =
  | {
      type: 'session';
      redirectPath: string;
      token: string;
    }
  | {
      type: 'bind';
      ssoBind: SsoBindState;
    }
  | {
      type: 'profileBind';
      redirectPath: string;
    }
  | {
      type: 'invalid';
    };

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
      <Card className={status === 'bind' ? 'w-full max-w-2xl' : 'w-full max-w-md'}>
        <CardHeader>
          <CardTitle>{getPageTitle(status)}</CardTitle>
          <CardDescription>{getPageDescription(status, ssoBind)}</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'bind' && ssoBind ? (
            <Tabs className="w-full" onValueChange={handleSsoTabChange} value={ssoTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">New account</TabsTrigger>
                <TabsTrigger value="bind">Existing account</TabsTrigger>
              </TabsList>
              <div className="mt-2">
                <FormMessage message={error} variant="error" />
              </div>
              <TabsContent className="mt-4" value="create">
                <form className="grid gap-4" onSubmit={handleCreateSsoAccount}>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-callback-username">Username</Label>
                    <Input
                      autoComplete="username"
                      disabled={submitting}
                      id="sso-callback-username"
                      name="username"
                      onChange={handleSsoCreateChange('username')}
                      placeholder="sso_user"
                      value={ssoCreateForm.username}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-callback-display-name">Display name</Label>
                    <Input
                      autoComplete="name"
                      disabled={submitting}
                      id="sso-callback-display-name"
                      name="displayName"
                      onChange={handleSsoCreateChange('displayName')}
                      placeholder="SSO User"
                      value={ssoCreateForm.displayName}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-callback-email">Email</Label>
                    <Input
                      autoComplete="email"
                      id="sso-callback-email"
                      name="email"
                      placeholder="name@example.com"
                      readOnly
                      type="email"
                      value={ssoBind.email}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-callback-password">Password</Label>
                    <Input
                      autoComplete="new-password"
                      disabled={submitting}
                      id="sso-callback-password"
                      name="password"
                      onChange={handleSsoCreateChange('password')}
                      placeholder="At least 8 characters"
                      type="password"
                      value={ssoCreateForm.password}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-callback-confirm-password">Confirm password</Label>
                    <Input
                      autoComplete="new-password"
                      disabled={submitting}
                      id="sso-callback-confirm-password"
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
              <TabsContent className="mt-4" value="bind">
                <form className="grid gap-4" onSubmit={handleBindSsoAccount}>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-callback-bind-identifier">Email or username</Label>
                    <Input
                      autoComplete="username"
                      disabled={submitting}
                      id="sso-callback-bind-identifier"
                      name="identifier"
                      onChange={handleChange('identifier')}
                      placeholder="name@example.com or username"
                      value={form.identifier}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sso-callback-bind-password">Password</Label>
                    <Input
                      autoComplete="current-password"
                      disabled={submitting}
                      id="sso-callback-bind-password"
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
            <div className="flex flex-col items-center gap-4 text-center">
              {status === 'processing' ? <Spinner className="size-6 text-muted-foreground" /> : null}
              <FormMessage
                message={
                  error ?? (status === 'invalid' ? 'The SSO callback does not contain valid credentials.' : null)
                }
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
        </CardContent>
      </Card>
    </main>
  );
};

function getPageTitle(status: SsoCallbackStatus) {
  if (status === 'bind') {
    return 'Complete SSO authentication';
  }

  return status === 'invalid' ? 'SSO authentication failed' : 'Completing SSO authentication';
}

function getPageDescription(status: SsoCallbackStatus, ssoBind: SsoBindState | null) {
  if (status === 'bind' && ssoBind) {
    return `Select the account association method for ${ssoBind.providerName}.`;
  }

  if (status === 'invalid') {
    return 'Return to the login page and start SSO again.';
  }

  return 'Restoring your session.';
}

function parseSsoCallback(hash: string): ParsedSsoCallback {
  if (!hash) {
    return {
      type: 'invalid',
    };
  }

  const params = getSsoCallbackParams(hash);
  const token = params.get('sso_token');
  const bindToken = params.get('sso_bind_token');

  if (params.get('sso_profile_bind') === 'success') {
    return {
      type: 'profileBind',
      redirectPath: getSafeRedirectPath(params.get('redirect')),
    };
  }

  if (token) {
    return {
      type: 'session',
      redirectPath: getSafeRedirectPath(params.get('redirect')),
      token,
    };
  }

  if (bindToken) {
    return {
      type: 'bind',
      ssoBind: {
        username: params.get('sso_username') ?? '',
        displayName: params.get('sso_display_name') ?? '',
        email: params.get('sso_email') ?? '',
        providerName: params.get('sso_provider_name') ?? 'SSO',
        redirectPath: getSafeRedirectPath(params.get('redirect')),
        token: bindToken,
      },
    };
  }

  return {
    type: 'invalid',
  };
}

function getInitialCallbackHash() {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

function clearCallbackFragment() {
  window.history.replaceState(null, '', routePath('ssoCallback'));
}

function getSafeRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !isSafeRelativePath(value)) {
    return routePath('dashboard');
  }

  return value;
}

function withProfileBindResult(path: string) {
  return `${path.split('#')[0]}#sso_profile_bind=success`;
}

export default Index;
