import {
  type ChangeEvent,
  type CSSProperties,
  type FormEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { CheckCircle2Icon, InfoIcon, KeyRoundIcon, type LucideIcon, RefreshCwIcon, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ApiError } from '@/lib/api';
import { appConfig } from '@/lib/config';
import {
  completeSetup,
  fetchSetupDefaults,
  type SetupAdministrator,
  type SetupEnvironment,
  testCacheConnection,
  testDatabaseConnection,
  testEmailConnection,
  testFileStorageConnection,
  testLoggingConnection,
  testSsoConnection,
  validateSetupEnvironment,
} from '@/lib/setup';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/shadcn/components/ui/native-select';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/shadcn/components/ui/sidebar';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { Textarea } from '@/shadcn/components/ui/textarea';
import { cn } from '@/shadcn/lib/utils';

import {
  administratorDefaults,
  administratorFieldHelp,
  hasLogTarget,
  type SetupFieldDefinition,
  setupFieldHelp,
  setupSteps,
} from './definitions';

const Index = () => {
  const [activeStep, setActiveStep] = useState(setupSteps[0]?.id ?? 'runtime');
  const [administrator, setAdministrator] = useState<SetupAdministrator>(administratorDefaults);
  const [completion, setCompletion] = useState<{ administratorCreated: boolean } | null>(null);
  const [databaseHasExistingUsers, setDatabaseHasExistingUsers] = useState<boolean | null>(null);
  const [environment, setEnvironment] = useState<SetupEnvironment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [maxUnlockedStepIndex, setMaxUnlockedStepIndex] = useState(0);
  const lastErrorToastRef = useRef<string | null>(null);
  const navigate = useNavigate();
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
    ? getPrimaryActionLabel(activeStep, environment, hasExistingUsers)
    : 'Continue';
  const setupInput = environment
    ? {
        environment,
        ...(hasExistingUsers ? {} : { administrator }),
      }
    : null;

  useEffect(() => {
    let active = true;

    void fetchSetupDefaults()
      .then((defaults) => {
        if (active) {
          setEnvironment({
            ...defaults.environment,
            CORS_ORIGINS: getCurrentOrigin(defaults.environment.CORS_ORIGINS),
            SSO_FRONTEND_CALLBACK_URL: getCurrentUrl('/login', defaults.environment.SSO_FRONTEND_CALLBACK_URL),
            SSO_REDIRECT_URI: getApiUrl('/api/auth/sso/callback', defaults.environment.SSO_REDIRECT_URI),
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          if (error instanceof ApiError && error.code === 'SETUP_LOCKED') {
            navigate('/login', { replace: true });
            return;
          }

          setLoadError('Unable to load setup defaults.');
        }
      });

    return () => {
      active = false;
    };
  }, [navigate]);

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

  const setEnvironmentField =
    (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;

      setEnvironment((current) => (current ? { ...current, [key]: value } : current));
      if (isDatabaseEnvironmentField(key)) {
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
    setEnvironment((current) => (current ? { ...current, AUTH_TOKEN_SECRET: generateSecret() } : current));
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
      const result = await action.run(() => completeSetup(setupInput), 'Unable to complete setup.');

      if (result) {
        setCompletion(result);
      }

      return;
    }

    if (activeStep === 'database') {
      const result = await action.run(
        () => testDatabaseConnection(setupInput.environment),
        'Database connection verification failed.',
      );

      if (!result) {
        return;
      }

      setDatabaseHasExistingUsers(result.hasExistingUsers);
      goToNextStep(
        result.hasExistingUsers
          ? 'Database connection verified. Existing users will be retained.'
          : 'Database connection verified.',
      );
      return;
    }

    if (activeStep === 'cache') {
      const result = await action.run(
        () => testCacheConnection(setupInput.environment),
        'Cache configuration verification failed.',
      );

      if (!result) {
        return;
      }

      goToNextStep(result.store === 'redis' ? 'Redis connection verified.' : 'Memory cache configuration verified.');
      return;
    }

    if (activeStep === 'file-storage') {
      const result = await action.run(
        () => testFileStorageConnection(setupInput.environment),
        'File storage verification failed.',
      );

      if (!result) {
        return;
      }

      goToNextStep(result.driver === 'oss' ? 'OSS file storage verified.' : 'Local file storage verified.');
      return;
    }

    if (activeStep === 'logging') {
      const result = await action.run(
        () => testLoggingConnection(setupInput.environment),
        'Logging configuration verification failed.',
      );

      if (!result) {
        return;
      }

      goToNextStep(result.target === 'sls' ? 'SLS logging verified.' : 'Logging configuration verified.');
      return;
    }

    if (activeStep === 'email') {
      const result = await action.run(
        () => testEmailConnection(setupInput.environment),
        'Email configuration verification failed.',
      );

      if (!result) {
        return;
      }

      goToNextStep(result.service === 'smtp' ? 'SMTP connection verified.' : 'Email configuration verified.');
      return;
    }

    if (activeStep === 'sso') {
      const result = await action.run(
        () => testSsoConnection(setupInput.environment),
        'SSO configuration verification failed.',
      );

      if (!result) {
        return;
      }

      goToNextStep(result.enabled ? 'SSO discovery verified.' : 'SSO configuration verified.');
      return;
    }

    if (activeStep === 'administrator' && !hasExistingUsers) {
      const administratorError = getAdministratorValidationError(administrator);

      if (administratorError) {
        action.setError(administratorError);
        return;
      }
    }

    const result = await action.run(
      () => validateSetupEnvironment(setupInput.environment),
      'Setup configuration validation failed.',
    );

    if (result) {
      goToNextStep('Configuration validated successfully.');
    }
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

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
      <main className="min-h-svh bg-background px-4 py-10 text-foreground sm:px-6">
        <div className="mx-auto flex min-h-[calc(100svh-5rem)] max-w-2xl items-center">
          <section className="w-full rounded-lg border bg-card p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <CheckCircle2Icon className="mt-1 size-6 shrink-0 text-emerald-600" />
              <div className="grid gap-2">
                <h1 className="text-xl font-semibold">Setup Complete</h1>
                <p className="text-sm text-muted-foreground">
                  {completion.administratorCreated
                    ? 'The backend environment file has been written, database migrations have been applied, and the root administrator account has been created.'
                    : 'The backend environment file has been written, database migrations have been applied, and existing users have been retained.'}{' '}
                  Restart the backend process to apply the generated configuration.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (!environment) {
    return (
      <main className="flex min-h-svh w-full items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-3 text-center">
          {loadError ? null : <Spinner className="size-5" />}
          <span>{loadError ?? 'Loading setup configuration'}</span>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <form onSubmit={handleSubmit}>
        <SidebarProvider
          className="min-h-svh"
          style={
            {
              '--sidebar-width': '18rem',
            } as CSSProperties
          }
        >
          <SetupSidebar
            activeStep={activeStep}
            maxUnlockedStepIndex={maxUnlockedStepIndex}
            onNavigate={handleStepNavigation}
          />

          <SidebarInset className="min-h-svh">
            <div className="border-b px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger className="-ml-2 md:hidden" type="button" variant="outline" />
                <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border md:hidden" />
                {activeStepDefinition ? <ActiveStepIcon icon={activeStepDefinition.icon} /> : null}
                <h2 className="truncate text-lg font-semibold">{activeStepDefinition?.title ?? 'Setup'}</h2>
              </div>
            </div>

            <div className="min-w-0 flex-1 px-4 py-5 sm:px-6">
              {activeStep === 'administrator' ? (
                <AdministratorStep
                  disabled={action.pending}
                  hasExistingUsers={hasExistingUsers}
                  administrator={administrator}
                  onChange={setAdministratorField}
                />
              ) : null}
              {activeStep === 'review' ? (
                <ReviewStep
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
                  onRegenerateSecret={regenerateSecret}
                />
              ) : null}
            </div>

            <footer className="border-t bg-background px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    disabled={action.pending || activeStepIndex === 0}
                    onClick={handleBack}
                    type="button"
                    variant="outline"
                  >
                    Previous
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
      </form>
    </div>
  );
};

function SetupSidebar({
  activeStep,
  maxUnlockedStepIndex,
  onNavigate,
}: {
  activeStep: string;
  maxUnlockedStepIndex: number;
  onNavigate: (stepId: string, stepIndex: number) => void;
}) {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar className="border-r" collapsible="offcanvas">
      <SidebarHeader className="px-4 py-5">
        <div className="grid gap-1">
          <h1 className="text-lg font-semibold">Setup</h1>
          <p className="text-sm text-muted-foreground">Initial system configuration</p>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 pb-4">
        <SidebarMenu>
          {setupSteps.map((step, stepIndex) => {
            const StepIcon = step.icon;
            const locked = stepIndex > maxUnlockedStepIndex;
            const completedStep = stepIndex < maxUnlockedStepIndex;
            const active = activeStep === step.id;

            return (
              <SidebarMenuItem key={step.id}>
                <SidebarMenuButton
                  aria-current={active ? 'step' : undefined}
                  className={cn('h-10', locked ? 'cursor-not-allowed text-muted-foreground/50' : undefined)}
                  disabled={locked}
                  isActive={active}
                  onClick={() => {
                    if (locked) {
                      return;
                    }

                    onNavigate(step.id, stepIndex);
                    setOpenMobile(false);
                  }}
                  type="button"
                >
                  {completedStep ? <CheckCircle2Icon className="text-emerald-600" /> : <StepIcon />}
                  <span>{step.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}

function EnvironmentStep({
  disabled,
  environment,
  fields,
  onChange,
  onRegenerateSecret,
}: {
  disabled: boolean;
  environment: SetupEnvironment;
  fields: SetupFieldDefinition[];
  onChange: (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onRegenerateSecret: () => void;
}) {
  const visibleFields = fields.filter((field) => !field.visible || field.visible(environment));
  const fieldGroups = getFieldGroups(visibleFields);

  return (
    <div className="grid max-w-5xl gap-8">
      {fieldGroups.map((group) => (
        <section className="grid gap-4" key={group.name}>
          {fieldGroupsNeedHeader(fieldGroups) ? (
            <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
          ) : null}
          <div className="grid gap-5">
            {group.fields.map((field) => (
              <SetupField
                disabled={disabled}
                field={field}
                key={field.key}
                onChange={onChange(field.key)}
                onRegenerateSecret={field.key === 'AUTH_TOKEN_SECRET' ? onRegenerateSecret : undefined}
                value={environment[field.key] ?? ''}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function getFieldGroups(fields: SetupFieldDefinition[]) {
  const groups: Array<{ fields: SetupFieldDefinition[]; name: string }> = [];

  for (const field of fields) {
    const name = field.group ?? 'General';
    const existingGroup = groups.find((group) => group.name === name);

    if (existingGroup) {
      existingGroup.fields.push(field);
    } else {
      groups.push({
        fields: [field],
        name,
      });
    }
  }

  return groups;
}

function fieldGroupsNeedHeader(groups: Array<{ fields: SetupFieldDefinition[]; name: string }>) {
  return groups.length > 1 || groups[0]?.name !== 'General';
}

function SetupField({
  disabled,
  field,
  onChange,
  onRegenerateSecret,
  value,
}: {
  disabled: boolean;
  field: SetupFieldDefinition;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onRegenerateSecret?: () => void;
  value: string;
}) {
  const inputId = `setup-${field.key}`;
  const description = field.description ?? setupFieldHelp[field.key]?.description;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const placeholder = field.placeholder ?? setupFieldHelp[field.key]?.placeholder;

  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <Label className="text-sm font-medium" htmlFor={inputId}>
          {field.label}
        </Label>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground" id={descriptionId}>
            {description}
          </p>
        ) : null}
      </div>
      <div className="min-w-0 max-w-3xl">
        {field.kind === 'select' ? (
          <NativeSelect
            aria-describedby={descriptionId}
            className="w-full"
            disabled={disabled}
            id={inputId}
            name={field.key}
            onChange={onChange}
            value={value}
          >
            {field.options?.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : field.kind === 'textarea' ? (
          <Textarea
            aria-describedby={descriptionId}
            className="min-h-24"
            disabled={disabled}
            id={inputId}
            name={field.key}
            onChange={onChange}
            placeholder={placeholder}
            value={value}
          />
        ) : (
          <div className="flex gap-2">
            <Input
              aria-describedby={descriptionId}
              autoComplete={field.kind === 'password' ? 'new-password' : 'off'}
              disabled={disabled}
              id={inputId}
              name={field.key}
              onChange={onChange}
              placeholder={placeholder}
              type={field.kind === 'password' ? 'password' : 'text'}
              value={value}
            />
            {onRegenerateSecret ? (
              <Button disabled={disabled} onClick={onRegenerateSecret} size="icon" type="button" variant="outline">
                <RefreshCwIcon />
                <span className="sr-only">Regenerate secret</span>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveStepIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-5 shrink-0 text-muted-foreground" />;
}

function AdministratorStep({
  administrator,
  disabled,
  hasExistingUsers,
  onChange,
}: {
  administrator: SetupAdministrator;
  disabled: boolean;
  hasExistingUsers: boolean;
  onChange: (field: keyof SetupAdministrator) => (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  if (hasExistingUsers) {
    return (
      <div className="grid max-w-3xl gap-5">
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-start gap-3">
            <InfoIcon className="mt-0.5 size-5 shrink-0" />
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">Existing Users Detected</h3>
              <p className="text-sm leading-6">
                The selected database already contains available users. Setup will retain those users and skip
                administrator creation.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid max-w-5xl gap-5">
      <AdministratorField
        autoComplete="name"
        disabled={disabled}
        field="username"
        label="Administrator Display Name"
        onChange={onChange('username')}
        value={administrator.username}
      />
      <AdministratorField
        autoComplete="email"
        disabled={disabled}
        field="email"
        label="Administrator Email"
        onChange={onChange('email')}
        type="email"
        value={administrator.email}
      />
      <AdministratorField
        autoComplete="new-password"
        disabled={disabled}
        field="password"
        label="Administrator Password"
        onChange={onChange('password')}
        type="password"
        value={administrator.password}
      />
      <AdministratorField
        autoComplete="new-password"
        disabled={disabled}
        field="confirmPassword"
        label="Confirm Administrator Password"
        onChange={onChange('confirmPassword')}
        type="password"
        value={administrator.confirmPassword}
      />
    </div>
  );
}

function AdministratorField({
  autoComplete,
  disabled,
  field,
  label,
  onChange,
  type = 'text',
  value,
}: {
  autoComplete: string;
  disabled: boolean;
  field: keyof SetupAdministrator;
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: 'email' | 'password' | 'text';
  value: string;
}) {
  const inputId = `setup-admin-${field}`;
  const descriptionId = `${inputId}-description`;
  const help = administratorFieldHelp[field];

  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <Label className="text-sm font-medium" htmlFor={inputId}>
          {label}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground" id={descriptionId}>
          {help.description}
        </p>
      </div>
      <div className="min-w-0 max-w-3xl">
        <Input
          aria-describedby={descriptionId}
          autoComplete={autoComplete}
          disabled={disabled}
          id={inputId}
          onChange={onChange}
          placeholder={help.placeholder}
          type={type}
          value={value}
        />
      </div>
    </div>
  );
}

function ReviewStep({
  administrator,
  environment,
  hasExistingUsers,
}: {
  administrator: SetupAdministrator;
  environment: SetupEnvironment;
  hasExistingUsers: boolean;
}) {
  const reviewItems = [
    ['Environment', environment.NODE_ENV],
    ['HTTP', `${environment.SERVER_HOST}:${environment.SERVER_PORT}`],
    ['Database', environment.DATABASE_DIALECT],
    ['Cache', environment.CACHE_STORE],
    ['File Storage', environment.FILE_STORAGE_DRIVER],
    ['Email', environment.EMAIL_VERIFICATION_SERVICE],
    ['SSO', environment.SSO_ENABLED],
    ['Administrator', hasExistingUsers ? 'Existing users retained' : administrator.email || 'Not configured'],
  ];
  const configuredSecrets = Object.entries(environment).filter(([key, value]) => isSensitiveKey(key) && value.trim());

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {reviewItems.map(([label, value]) => (
          <div className="rounded-md border p-3" key={label}>
            <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
            <div className="mt-1 truncate text-sm">{value}</div>
          </div>
        ))}
      </div>
      <section className="grid gap-3 rounded-md border p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRoundIcon className="size-4 text-muted-foreground" />
          Sensitive Configuration
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          {configuredSecrets.length > 0 ? (
            configuredSecrets.map(([key]) => (
              <div className="flex items-center justify-between gap-4 rounded-md bg-muted px-3 py-2" key={key}>
                <span className="truncate">{key}</span>
                <span>Configured</span>
              </div>
            ))
          ) : (
            <span>No sensitive optional values have been configured.</span>
          )}
        </div>
      </section>
    </div>
  );
}

function getPrimaryActionLabel(stepId: string, environment: SetupEnvironment, hasExistingUsers: boolean) {
  if (stepId === 'database') {
    return 'Verify Database and Continue';
  }

  if (stepId === 'administrator' && hasExistingUsers) {
    return 'Continue';
  }

  if (stepId === 'cache' && environment.CACHE_STORE === 'redis') {
    return 'Verify Redis and Continue';
  }

  if (stepId === 'file-storage' && environment.FILE_STORAGE_DRIVER === 'oss') {
    return 'Verify OSS and Continue';
  }

  if (stepId === 'file-storage') {
    return 'Verify Storage and Continue';
  }

  if (stepId === 'logging' && hasLogTarget(environment, 'sls')) {
    return 'Verify SLS and Continue';
  }

  if (stepId === 'email' && environment.EMAIL_VERIFICATION_SERVICE === 'smtp') {
    return 'Verify SMTP and Continue';
  }

  if (stepId === 'sso' && environment.SSO_ENABLED === 'true') {
    return 'Verify SSO and Continue';
  }

  if (stepId === 'review') {
    return 'Complete Setup';
  }

  return 'Validate and Continue';
}

function getAdministratorValidationError(administrator: SetupAdministrator) {
  if (administrator.username.trim().length < 2) {
    return 'The administrator display name must contain at least 2 characters.';
  }

  if (!administrator.email.trim()) {
    return 'The administrator email address is required.';
  }

  if (administrator.password.length < 8) {
    return 'The administrator password must contain at least 8 characters.';
  }

  if (administrator.password !== administrator.confirmPassword) {
    return 'The administrator password confirmation does not match.';
  }

  return null;
}

function isSensitiveKey(key: string) {
  return (
    key.endsWith('_SECRET') ||
    key.endsWith('_PASSWORD') ||
    key.endsWith('_ACCESS_KEY_SECRET') ||
    key === 'AUTH_TOKEN_SECRET' ||
    key === 'DATABASE_URL' ||
    key === 'CACHE_REDIS_URL'
  );
}

function isDatabaseEnvironmentField(key: string) {
  return key.startsWith('DATABASE_');
}

function generateSecret() {
  const bytes = new Uint8Array(48);

  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getCurrentOrigin(fallback: string) {
  return window.location.origin || fallback;
}

function getCurrentUrl(path: string, fallback: string) {
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return fallback;
  }
}

function getApiUrl(path: string, fallback: string) {
  try {
    return new URL(path, appConfig.apiBaseUrl).toString();
  } catch {
    return fallback;
  }
}

export default Index;
