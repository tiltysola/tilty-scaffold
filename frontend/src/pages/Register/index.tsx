import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { z } from 'zod';

import { getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, register, sendRegistrationEmailVerification } from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shadcn/components/ui/card';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

const emailSchema = z.string().trim().email('Provide a valid email address.');
const registerSchema = z.object({
  username: z.string().trim().min(2, 'Name must contain at least 2 characters.').max(32),
  email: emailSchema,
  password: z.string().min(8, 'Password must contain at least 8 characters.').max(128),
  confirmPassword: z.string().min(8, 'Confirm password.'),
  emailVerificationCode: z.string().trim(),
});

type RegisterFormState = z.input<typeof registerSchema>;

const Index = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterFormState>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    emailVerificationCode: '',
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    const loadConfig = async () => {
      try {
        const config = await fetchAuthConfig();

        if (active) {
          setEmailVerificationRequired(config.registrationEmailVerificationRequired);
        }
      } catch (requestError) {
        if (active) {
          setError(getApiErrorMessage(requestError, 'Registration configuration could not be loaded.'));
        }
      } finally {
        if (active) {
          setConfigLoading(false);
        }
      }
    };

    void loadConfig();

    return () => {
      active = false;
    };
  }, []);

  const handleChange = (field: keyof RegisterFormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const parsed = registerSchema.safeParse(form);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Account registration details are invalid.');
      return;
    }

    if (parsed.data.password !== parsed.data.confirmPassword) {
      setError('Password confirmation does not match.');
      return;
    }

    if (emailVerificationRequired && !parsed.data.emailVerificationCode) {
      setError('Email verification code is required.');
      return;
    }

    setSubmitting(true);

    try {
      await register({
        email: parsed.data.email,
        emailVerificationCode: emailVerificationRequired ? parsed.data.emailVerificationCode : undefined,
        password: parsed.data.password,
        confirmPassword: parsed.data.confirmPassword,
        username: parsed.data.username,
      });
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Account creation could not be completed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendEmailVerification = async () => {
    setError(null);
    setNotice(null);

    const parsed = emailSchema.safeParse(form.email);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Provide a valid email address.');
      return;
    }

    setSendingCode(true);

    try {
      const result = await sendRegistrationEmailVerification({
        email: parsed.data,
      });
      const expiresInMinutes = Math.ceil(result.expiresInSeconds / 60);

      setNotice(`Verification code sent. It expires in ${expiresInMinutes} minutes.`);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Verification code could not be sent.'));
    } finally {
      setSendingCode(false);
    }
  };

  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-muted px-4 py-10 text-foreground sm:px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Account Registration</CardTitle>
          <CardDescription>Register an account to access the dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="username">Display Name</Label>
              <Input
                autoComplete="name"
                disabled={submitting}
                id="username"
                name="username"
                onChange={handleChange('username')}
                value={form.username}
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
                    {sendingCode ? 'Sending' : 'Send Code'}
                  </Button>
                ) : null}
              </div>
            </div>
            {emailVerificationRequired ? (
              <div className="grid gap-2">
                <Label htmlFor="emailVerificationCode">Verification Code</Label>
                <Input
                  autoComplete="one-time-code"
                  disabled={submitting}
                  id="emailVerificationCode"
                  inputMode="numeric"
                  maxLength={6}
                  name="emailVerificationCode"
                  onChange={handleChange('emailVerificationCode')}
                  pattern="[0-9]{6}"
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
            <Button className="w-full" disabled={configLoading || submitting} type="submit">
              {submitting ? 'Creating Account' : configLoading ? 'Loading' : 'Create Account'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center gap-2 text-sm text-muted-foreground">
          <span>Already have an account?</span>
          <Link className="font-medium text-primary hover:underline" to="/login">
            Log In
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
};

export default Index;
