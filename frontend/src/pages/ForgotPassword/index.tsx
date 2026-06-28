import { type SubmitEventHandler, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { useFormState } from '@/hooks/useFormState';
import { getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, resetPassword, sendPasswordResetEmailVerification } from '@/lib/auth';
import { createPasswordFormSchema, emailSchema, verificationCodeSchema } from '@/lib/auth-validation';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import { AuthCard } from '@/components/AuthCard';
import FormMessage from '@/components/FormMessage';

import { getPasswordRecoveryErrorMessage, passwordRecoveryUnavailableMessage } from './utils';

const resetPasswordSchema = createPasswordFormSchema({
  email: emailSchema,
  emailVerificationCode: verificationCodeSchema,
});

type ResetPasswordFormState = z.input<typeof resetPasswordSchema>;

const Index = () => {
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [passwordRecoveryEnabled, setPasswordRecoveryEnabled] = useState(false);
  const submitAction = useAsyncAction(getPasswordRecoveryErrorMessage);
  const emailVerification = useEmailVerification({
    getErrorMessage: getPasswordRecoveryErrorMessage,
    sendCode: sendPasswordResetEmailVerification,
  });
  const { form, handleChange, setForm } = useFormState<ResetPasswordFormState>({
    email: '',
    emailVerificationCode: '',
    password: '',
    confirmPassword: '',
  });
  const error = submitAction.error ?? emailVerification.error ?? configError;
  const notice = pageNotice ?? emailVerification.notice;
  const sendingCode = emailVerification.sending;
  const submitting = submitAction.pending;

  useEffect(() => {
    let isActive = true;

    void fetchAuthConfig()
      .then((config) => {
        if (!isActive) {
          return;
        }

        setPasswordRecoveryEnabled(config.passwordRecoveryEnabled);
        if (!config.passwordRecoveryEnabled) {
          setPageNotice(passwordRecoveryUnavailableMessage);
        }
      })
      .catch((requestError) => {
        if (isActive) {
          setConfigError(getApiErrorMessage(requestError, 'Password recovery configuration could not be loaded.'));
        }
      })
      .finally(() => {
        if (isActive) {
          setConfigLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleSendCode = async () => {
    submitAction.clearError();
    emailVerification.clearMessages();
    setPageNotice(null);

    if (!passwordRecoveryEnabled) {
      setPageNotice(passwordRecoveryUnavailableMessage);
      return;
    }

    const parsed = emailSchema.safeParse(form.email);

    if (!parsed.success) {
      emailVerification.setError(parsed.error.issues[0]?.message ?? 'Provide a valid email address.');
      return;
    }

    await emailVerification.requestCode(parsed.data, 'Verification code could not be sent.');
  };

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    submitAction.clearError();
    emailVerification.clearMessages();
    setPageNotice(null);

    if (!passwordRecoveryEnabled) {
      setPageNotice(passwordRecoveryUnavailableMessage);
      return;
    }

    const parsed = resetPasswordSchema.safeParse(form);

    if (!parsed.success) {
      submitAction.setError(parsed.error.issues[0]?.message ?? 'Password reset details are invalid.');
      return;
    }

    const result = await submitAction.run(() => resetPassword(parsed.data), 'Password reset could not be completed.');

    if (result) {
      setForm((current) => ({
        ...current,
        emailVerificationCode: '',
        password: '',
        confirmPassword: '',
      }));
      setPageNotice('Password has been reset. Log in with the new password.');
    }
  };

  return (
    <AuthCard
      description="Reset your account password with an email verification code."
      footer={
        <>
          <span>Remember your password?</span>
          <Link className="font-medium text-primary hover:underline" to={routePath('login')}>
            Log in
          </Link>
        </>
      }
      footerClassName="justify-center gap-2 text-sm text-muted-foreground"
      title="Password recovery"
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <div className="flex gap-2">
            <Input
              autoComplete="email"
              disabled={configLoading || submitting || sendingCode}
              id="email"
              name="email"
              onChange={handleChange('email')}
              placeholder="alex@example.com"
              type="email"
              value={form.email}
            />
            <Button
              disabled={configLoading || submitting || sendingCode || !passwordRecoveryEnabled}
              onClick={handleSendCode}
              type="button"
              variant="outline"
            >
              {sendingCode ? 'Sending' : 'Send code'}
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="emailVerificationCode">Verification code</Label>
          <Input
            autoComplete="one-time-code"
            disabled={configLoading || submitting || !passwordRecoveryEnabled}
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
        <div className="grid gap-2">
          <Label htmlFor="password">New password</Label>
          <Input
            autoComplete="new-password"
            disabled={configLoading || submitting || !passwordRecoveryEnabled}
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
            disabled={configLoading || submitting || !passwordRecoveryEnabled}
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
        <Button className="w-full" disabled={configLoading || submitting || !passwordRecoveryEnabled} type="submit">
          {submitting ? 'Resetting password' : configLoading ? 'Loading' : 'Reset password'}
        </Button>
      </form>
    </AuthCard>
  );
};

export default Index;
