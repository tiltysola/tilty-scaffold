import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { z } from 'zod';

import { ApiError, getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, resetPassword, sendPasswordResetEmailVerification } from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

const passwordRecoveryUnavailableMessage = 'Password recovery is not available. Contact the site administrator.';
const emailSchema = z.string().trim().email('Provide a valid email address.');
const resetPasswordSchema = z.object({
  email: emailSchema,
  emailVerificationCode: z.string().trim().regex(/^\d{6}$/, 'Provide the 6-digit verification code.'),
  password: z.string().min(8, 'Password must contain at least 8 characters.').max(128),
  confirmPassword: z.string().min(8, 'Confirm password.'),
});

type ResetPasswordFormState = z.input<typeof resetPasswordSchema>;

const Index = () => {
  const [form, setForm] = useState<ResetPasswordFormState>({
    email: '',
    emailVerificationCode: '',
    password: '',
    confirmPassword: '',
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [passwordRecoveryEnabled, setPasswordRecoveryEnabled] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchAuthConfig()
      .then((config) => {
        if (!active) {
          return;
        }

        setPasswordRecoveryEnabled(config.passwordRecoveryEnabled);
        if (!config.passwordRecoveryEnabled) {
          setNotice(passwordRecoveryUnavailableMessage);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getApiErrorMessage(requestError, 'Password recovery configuration could not be loaded.'));
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

  const handleChange = (field: keyof ResetPasswordFormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleSendCode = async () => {
    setError(null);
    setNotice(null);

    if (!passwordRecoveryEnabled) {
      setNotice(passwordRecoveryUnavailableMessage);
      return;
    }

    const parsed = emailSchema.safeParse(form.email);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Provide a valid email address.');
      return;
    }

    setSendingCode(true);

    try {
      const result = await sendPasswordResetEmailVerification({
        email: parsed.data,
      });
      const expiresInMinutes = Math.ceil(result.expiresInSeconds / 60);

      setNotice(`Verification code sent. It expires in ${expiresInMinutes} minutes.`);
    } catch (requestError) {
      setError(getPasswordRecoveryErrorMessage(requestError, 'Verification code could not be sent.'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!passwordRecoveryEnabled) {
      setNotice(passwordRecoveryUnavailableMessage);
      return;
    }

    const parsed = resetPasswordSchema.safeParse(form);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Password reset details are invalid.');
      return;
    }

    if (parsed.data.password !== parsed.data.confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    setSubmitting(true);

    try {
      await resetPassword(parsed.data);
      setForm((current) => ({
        ...current,
        emailVerificationCode: '',
        password: '',
        confirmPassword: '',
      }));
      setNotice('Password has been reset. Log in with the new password.');
    } catch (requestError) {
      setError(getPasswordRecoveryErrorMessage(requestError, 'Password reset could not be completed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-muted px-4 py-10 text-foreground sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Password Recovery</CardTitle>
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
                  {sendingCode ? 'Sending' : 'Send Code'}
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emailVerificationCode">Verification Code</Label>
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
              <Label htmlFor="password">New Password</Label>
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
              <Label htmlFor="confirmPassword">Confirm Password</Label>
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
            {error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                {notice}
              </p>
            ) : null}
            <Button className="w-full" disabled={configLoading || submitting || !passwordRecoveryEnabled} type="submit">
              {submitting ? 'Resetting Password' : configLoading ? 'Loading' : 'Reset Password'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center gap-2 text-sm text-muted-foreground">
          <span>Remember your password?</span>
          <Link className="font-medium text-primary hover:underline" to="/login">
            Log In
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
