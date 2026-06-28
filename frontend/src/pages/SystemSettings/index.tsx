import { type ChangeEvent, type SubmitEventHandler, useEffect, useRef, useState } from 'react';

import { AlertTriangleIcon, SaveIcon, ShieldAlertIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { useVerificationGate, type VerificationGateSubmitInput } from '@/hooks/useVerificationGate';
import { ApiError, getApiErrorMessage } from '@/lib/api';
import { generateSetupSecret, type SetupEnvironment } from '@/lib/setup';
import { fetchSystemSettings, updateSystemSettings } from '@/lib/system-settings';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shadcn/components/ui/empty';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Tabs, TabsContent } from '@/shadcn/components/ui/tabs';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { IdentityVerificationDialog } from '@/components/IdentityVerification';
import { ConfigurationReview, EnvironmentStep } from '@/components/SetupConfiguration';

import { SettingsStepNav } from './components/SettingsStepNav';
import { hasSettingsFields, systemSettingsSteps } from './utils';

type SystemSettingsVerificationIntent = 'load' | 'save';

const Index = () => {
  const [activeStepId, setActiveStepId] = useState(systemSettingsSteps[0]?.id ?? 'runtime');
  const [dirty, setDirty] = useState(false);
  const [environment, setEnvironment] = useState<SetupEnvironment | null>(null);
  const [environmentFileLoaded, setEnvironmentFileLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingVerificationIntent, setPendingVerificationIntent] = useState<SystemSettingsVerificationIntent | null>(
    null,
  );
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const lastErrorToastRef = useRef<string | null>(null);
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
  } = useVerificationGate({ purpose: 'system_settings' });

  useEffect(() => {
    let isActive = true;

    const loadVerifiedSettings = async () => {
      try {
        const settings = await fetchSystemSettings();

        if (isActive) {
          setEnvironment(settings.environment);
          setEnvironmentFileLoaded(settings.environmentFileLoaded);
          setLoadError(null);
        }
      } catch (error: unknown) {
        if (isActive) {
          setLoadError(getApiErrorMessage(error, 'System settings could not be loaded.'));
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

        void loadVerifiedSettings();
      })
      .catch((error: unknown) => {
        if (isActive) {
          setLoadError(getApiErrorMessage(error, 'System settings access could not be verified.'));
        }
      });

    return () => {
      isActive = false;
    };
  }, [requestChallenge]);

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
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(getApiErrorMessage(error, 'System settings could not be loaded.'));
    }
  };

  const requestSystemSettingsSaveVerification = async () => {
    const verified = await requestChallenge();

    if (!verified) {
      setPendingVerificationIntent('save');
    }

    return verified;
  };

  const persistSystemSettings = async (nextEnvironment: SetupEnvironment) => {
    await updateSystemSettings(nextEnvironment);
    setDirty(false);
    setEnvironmentFileLoaded(true);
    toast.success('System settings saved. Restart the backend for changes to take effect.');
  };

  const handleConfirmVerification = async (input: VerificationGateSubmitInput) => {
    const verified = await confirmChallenge(input);

    if (!verified) {
      return;
    }

    setPendingVerificationIntent(null);

    if (pendingVerificationIntent === 'save') {
      await saveSystemSettings();
      return;
    }

    await loadSystemSettings();
  };

  const saveSystemSettings = async () => {
    if (!environment) {
      return;
    }

    action.clearError();
    action.setPending(true);

    try {
      await persistSystemSettings(environment);
    } catch (error: unknown) {
      if (!(error instanceof ApiError) || error.code !== 'AUTH_VERIFICATION_REQUIRED') {
        action.setError(getApiErrorMessage(error, 'System settings could not be saved.'));
        return;
      }

      try {
        const verified = await requestSystemSettingsSaveVerification();

        if (verified) {
          await persistSystemSettings(environment);
        }
      } catch (verificationError: unknown) {
        action.setError(getApiErrorMessage(verificationError, 'System settings access could not be verified.'));
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
            <h1 className="text-2xl font-semibold tracking-normal">System Settings</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Runtime configuration values from setup. Saved changes require a backend restart.
            </p>
          </div>
          <Button className="hidden lg:inline-flex" disabled={action.pending || !environment} type="submit">
            {action.pending ? <Spinner /> : <SaveIcon />}
            {dirty ? 'Save changes' : 'Save settings'}
          </Button>
        </div>

        {!environmentFileLoaded && environment ? (
          <Alert className="max-w-5xl">
            <AlertTriangleIcon />
            <AlertTitle>No configuration file loaded</AlertTitle>
            <AlertDescription>Saving these settings will create a locked backend configuration file.</AlertDescription>
          </Alert>
        ) : null}

        {!environment ? (
          loadError ? (
            <Empty className="min-h-64 p-0">
              <EmptyHeader>
                <EmptyMedia className="bg-destructive/10 text-destructive" variant="icon">
                  <ShieldAlertIcon />
                </EmptyMedia>
                <EmptyTitle>System settings unavailable</EmptyTitle>
                <EmptyDescription>{loadError}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
              <div className="flex flex-col items-center gap-3 text-center">
                <Spinner className="size-5" />
                <span>Loading system settings</span>
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
                            <h2 className="truncate text-lg font-semibold">{step.title}</h2>
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
            <div className="lg:hidden">
              <Button className="w-full" disabled={action.pending || !environment} type="submit">
                {action.pending ? <Spinner /> : <SaveIcon />}
                {dirty ? 'Save changes' : 'Save settings'}
              </Button>
            </div>
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
                  action.setError('System settings verification is required before saving.');
                  return;
                }

                setLoadError('System settings verification is required.');
              }
            }}
            onSendCode={sendCode}
            onSubmit={handleConfirmVerification}
            open={Boolean(pendingChallenge)}
            pending={submitPending}
            sendPending={sendPending}
            title="Verify system settings access"
          />
        ) : null}
        <ConfirmActionDialog
          confirmLabel={dirty ? 'Save changes' : 'Save settings'}
          confirmVariant="default"
          description="These settings will be written to the backend configuration. A backend restart is required for saved changes to take effect."
          onConfirm={() => void saveSystemSettings()}
          onOpenChange={setSaveConfirmationOpen}
          open={saveConfirmationOpen}
          title="Save system settings?"
        />
      </form>
    </main>
  );
};

export default Index;
