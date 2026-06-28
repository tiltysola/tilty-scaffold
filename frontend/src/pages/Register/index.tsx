import { type SubmitEventHandler, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { useFormState } from '@/hooks/useFormState';
import { getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, register, sendRegistrationEmailVerification } from '@/lib/auth';
import {
  createPasswordFormSchema,
  displayNameSchema,
  emailSchema,
  optionalVerificationCodeSchema,
  usernameSchema,
} from '@/lib/auth-validation';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import { AuthCard } from '@/components/AuthCard';
import FormMessage from '@/components/FormMessage';

const registerSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
  email: emailSchema,
  emailVerificationCode: optionalVerificationCodeSchema,
});

type RegisterFormState = z.input<typeof registerSchema>;

const Index = () => {
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const navigate = useNavigate();
  const submitAction = useAsyncAction();
  const emailVerification = useEmailVerification({
    sendCode: sendRegistrationEmailVerification,
  });
  const { form, handleChange } = useFormState<RegisterFormState>({
    username: '',
    displayName: '',
    email: '',
    emailVerificationCode: '',
    password: '',
    confirmPassword: '',
  });
  const error = submitAction.error ?? emailVerification.error ?? configError;
  const notice = emailVerification.notice;
  const sendingCode = emailVerification.sending;
  const submitting = submitAction.pending;

  useEffect(() => {
    let isActive = true;

    const loadConfig = async () => {
      try {
        const config = await fetchAuthConfig();

        if (isActive) {
          setEmailVerificationRequired(config.registrationEmailVerificationRequired);
        }
      } catch (requestError) {
        if (isActive) {
          setConfigError(getApiErrorMessage(requestError, 'Registration configuration could not be loaded.'));
        }
      } finally {
        if (isActive) {
          setConfigLoading(false);
        }
      }
    };

    void loadConfig();

    return () => {
      isActive = false;
    };
  }, []);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    submitAction.clearError();
    emailVerification.clearMessages();

    const parsed = registerSchema.safeParse(form);

    if (!parsed.success) {
      submitAction.setError(parsed.error.issues[0]?.message ?? 'Account registration details are invalid.');
      return;
    }

    if (emailVerificationRequired && !parsed.data.emailVerificationCode) {
      submitAction.setError('Email verification code is required.');
      return;
    }

    const session = await submitAction.run(
      () =>
        register({
          username: parsed.data.username,
          displayName: parsed.data.displayName,
          email: parsed.data.email,
          emailVerificationCode: emailVerificationRequired ? parsed.data.emailVerificationCode : undefined,
          password: parsed.data.password,
          confirmPassword: parsed.data.confirmPassword,
        }),
      'Account creation could not be completed.',
    );

    if (session) {
      navigate(routePath('dashboard'), { replace: true });
    }
  };

  const handleSendEmailVerification = async () => {
    submitAction.clearError();
    emailVerification.clearMessages();

    const parsed = emailSchema.safeParse(form.email);

    if (!parsed.success) {
      emailVerification.setError(parsed.error.issues[0]?.message ?? 'Provide a valid email address.');
      return;
    }

    await emailVerification.requestCode(parsed.data, 'Verification code could not be sent.');
  };

  return (
    <AuthCard
      description="Register an account to access the dashboard."
      footer={
        <>
          <span>Already have an account?</span>
          <Link className="font-medium text-primary hover:underline" to={routePath('login')}>
            Log in
          </Link>
        </>
      }
      footerClassName="justify-center gap-2 text-sm text-muted-foreground"
      title="Account registration"
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            autoComplete="username"
            disabled={submitting}
            id="username"
            name="username"
            onChange={handleChange('username')}
            placeholder="alex_chen"
            value={form.username}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            autoComplete="name"
            disabled={submitting}
            id="displayName"
            name="displayName"
            onChange={handleChange('displayName')}
            placeholder="Alex Chen"
            value={form.displayName}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <div className="flex gap-2">
            <Input
              autoComplete="email"
              disabled={submitting || sendingCode}
              id="email"
              name="email"
              onChange={handleChange('email')}
              placeholder="alex@example.com"
              type="email"
              value={form.email}
            />
            {emailVerificationRequired ? (
              <Button
                disabled={configLoading || submitting || sendingCode}
                onClick={handleSendEmailVerification}
                type="button"
                variant="outline"
              >
                {sendingCode ? 'Sending' : 'Send code'}
              </Button>
            ) : null}
          </div>
        </div>
        {emailVerificationRequired ? (
          <div className="grid gap-2">
            <Label htmlFor="emailVerificationCode">Verification code</Label>
            <Input
              autoComplete="one-time-code"
              disabled={submitting}
              id="emailVerificationCode"
              inputMode="numeric"
              maxLength={6}
              name="emailVerificationCode"
              onChange={handleChange('emailVerificationCode')}
              pattern="[0-9]{6}"
              placeholder="000000"
              value={form.emailVerificationCode}
            />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="new-password"
            disabled={submitting}
            id="password"
            name="password"
            onChange={handleChange('password')}
            placeholder="At least 8 characters"
            type="password"
            value={form.password}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            autoComplete="new-password"
            disabled={submitting}
            id="confirmPassword"
            name="confirmPassword"
            onChange={handleChange('confirmPassword')}
            placeholder="Repeat password"
            type="password"
            value={form.confirmPassword}
          />
        </div>
        <FormMessage message={error} variant="error" />
        <FormMessage message={notice} variant="notice" />
        <Button className="w-full" disabled={configLoading || submitting} type="submit">
          {submitting ? 'Creating account' : configLoading ? 'Loading' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  );
};

export default Index;
