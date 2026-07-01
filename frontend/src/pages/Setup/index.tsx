import {
  type ChangeEvent,
  type CSSProperties,
  type SubmitEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import { CheckCircle2Icon, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ApiError, getApiErrorMessage } from '@/lib/api';
import {
  completeSetup,
  fetchSetupDefaults,
  generateSetupSecret,
  type SetupAdministrator,
  type SetupEnvironment,
  testCacheConnection,
  testDatabaseConnection,
  testEmailConnection,
  testFileStorageConnection,
  testLoggingConnection,
  testSmsConnection,
  testSsoConnection,
  validateSetupEnvironment,
} from '@/lib/setup';
import { routePath } from '@/router';
import { Button } from '@/shadcn/components/ui/button';
import { Card, CardContent } from '@/shadcn/components/ui/card';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shadcn/components/ui/sidebar';
import { Spinner } from '@/shadcn/components/ui/spinner';
import {
  SetupCacheStore,
  SetupEmailVerificationService,
  SetupFileStorageDriver,
  SetupLogTarget,
  SetupSmsVerificationService,
} from '@tilty/shared/setup';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import {
  ActiveStepIcon,
  AdministratorStep,
  ConfigurationReview,
  EnvironmentStep,
} from '@/components/SetupConfiguration';
import { administratorDefaults, setupSteps } from '@/components/SetupConfiguration/definitions';
import {
  formatSetupStepTitle,
  getAdministratorValidationError,
  getCurrentOrigin,
  getDefaultSsoProfile,
  getOriginOrValue,
  getPrimaryActionLabel,
  isEmptySsoProfilesValue,
  isEnvironmentValidationStep,
  normalizeSsoProfileForStorage,
  shouldReplaceDomainDefault,
  updateDefaultSsoProfileUrlsForDomain,
} from '@/components/SetupConfiguration/utils';

import { SetupSidebar } from './components/SetupSidebar';

const Index = () => {
  const [activeStep, setActiveStep] = useState(setupSteps[0]?.id ?? 'runtime');
  const [administrator, setAdministrator] = useState<SetupAdministrator>(administratorDefaults);
  const [completeConfirmationOpen, setCompleteConfirmationOpen] = useState(false);
  const [completion, setCompletion] = useState<{ administratorCreated: boolean } | null>(null);
  const [databaseHasExistingUsers, setDatabaseHasExistingUsers] = useState<boolean | null>(null);
  const [environment, setEnvironment] = useState<SetupEnvironment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [maxUnlockedStepIndex, setMaxUnlockedStepIndex] = useState(0);
  const lastErrorToastRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const intl = useIntl();
  const action = useAsyncAction();
  const activeStepDefinition = useMemo(
    () => setupSteps.find((step) => step.id === activeStep) ?? setupSteps[0],
    [activeStep],
  );
  const activeStepIndex = Math.max(
    setupSteps.findIndex((step) => step.id === activeStep),
    0,
  );
  const hasExistingUsers = databaseHasExistingUsers === true;
  const primaryActionLabel = environment
    ? getPrimaryActionLabel(activeStep, environment, hasExistingUsers, intl)
    : intl.formatMessage({ id: 'common.continue' });
  const setupInput = environment
    ? {
        environment,
        ...(hasExistingUsers ? {} : { administrator }),
      }
    : null;

  useEffect(() => {
    let isActive = true;

    void fetchSetupDefaults()
      .then((defaults) => {
        if (isActive) {
          const currentOrigin = getCurrentOrigin(
            defaults.environment.APP_DOMAIN ?? defaults.environment.APP_CORS_ORIGINS,
          );
          const setupEnvironmentDefaults = defaults.environmentFileLoaded
            ? defaults.environment
            : {
                ...defaults.environment,
                APP_DOMAIN: currentOrigin,
                APP_CORS_ORIGINS: currentOrigin,
              };

          setEnvironment(setupEnvironmentDefaults);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          if (error instanceof ApiError && error.code === 'SETUP_LOCKED') {
            navigate(routePath('login'), { replace: true });
            return;
          }

          setLoadError(getApiErrorMessage(error, intl.formatMessage({ id: 'setup.defaults.load.failed' })));
        }
      });

    return () => {
      isActive = false;
    };
  }, [intl, navigate]);

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
    setEnvironment((current) => {
      if (!current) {
        return current;
      }

      const nextEnvironment = { ...current, [key]: value };

      if (key === 'APP_DOMAIN') {
        if (shouldReplaceDomainDefault(current.APP_CORS_ORIGINS, current.APP_DOMAIN)) {
          nextEnvironment.APP_CORS_ORIGINS = getOriginOrValue(value, value);
        }

        if (!isEmptySsoProfilesValue(current.SSO_PROFILES)) {
          nextEnvironment.SSO_PROFILES = updateDefaultSsoProfileUrlsForDomain(
            current.SSO_PROFILES,
            current.APP_DOMAIN,
            value,
          );
        }
      }

      if (key === 'SSO_ENABLED' && value === 'true' && isEmptySsoProfilesValue(current.SSO_PROFILES)) {
        nextEnvironment.SSO_PROFILES = JSON.stringify([
          normalizeSsoProfileForStorage(getDefaultSsoProfile([], nextEnvironment.APP_DOMAIN)),
        ]);
      }

      return nextEnvironment;
    });
    if (key.startsWith('DATABASE_')) {
      setDatabaseHasExistingUsers(null);
    }
    resetProgressFromCurrentStep();
  };

  const setAdministratorField = (field: keyof SetupAdministrator) => (event: ChangeEvent<HTMLInputElement>) => {
    setAdministrator((current) => ({
      ...current,
      [field]: event.target.value,
    }));
    resetProgressFromCurrentStep();
  };

  const regenerateSecret = () => {
    setEnvironment((current) => (current ? { ...current, AUTH_TOKEN_SECRET: generateSetupSecret() } : current));
    resetProgressFromCurrentStep();
  };

  const resetProgressFromCurrentStep = () => {
    setMaxUnlockedStepIndex((current) => Math.min(current, activeStepIndex));
    action.clearError();
  };

  const handlePrimaryAction = async () => {
    if (!setupInput) {
      return;
    }

    if (activeStep === 'review') {
      const result = await action.run(
        () => completeSetup(setupInput),
        intl.formatMessage({ id: 'setup.error.complete.failed' }),
      );

      if (result) {
        setCompletion(result);
      }

      return;
    }

    if (activeStep === 'database') {
      const result = await action.run(
        () => testDatabaseConnection(setupInput.environment),
        intl.formatMessage({ id: 'setup.error.database.verification.failed' }),
      );

      if (!result) {
        return;
      }

      setDatabaseHasExistingUsers(result.hasExistingUsers);
      goToNextStep(
        result.hasExistingUsers
          ? intl.formatMessage({ id: 'setup.toast.database.existing.users' })
          : intl.formatMessage({ id: 'setup.toast.database.verified' }),
      );
      return;
    }

    if (activeStep === 'cache') {
      const result = await action.run(
        () => testCacheConnection(setupInput.environment),
        intl.formatMessage({ id: 'setup.error.cache.verification.failed' }),
      );

      if (!result) {
        return;
      }

      goToNextStep(
        result.store === SetupCacheStore.Redis
          ? intl.formatMessage({ id: 'setup.toast.redis.verified' })
          : intl.formatMessage({ id: 'setup.toast.cache.memory.verified' }),
      );
      return;
    }

    if (activeStep === 'file-storage') {
      const result = await action.run(
        () => testFileStorageConnection(setupInput.environment),
        intl.formatMessage({ id: 'setup.error.file.storage.verification.failed' }),
      );

      if (!result) {
        return;
      }

      goToNextStep(
        result.driver === SetupFileStorageDriver.Oss
          ? intl.formatMessage({ id: 'setup.toast.oss.file.storage.verified' })
          : intl.formatMessage({ id: 'setup.toast.local.file.storage.verified' }),
      );
      return;
    }

    if (activeStep === 'logging') {
      const result = await action.run(
        () => testLoggingConnection(setupInput.environment),
        intl.formatMessage({ id: 'setup.error.logging.verification.failed' }),
      );

      if (!result) {
        return;
      }

      goToNextStep(
        result.target === SetupLogTarget.Sls
          ? intl.formatMessage({ id: 'setup.toast.sls.verified' })
          : intl.formatMessage({ id: 'setup.toast.logging.verified' }),
      );
      return;
    }

    if (activeStep === 'email') {
      const result = await action.run(
        () => testEmailConnection(setupInput.environment),
        intl.formatMessage({ id: 'setup.error.email.verification.failed' }),
      );

      if (!result) {
        return;
      }

      goToNextStep(
        result.service === SetupEmailVerificationService.Smtp
          ? intl.formatMessage({ id: 'setup.toast.smtp.verified' })
          : intl.formatMessage({ id: 'setup.toast.email.verified' }),
      );
      return;
    }

    if (activeStep === 'sms') {
      const result = await action.run(
        () => testSmsConnection(setupInput.environment),
        intl.formatMessage({ id: 'setup.error.sms.verification.failed' }),
      );

      if (!result) {
        return;
      }

      goToNextStep(
        result.service === SetupSmsVerificationService.Aliyun
          ? intl.formatMessage({ id: 'setup.toast.aliyun.sms.verified' })
          : intl.formatMessage({ id: 'setup.toast.sms.verified' }),
      );
      return;
    }

    if (activeStep === 'sso') {
      const result = await action.run(
        () => testSsoConnection(setupInput.environment),
        intl.formatMessage({ id: 'setup.error.sso.verification.failed' }),
      );

      if (!result) {
        return;
      }

      goToNextStep(
        result.enabled
          ? intl.formatMessage({ id: 'setup.toast.sso.discovery.verified' })
          : intl.formatMessage({ id: 'setup.toast.sso.verified' }),
      );
      return;
    }

    if (activeStep === 'administrator' && !hasExistingUsers) {
      const administratorError = getAdministratorValidationError(administrator, intl);

      if (administratorError) {
        action.setError(administratorError);
        return;
      }
    }

    const result = await action.run(
      () =>
        validateSetupEnvironment(
          setupInput.environment,
          isEnvironmentValidationStep(activeStep) ? activeStep : undefined,
        ),
      intl.formatMessage({ id: 'setup.error.validation.failed' }),
    );

    if (result) {
      goToNextStep(intl.formatMessage({ id: 'setup.toast.configuration.validated' }));
    }
  };

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (activeStep === 'review') {
      setCompleteConfirmationOpen(true);
      return;
    }

    await handlePrimaryAction();
  };

  const handleBack = () => {
    const previousStep = setupSteps[activeStepIndex - 1];

    if (previousStep) {
      action.clearError();
      setActiveStep(previousStep.id);
    }
  };

  const handleStepNavigation = (stepId: string, stepIndex: number) => {
    if (stepIndex > maxUnlockedStepIndex) {
      return;
    }

    action.clearError();
    setActiveStep(stepId);
  };

  const goToNextStep = (notice: string | null) => {
    const nextStep = setupSteps[activeStepIndex + 1];

    if (!nextStep) {
      return;
    }

    setMaxUnlockedStepIndex((current) => Math.max(current, activeStepIndex + 1));
    if (notice) {
      toast.success(notice);
    }
    setActiveStep(nextStep.id);
  };

  if (completion) {
    return (
      <main className="flex min-h-svh w-full items-center justify-center bg-muted px-4 py-10 text-foreground sm:px-6">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-start gap-3">
            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="grid gap-2">
              <h1 className="text-xl font-semibold">{intl.formatMessage({ id: 'setup.completed.title' })}</h1>
              <p className="text-sm text-muted-foreground">
                {intl.formatMessage({ id: 'setup.completed.description' })}
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!environment) {
    return (
      <main className="flex min-h-svh w-full items-center justify-center bg-muted px-4 text-sm text-muted-foreground">
        <Card className="min-w-64">
          <CardContent className="flex flex-col items-center gap-3 text-center text-muted-foreground">
            {loadError ? null : <Spinner className="size-5" />}
            <span>{loadError ?? intl.formatMessage({ id: 'setup.loading.configuration' })}</span>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="app-shell h-svh overflow-hidden bg-sidebar text-foreground">
      <form className="h-full" onSubmit={handleSubmit}>
        <SidebarProvider
          className="h-full min-h-0 bg-sidebar"
          style={
            {
              '--header-height': 'calc(var(--spacing) * 12)',
              '--sidebar-width': '17rem',
            } as CSSProperties
          }
        >
          <SetupSidebar
            activeStep={activeStep}
            maxUnlockedStepIndex={maxUnlockedStepIndex}
            onNavigate={handleStepNavigation}
          />

          <SidebarInset className="min-h-0 overflow-hidden">
            <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/50">
              <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
                <SidebarTrigger className="-ml-1" type="button" />
                <div aria-hidden="true" className="mx-2 h-4 w-px shrink-0 self-center bg-border" />
                {activeStepDefinition ? <ActiveStepIcon icon={activeStepDefinition.icon} /> : null}
                <h1 className="truncate text-base font-medium">
                  {activeStepDefinition
                    ? formatSetupStepTitle(activeStepDefinition, intl)
                    : intl.formatMessage({ id: 'route.setup' })}
                </h1>
                <span className="ml-auto shrink-0 rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {activeStepIndex + 1}/{setupSteps.length}
                </span>
              </div>
            </header>

            <div className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
              {activeStep === 'administrator' ? (
                <AdministratorStep
                  disabled={action.pending}
                  hasExistingUsers={hasExistingUsers}
                  administrator={administrator}
                  onChange={setAdministratorField}
                />
              ) : null}
              {activeStep === 'review' ? (
                <ConfigurationReview
                  administrator={administrator}
                  environment={environment}
                  hasExistingUsers={hasExistingUsers}
                />
              ) : null}
              {activeStepDefinition?.fields ? (
                <EnvironmentStep
                  disabled={action.pending}
                  environment={environment}
                  fields={activeStepDefinition.fields}
                  onChange={setEnvironmentField}
                  onValueChange={setEnvironmentFieldValue}
                  onRegenerateSecret={regenerateSecret}
                />
              ) : null}
            </div>

            <footer className="shrink-0 border-t bg-background/95 px-4 py-3 backdrop-blur lg:px-6">
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    disabled={action.pending || activeStepIndex === 0}
                    onClick={handleBack}
                    type="button"
                    variant="outline"
                  >
                    {intl.formatMessage({ id: 'common.previous' })}
                  </Button>
                  <Button disabled={action.pending} type="submit">
                    {action.pending ? <Spinner /> : activeStep === 'review' ? <SaveIcon /> : <CheckCircle2Icon />}
                    {primaryActionLabel}
                  </Button>
                </div>
              </div>
            </footer>
          </SidebarInset>
        </SidebarProvider>
        <ConfirmActionDialog
          confirmLabel={intl.formatMessage({ id: 'setup.action.complete.setup' })}
          confirmVariant="default"
          description={intl.formatMessage({ id: 'setup.confirm.complete.description' })}
          onConfirm={() => void handlePrimaryAction()}
          onOpenChange={setCompleteConfirmationOpen}
          open={completeConfirmationOpen}
          title={intl.formatMessage({ id: 'setup.confirm.complete.title' })}
        />
      </form>
    </div>
  );
};

export default Index;
