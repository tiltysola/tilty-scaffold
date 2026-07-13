import { type ChangeEvent, type SubmitEventHandler, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { AlertTriangleIcon, SaveIcon, ShieldAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useVerificationGate, type VerificationGateSubmitInput } from '@/hooks/useVerificationGate';
import { ApiError, getApiErrorMessage } from '@/lib/api';
import { generateSetupSecret, type SetupEnvironment } from '@/lib/setup';
import { fetchSystemSettings, updateSystemSettings } from '@/lib/system-settings';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Tabs, TabsContent } from '@/shadcn/components/ui/tabs';
import { AuthVerificationPurpose } from '@tilty/shared/auth';

import { AppEmptyState } from '@/components/AppEmptyState';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { IdentityVerificationDialog } from '@/components/IdentityVerification';
import { ConfigurationReview, EnvironmentStep } from '@/components/SetupConfiguration';
import { formatSetupStepTitle } from '@/components/SetupConfiguration/utils';

import { SettingsStepNav } from './components/SettingsStepNav';
import { hasSettingsFields, systemSettingsSteps } from './utils';

type SystemSettingsVerificationIntent = 'load' | 'save';

const Index = () => {
  const [activeStepId, setActiveStepId] = useState(systemSettingsSteps[0]?.id ?? 'runtime');
  const [dirty, setDirty] = useState(false);
  const [environment, setEnvironment] = useState<SetupEnvironment | null>(null);
  const [environmentFileLoaded, setEnvironmentFileLoaded] = useState(false);
  const [accessVerified, setAccessVerified] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingVerificationIntent, setPendingVerificationIntent] = useState<SystemSettingsVerificationIntent | null>(
    null,
  );
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const lastErrorToastRef = useRef<string | null>(null);
  const intl = useIntl();
  const action = useAsyncAction();
  const {
    clearError: clearVerificationError,
    confirmChallenge,
    dismissChallenge,
    error: verificationError,
    pendingChallenge,
    requestChallenge,
    sendCode,
    sendPending,
    submitPending,
  } = useVerificationGate({ purpose: AuthVerificationPurpose.SystemSettings });

  useEffect(() => {
    let isActive = true;

    const loadVerifiedSettings = async () => {
      try {
        const settings = await fetchSystemSettings();

        if (isActive) {
          setEnvironment(settings.environment);
          setEnvironmentFileLoaded(settings.environmentFileLoaded);
          setAccessVerified(true);
          setLoadError(null);
        }
      } catch (error: unknown) {
        if (isActive) {
          setLoadError(getApiErrorMessage(error, intl.formatMessage({ id: 'system.settings.load.failed' })));
        }
      }
    };

    void requestChallenge()
      .then((verified) => {
        if (!isActive) {
          return;
        }

        if (!verified) {
          setPendingVerificationIntent('load');
          return;
        }

        setAccessVerified(true);
        void loadVerifiedSettings();
      })
      .catch((error: unknown) => {
        if (isActive) {
          setLoadError(
            getApiErrorMessage(error, intl.formatMessage({ id: 'system.settings.access.verification.failed' })),
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, [intl, requestChallenge]);

  useEffect(() => {
    if (!action.error) {
      lastErrorToastRef.current = null;
      return;
    }

    if (lastErrorToastRef.current !== action.error) {
      lastErrorToastRef.current = action.error;
      toast.error(action.error);
    }
  }, [action.error]);

  const setEnvironmentField = (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEnvironmentFieldValue(key, event.target.value);
  };

  const setEnvironmentFieldValue = (key: string, value: string) => {
    setEnvironment((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
    action.clearError();
  };

  const regenerateSecret = () => {
    setEnvironmentFieldValue('AUTH_TOKEN_SECRET', generateSetupSecret());
  };

  const loadSystemSettings = async () => {
    try {
      const settings = await fetchSystemSettings();

      setEnvironment(settings.environment);
      setEnvironmentFileLoaded(settings.environmentFileLoaded);
      setAccessVerified(true);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(getApiErrorMessage(error, intl.formatMessage({ id: 'system.settings.load.failed' })));
    }
  };

  const requestSystemSettingsSaveVerification = async () => {
    const verified = await requestChallenge();

    if (!verified) {
      setPendingVerificationIntent('save');
    } else {
      setAccessVerified(true);
    }

    return verified;
  };

  const persistSystemSettings = async (nextEnvironment: SetupEnvironment) => {
    await updateSystemSettings(nextEnvironment);
    setDirty(false);
    setEnvironmentFileLoaded(true);
    toast.success(intl.formatMessage({ id: 'system.settings.save.success' }));
  };

  const handleConfirmVerification = async (input: VerificationGateSubmitInput) => {
    const verified = await confirmChallenge(input);

    if (!verified) {
      return;
    }

    setPendingVerificationIntent(null);
    setAccessVerified(true);

    if (pendingVerificationIntent === 'save') {
      await saveSystemSettings();
      return;
    }

    await loadSystemSettings();
  };

  const saveSystemSettings = async () => {
    if (!accessVerified || !environment) {
      return;
    }

    action.clearError();
    action.setPending(true);

    try {
      await persistSystemSettings(environment);
    } catch (error: unknown) {
      if (!(error instanceof ApiError) || error.code !== 'AUTH_VERIFICATION_REQUIRED') {
        action.setError(getApiErrorMessage(error, intl.formatMessage({ id: 'system.settings.save.failed' })));
        return;
      }

      try {
        const verified = await requestSystemSettingsSaveVerification();

        if (verified) {
          await persistSystemSettings(environment);
        }
      } catch (verificationError: unknown) {
        action.setError(
          getApiErrorMessage(
            verificationError,
            intl.formatMessage({ id: 'system.settings.access.verification.failed' }),
          ),
        );
      }
    } finally {
      action.setPending(false);
    }
  };

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();

    if (!environment) {
      return;
    }

    setSaveConfirmationOpen(true);
  };

  return (
    <main className="text-foreground">
      <form className="grid gap-6 p-4 lg:p-6" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-normal">
              {intl.formatMessage({ id: 'system.settings.title' })}
            </h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {intl.formatMessage({ id: 'system.settings.description' })}
            </p>
          </div>
          {accessVerified && environment ? (
            <Button className="hidden lg:inline-flex" disabled={action.pending} type="submit">
              {action.pending ? <Spinner /> : <SaveIcon />}
              {dirty
                ? intl.formatMessage({ id: 'common.save.changes' })
                : intl.formatMessage({ id: 'system.settings.save.settings' })}
            </Button>
          ) : null}
        </div>

        {!environmentFileLoaded && environment ? (
          <Alert className="max-w-5xl">
            <AlertTriangleIcon />
            <AlertTitle>{intl.formatMessage({ id: 'system.settings.no.configuration.title' })}</AlertTitle>
            <AlertDescription>
              {intl.formatMessage({ id: 'system.settings.no.configuration.description' })}
            </AlertDescription>
          </Alert>
        ) : null}

        {!environment ? (
          loadError ? (
            <AppEmptyState
              className="min-h-64 p-0"
              description={loadError}
              icon={<ShieldAlertIcon />}
              title={intl.formatMessage({ id: 'system.settings.unavailable' })}
              tone="destructive"
            />
          ) : (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
              <div className="flex flex-col items-center gap-3 text-center">
                <Spinner className="size-5" />
                <span>{intl.formatMessage({ id: 'system.settings.loading' })}</span>
              </div>
            </div>
          )
        ) : (
          <>
            <Tabs className="min-w-0" onValueChange={setActiveStepId} value={activeStepId}>
              <div className="grid min-w-0 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
                <SettingsStepNav activeStepId={activeStepId} onChange={setActiveStepId} steps={systemSettingsSteps} />
                <section className="min-w-0">
                  {systemSettingsSteps.map((step) => {
                    const StepIcon = step.icon;

                    return (
                      <TabsContent className="mt-0" key={step.id} value={step.id}>
                        <div className="grid gap-5">
                          <div className="flex min-w-0 items-center gap-3 border-b pb-4">
                            <StepIcon className="size-5 shrink-0 text-muted-foreground" />
                            <h2 className="truncate text-lg font-semibold">{formatSetupStepTitle(step, intl)}</h2>
                          </div>
                          {hasSettingsFields(step) ? (
                            <EnvironmentStep
                              disabled={action.pending}
                              environment={environment}
                              fields={step.fields}
                              onChange={setEnvironmentField}
                              onValueChange={setEnvironmentFieldValue}
                              onRegenerateSecret={regenerateSecret}
                            />
                          ) : (
                            <ConfigurationReview environment={environment} />
                          )}
                        </div>
                      </TabsContent>
                    );
                  })}
                </section>
              </div>
            </Tabs>
            {accessVerified ? (
              <div className="lg:hidden">
                <Button className="w-full" disabled={action.pending} type="submit">
                  {action.pending ? <Spinner /> : <SaveIcon />}
                  {dirty
                    ? intl.formatMessage({ id: 'common.save.changes' })
                    : intl.formatMessage({ id: 'system.settings.save.settings' })}
                </Button>
              </div>
            ) : null}
          </>
        )}

        {pendingChallenge ? (
          <IdentityVerificationDialog
            allowRecoveryCode
            defaultMethod={pendingChallenge.defaultMethod}
            error={verificationError}
            methods={pendingChallenge.methods}
            onClearError={clearVerificationError}
            onOpenChange={(open: boolean) => {
              if (!open) {
                dismissChallenge();
                setPendingVerificationIntent(null);

                if (pendingVerificationIntent === 'save') {
                  action.setError(intl.formatMessage({ id: 'system.settings.save.verification.required' }));
                  return;
                }

                setLoadError(intl.formatMessage({ id: 'system.settings.verification.required' }));
              }
            }}
            onSendCode={sendCode}
            onSubmit={handleConfirmVerification}
            open={Boolean(pendingChallenge)}
            pending={submitPending}
            sendPending={sendPending}
            title={intl.formatMessage({ id: 'system.settings.verify.access.title' })}
          />
        ) : null}
        <ConfirmActionDialog
          confirmLabel={
            dirty
              ? intl.formatMessage({ id: 'common.save.changes' })
              : intl.formatMessage({ id: 'system.settings.save.settings' })
          }
          confirmVariant="default"
          description={intl.formatMessage({ id: 'system.settings.save.confirmation.description' })}
          onConfirm={() => void saveSystemSettings()}
          onOpenChange={setSaveConfirmationOpen}
          open={saveConfirmationOpen}
          title={intl.formatMessage({ id: 'system.settings.save.confirmation.title' })}
        />
      </form>
    </main>
  );
};

export default Index;
