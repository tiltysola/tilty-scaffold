import { type SubmitEventHandler, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';

import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { useFormState } from '@/hooks/useFormState';
import { getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, resetPassword, sendPasswordResetEmailVerification } from '@/lib/auth';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { createPasswordFormSchema, emailSchema, verificationCodeSchema } from '@tilty/shared/validation';

import { AuthCard } from '@/components/AuthCard';
import FormMessage from '@/components/FormMessage';

type ResetPasswordFormState = z.input<typeof resetPasswordSchema>;

const resetPasswordSchema = createPasswordFormSchema({
  email: emailSchema,
  emailVerificationCode: verificationCodeSchema,
});

const Index = () => {
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [passwordRecoveryEnabled, setPasswordRecoveryEnabled] = useState(false);
  const intl = useIntl();
  const submitAction = useAsyncAction();
  const emailVerification = useEmailVerification({
    sendCode: sendPasswordResetEmailVerification,
  });
  const { form, handleChange, setForm } = useFormState<ResetPasswordFormState>({
    email: '',
    emailVerificationCode: '',
    password: '',
    confirmPassword: '',
  });
  const passwordRecoveryUnavailableMessage = intl.formatMessage({
    id: 'auth.forgot.password.recovery.unavailable',
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
          setConfigError(
            getApiErrorMessage(requestError, intl.formatMessage({ id: 'auth.password.recovery.config.load.failed' })),
          );
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
  }, [intl, passwordRecoveryUnavailableMessage]);

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
      emailVerification.setError(
        intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'validation.email.invalid' }),
      );
      return;
    }

    await emailVerification.requestCode(parsed.data, intl.formatMessage({ id: 'auth.email.verification.send.failed' }));
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
      submitAction.setError(
        intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'validation.password.reset.invalid' }),
      );
      return;
    }

    const result = await submitAction.run(
      () => resetPassword(parsed.data),
      intl.formatMessage({ id: 'auth.reset.password.failed' }),
    );

    if (result) {
      setForm((current) => ({
        ...current,
        emailVerificationCode: '',
        password: '',
        confirmPassword: '',
      }));
      setPageNotice(intl.formatMessage({ id: 'auth.forgot.password.reset.complete' }));
    }
  };

  return (
    <AuthCard
      description={intl.formatMessage({ id: 'auth.forgot.password.description' })}
      footer={
        <>
          <span>{intl.formatMessage({ id: 'auth.remember.password' })}</span>
          <Link className="font-medium text-primary hover:underline" to={routePath('login')}>
            {intl.formatMessage({ id: 'auth.login' })}
          </Link>
        </>
      }
      footerClassName="justify-center gap-2 text-sm text-muted-foreground"
      title={intl.formatMessage({ id: 'auth.forgot.password.title' })}
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="email">{intl.formatMessage({ id: 'auth.email' })}</Label>
          <div className="flex gap-2">
            <Input
              autoComplete="email"
              disabled={configLoading || submitting || sendingCode}
              id="email"
              name="email"
              onChange={handleChange('email')}
              placeholder={intl.formatMessage({ id: 'auth.email.placeholder' })}
              type="email"
              value={form.email}
            />
            <Button
              disabled={configLoading || submitting || sendingCode || !passwordRecoveryEnabled}
              onClick={handleSendCode}
              type="button"
              variant="outline"
            >
              {intl.formatMessage({ id: sendingCode ? 'common.sending' : 'common.send.code' })}
            </Button>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="emailVerificationCode">{intl.formatMessage({ id: 'auth.verification.code' })}</Label>
          <Input
            autoComplete="one-time-code"
            disabled={configLoading || submitting || !passwordRecoveryEnabled}
            id="emailVerificationCode"
            inputMode="numeric"
            maxLength={6}
            name="emailVerificationCode"
            onChange={handleChange('emailVerificationCode')}
            pattern="[0-9]{6}"
            placeholder={intl.formatMessage({ id: 'auth.verification.code.placeholder' })}
            value={form.emailVerificationCode}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">{intl.formatMessage({ id: 'auth.password.new' })}</Label>
          <Input
            autoComplete="new-password"
            disabled={configLoading || submitting || !passwordRecoveryEnabled}
            id="password"
            name="password"
            onChange={handleChange('password')}
            placeholder={intl.formatMessage({ id: 'auth.password.new.placeholder' })}
            type="password"
            value={form.password}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confirmPassword">{intl.formatMessage({ id: 'auth.password.confirm' })}</Label>
          <Input
            autoComplete="new-password"
            disabled={configLoading || submitting || !passwordRecoveryEnabled}
            id="confirmPassword"
            name="confirmPassword"
            onChange={handleChange('confirmPassword')}
            placeholder={intl.formatMessage({ id: 'auth.password.confirm.placeholder' })}
            type="password"
            value={form.confirmPassword}
          />
        </div>
        <FormMessage message={error} variant="error" />
        <FormMessage message={notice} variant="notice" />
        <Button className="w-full" disabled={configLoading || submitting || !passwordRecoveryEnabled} type="submit">
          {intl.formatMessage({
            id: submitting ? 'auth.resetting.password' : configLoading ? 'common.loading' : 'auth.reset.password',
          })}
        </Button>
      </form>
    </AuthCard>
  );
};

export default Index;
