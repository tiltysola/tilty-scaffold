import { type SubmitEventHandler, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router-dom';

import { type z } from 'zod';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { useFormState } from '@/hooks/useFormState';
import { getApiErrorMessage } from '@/lib/api';
import { fetchAuthConfig, register, sendRegistrationEmailVerification } from '@/lib/auth';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import {
  createPasswordFormSchema,
  displayNameSchema,
  emailSchema,
  optionalVerificationCodeSchema,
  usernameSchema,
} from '@tilty/shared/validation';

import { AuthCard } from '@/components/AuthCard';
import FormMessage from '@/components/FormMessage';

type RegisterFormState = z.input<typeof registerSchema>;

const registerSchema = createPasswordFormSchema({
  username: usernameSchema,
  displayName: displayNameSchema,
  email: emailSchema,
  emailVerificationCode: optionalVerificationCodeSchema,
});

const Index = () => {
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const navigate = useNavigate();
  const intl = useIntl();
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
          setConfigError(
            getApiErrorMessage(requestError, intl.formatMessage({ id: 'auth.registration.config.load.failed' })),
          );
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
  }, [intl]);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    submitAction.clearError();
    emailVerification.clearMessages();

    const parsed = registerSchema.safeParse(form);

    if (!parsed.success) {
      submitAction.setError(
        intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'validation.account.registration.invalid' }),
      );
      return;
    }

    if (emailVerificationRequired && !parsed.data.emailVerificationCode) {
      submitAction.setError(intl.formatMessage({ id: 'auth.email.verification.code.required' }));
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
      intl.formatMessage({ id: 'auth.registration.failed' }),
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
      emailVerification.setError(
        intl.formatMessage({ id: parsed.error.issues[0]?.message ?? 'validation.email.invalid' }),
      );
      return;
    }

    await emailVerification.requestCode(parsed.data, intl.formatMessage({ id: 'auth.email.verification.send.failed' }));
  };

  return (
    <AuthCard
      description={intl.formatMessage({ id: 'auth.register.description' })}
      footer={
        <>
          <span>{intl.formatMessage({ id: 'auth.already.have.account' })}</span>
          <Link className="font-medium text-primary hover:underline" to={routePath('login')}>
            {intl.formatMessage({ id: 'auth.login' })}
          </Link>
        </>
      }
      footerClassName="justify-center gap-2 text-sm text-muted-foreground"
      title={intl.formatMessage({ id: 'auth.register.title' })}
    >
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="username">{intl.formatMessage({ id: 'auth.username' })}</Label>
          <Input
            autoComplete="username"
            disabled={submitting}
            id="username"
            name="username"
            onChange={handleChange('username')}
            placeholder={intl.formatMessage({ id: 'auth.username.placeholder' })}
            value={form.username}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="displayName">{intl.formatMessage({ id: 'auth.display.name' })}</Label>
          <Input
            autoComplete="name"
            disabled={submitting}
            id="displayName"
            name="displayName"
            onChange={handleChange('displayName')}
            placeholder={intl.formatMessage({ id: 'auth.display.name.placeholder' })}
            value={form.displayName}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">{intl.formatMessage({ id: 'auth.email' })}</Label>
          <div className="flex gap-2">
            <Input
              autoComplete="email"
              disabled={submitting || sendingCode}
              id="email"
              name="email"
              onChange={handleChange('email')}
              placeholder={intl.formatMessage({ id: 'auth.email.placeholder' })}
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
                {intl.formatMessage({ id: sendingCode ? 'common.sending' : 'common.send.code' })}
              </Button>
            ) : null}
          </div>
        </div>
        {emailVerificationRequired ? (
          <div className="grid gap-2">
            <Label htmlFor="emailVerificationCode">{intl.formatMessage({ id: 'auth.verification.code' })}</Label>
            <Input
              autoComplete="one-time-code"
              disabled={submitting}
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
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="password">{intl.formatMessage({ id: 'auth.password' })}</Label>
          <Input
            autoComplete="new-password"
            disabled={submitting}
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
            disabled={submitting}
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
        <Button className="w-full" disabled={configLoading || submitting} type="submit">
          {intl.formatMessage({
            id: submitting ? 'auth.processing' : configLoading ? 'common.loading' : 'auth.create.account',
          })}
        </Button>
      </form>
    </AuthCard>
  );
};

export default Index;
