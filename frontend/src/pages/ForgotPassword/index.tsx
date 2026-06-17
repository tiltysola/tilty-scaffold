import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { useFormState } from '@/hooks/useFormState';
import { ApiError, getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, resetPassword, sendPasswordResetEmailVerification } from '@/lib/auth';
import { createPasswordFormSchema, emailSchema, verificationCodeSchema } from '@/lib/auth-validation';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import FormMessage from '@/components/FormMessage';

const passwordRecoveryUnavailableMessage = 'Password recovery is not available. Contact the site administrator.';
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
    let active = true;

    void fetchAuthConfig()
      .then((config) => {
        if (!active) {
          return;
        }

        setPasswordRecoveryEnabled(config.passwordRecoveryEnabled);
        if (!config.passwordRecoveryEnabled) {
          setPageNotice(passwordRecoveryUnavailableMessage);
        }
      })
      .catch((requestError) => {
        if (active) {
          setConfigError(getApiErrorMessage(requestError, 'Password recovery configuration could not be loaded.'));
        }
      })
      .finally(() => {
        if (active) {
          setConfigLoading(false);
        }
      });

    return () => {
      active = false;
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
    <main className="flex min-h-svh w-full items-center justify-center bg-muted px-4 py-10 text-foreground sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Password recovery</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
        <CardFooter className="justify-center gap-2 text-sm text-muted-foreground">
          <span>Remember your password?</span>
          <Link className="font-medium text-primary hover:underline" to="/login">
            Log in
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
};

function getPasswordRecoveryErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.code === 'EMAIL_VERIFICATION_DISABLED') {
    return passwordRecoveryUnavailableMessage;
  }

  return getApiErrorMessage(error, fallback);
}

export default Index;
