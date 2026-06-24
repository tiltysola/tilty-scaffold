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

import {
  CheckCircle2Icon,
  InfoIcon,
  KeyRoundIcon,
  type LucideIcon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ApiError } from '@/lib/api';
import {
  completeSetup,
  fetchSetupDefaults,
  type SetupAdministrator,
  type SetupEnvironment,
  type SetupEnvironmentStepId,
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
        if (active) {
          if (error instanceof ApiError && error.code === 'SETUP_LOCKED') {
            navigate(routePath('login'), { replace: true });
            return;
          }

          setLoadError('Setup defaults could not be loaded.');
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
      const result = await action.run(() => completeSetup(setupInput), 'Setup could not be completed.');

      if (result) {
        setCompletion(result);
      }

      return;
    }

    if (activeStep === 'database') {
      const result = await action.run(
        () => testDatabaseConnection(setupInput.environment),
        'Database connection could not be verified.',
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
        'Cache configuration could not be verified.',
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
        'File storage configuration could not be verified.',
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
        'Logging configuration could not be verified.',
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
        'Email configuration could not be verified.',
      );

      if (!result) {
        return;
      }

      goToNextStep(result.service === 'smtp' ? 'SMTP connection verified.' : 'Email configuration verified.');
      return;
    }

    if (activeStep === 'sms') {
      const result = await action.run(
        () => testSmsConnection(setupInput.environment),
        'SMS configuration could not be verified.',
      );

      if (!result) {
        return;
      }

      goToNextStep(result.service === 'aliyun' ? 'Aliyun SMS configuration verified.' : 'SMS configuration verified.');
      return;
    }

    if (activeStep === 'sso') {
      const result = await action.run(
        () => testSsoConnection(setupInput.environment),
        'SSO configuration could not be verified.',
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
      () =>
        validateSetupEnvironment(
          setupInput.environment,
          isEnvironmentValidationStep(activeStep) ? activeStep : undefined,
        ),
      'Setup configuration could not be validated.',
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
                <h1 className="text-xl font-semibold">Setup completed</h1>
                <p className="text-sm text-muted-foreground">
                  The setup process has completed successfully. Restart the backend service for the new configuration to
                  take effect.
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
                  onValueChange={setEnvironmentFieldValue}
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
  onValueChange,
  onRegenerateSecret,
}: {
  disabled: boolean;
  environment: SetupEnvironment;
  fields: SetupFieldDefinition[];
  onChange: (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onValueChange: (key: string, value: string) => void;
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
                environment={environment}
                field={field}
                key={field.key}
                onChange={onChange(field.key)}
                onValueChange={(value) => onValueChange(field.key, value)}
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
  environment,
  field,
  onChange,
  onValueChange,
  onRegenerateSecret,
  value,
}: {
  disabled: boolean;
  environment: SetupEnvironment;
  field: SetupFieldDefinition;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onValueChange: (value: string) => void;
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
        ) : field.kind === 'sms-profiles' ? (
          <SmsProfilesField disabled={disabled} onValueChange={onValueChange} value={value} />
        ) : field.kind === 'smtp-profiles' ? (
          <SmtpProfilesField disabled={disabled} onValueChange={onValueChange} value={value} />
        ) : field.kind === 'sso-profiles' ? (
          <SsoProfilesField
            appDomain={environment.APP_DOMAIN}
            disabled={disabled}
            onValueChange={onValueChange}
            value={value}
          />
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

interface SmtpProfileDraft {
  from: string;
  host: string;
  password: string;
  port: string;
  secure: boolean;
  startTls: boolean;
  timeoutMs: string;
  username: string;
}

type SmtpProfileField = keyof SmtpProfileDraft;

const defaultSmtpProfile: SmtpProfileDraft = {
  from: '',
  host: '',
  password: '',
  port: '465',
  secure: true,
  startTls: false,
  timeoutMs: '10000',
  username: '',
};

const smtpProfileTextFields: Array<{
  key: SmtpProfileField;
  label: string;
  placeholder: string;
  type?: 'password' | 'text';
}> = [
  { key: 'host', label: 'SMTP Host', placeholder: 'smtp.example.com' },
  { key: 'port', label: 'SMTP Port', placeholder: '465' },
  { key: 'from', label: 'SMTP Sender', placeholder: 'Tilty <no-reply@example.com>' },
  { key: 'username', label: 'SMTP Username', placeholder: 'no-reply@example.com' },
  { key: 'password', label: 'SMTP Password', placeholder: 'SMTP password or app token', type: 'password' },
  { key: 'timeoutMs', label: 'SMTP Request Timeout (ms)', placeholder: '10000' },
];

function ProfileTextInput({
  disabled,
  id,
  label,
  onChange,
  placeholder,
  type = 'text',
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: 'password' | 'text';
  value: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        disabled={disabled}
        id={id}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        readOnly={!onChange}
        type={type}
        value={value}
      />
    </div>
  );
}

function SmtpProfilesField({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const profiles = parseProfileArray(value, isProfileObject).map(normalizeSmtpProfileDraft);
  const updateProfiles = (nextProfiles: SmtpProfileDraft[]) => {
    onValueChange(JSON.stringify(nextProfiles.map(normalizeSmtpProfileForStorage)));
  };
  const updateProfile = (index: number, field: SmtpProfileField, fieldValue: string | boolean) => {
    updateProfiles(
      profiles.map((profile, profileIndex) => (profileIndex === index ? { ...profile, [field]: fieldValue } : profile)),
    );
  };
  const addProfile = () => {
    updateProfiles([...profiles, { ...defaultSmtpProfile }]);
  };
  const removeProfile = (index: number) => {
    updateProfiles(profiles.filter((_, profileIndex) => profileIndex !== index));
  };

  return (
    <div className="grid gap-4">
      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No SMTP profiles are configured.
        </div>
      ) : null}
      {profiles.map((profile, index) => (
        <div className="grid gap-4 rounded-md border p-4" key={`${profile.host || 'smtp'}-${index}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{getSmtpProfileLabel(profile, index)}</div>
            <Button
              disabled={disabled}
              onClick={() => removeProfile(index)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2Icon />
              <span className="sr-only">Remove SMTP profile</span>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {smtpProfileTextFields.map((field) => (
              <ProfileTextInput
                disabled={disabled}
                id={`setup-smtp-profile-${index}-${field.key}`}
                key={field.key}
                label={field.label}
                onChange={(fieldValue) => updateProfile(index, field.key, fieldValue)}
                placeholder={field.placeholder}
                type={field.type}
                value={String(profile[field.key])}
              />
            ))}
            <div className="grid gap-2">
              <Label htmlFor={`setup-smtp-profile-${index}-secure`}>SMTP Implicit TLS</Label>
              <NativeSelect
                disabled={disabled}
                id={`setup-smtp-profile-${index}-secure`}
                onChange={(event) => updateProfile(index, 'secure', event.target.value === 'true')}
                value={String(profile.secure)}
              >
                <NativeSelectOption value="true">Enabled</NativeSelectOption>
                <NativeSelectOption value="false">Disabled</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`setup-smtp-profile-${index}-starttls`}>SMTP STARTTLS</Label>
              <NativeSelect
                disabled={disabled}
                id={`setup-smtp-profile-${index}-starttls`}
                onChange={(event) => updateProfile(index, 'startTls', event.target.value === 'true')}
                value={String(profile.startTls)}
              >
                <NativeSelectOption value="false">Disabled</NativeSelectOption>
                <NativeSelectOption value="true">Enabled</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          Add SMTP profile
        </Button>
      </div>
    </div>
  );
}

function parseProfileArray<T>(value: string, isProfile: (profile: unknown) => profile is T) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isProfile);
  } catch {
    return [];
  }
}

function isProfileObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeSmtpProfileDraft(profile: Record<string, unknown>): SmtpProfileDraft {
  return {
    from: typeof profile.from === 'string' ? profile.from : '',
    host: typeof profile.host === 'string' ? profile.host : '',
    password: typeof profile.password === 'string' ? profile.password : '',
    port: profile.port === undefined ? '465' : String(profile.port),
    secure: typeof profile.secure === 'boolean' ? profile.secure : true,
    startTls: typeof profile.startTls === 'boolean' ? profile.startTls : false,
    timeoutMs: profile.timeoutMs === undefined ? '10000' : String(profile.timeoutMs),
    username: typeof profile.username === 'string' ? profile.username : '',
  };
}

function normalizeSmtpProfileForStorage(profile: SmtpProfileDraft) {
  return {
    from: profile.from,
    host: profile.host,
    ...(profile.password.trim() ? { password: profile.password } : {}),
    port: profile.port,
    secure: profile.secure,
    startTls: profile.startTls,
    timeoutMs: profile.timeoutMs,
    ...(profile.username.trim() ? { username: profile.username } : {}),
  };
}

function getSmtpProfileLabel(profile: SmtpProfileDraft, index: number) {
  return profile.host.trim() || profile.from.trim() || `SMTP profile ${index + 1}`;
}

type SsoProtocol = 'oauth2' | 'oidc';

interface SsoProfileDraft {
  id: string;
  name: string;
  iconUrl: string;
  protocol: SsoProtocol;
  loginEnabled: boolean;
  bindingEnabled: boolean;
  clientId: string;
  clientSecret: string;
  frontendCallbackUrl: string;
  redirectUri: string;
  requestTimeoutMs: string;
  scopes: string;
  issuerUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  subjectField: string;
  emailField: string;
  emailVerifiedField: string;
  displayNameField: string;
  usernameField: string;
}

type SsoProfileField = keyof SsoProfileDraft;

const ssoProtocolOptions: Array<{ label: string; value: SsoProtocol }> = [
  { label: 'OpenID Connect', value: 'oidc' },
  { label: 'OAuth 2.0', value: 'oauth2' },
];

const fallbackAppDomain = 'http://localhost:8011';

function getDefaultSsoProfileBase(appDomain?: string) {
  const domain = getOriginOrValue(appDomain ?? getCurrentOrigin(fallbackAppDomain), fallbackAppDomain);

  return {
    name: 'SSO',
    iconUrl: '',
    protocol: 'oidc' as const,
    loginEnabled: true,
    bindingEnabled: true,
    clientId: '',
    clientSecret: '',
    frontendCallbackUrl: getUrlFromDomain(domain, routePath('login'), `${fallbackAppDomain}${routePath('login')}`),
    redirectUri: getUrlFromDomain(domain, '/api/auth/sso/callback', `${fallbackAppDomain}/api/auth/sso/callback`),
    requestTimeoutMs: '10000',
    scopes: 'openid profile email',
    issuerUrl: '',
    authorizationUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    subjectField: 'sub',
    emailField: 'email',
    emailVerifiedField: 'email_verified',
    displayNameField: 'name',
    usernameField: 'preferred_username',
  };
}

const ssoCommonTextFields: Array<{
  key: SsoProfileField;
  label: string;
  placeholder: string;
  type?: 'password' | 'text';
}> = [
  { key: 'id', label: 'Provider ID', placeholder: 'corporate-oidc' },
  { key: 'name', label: 'Display Name', placeholder: 'Corporate SSO' },
  { key: 'iconUrl', label: 'Icon URL', placeholder: 'https://id.example.com/favicon.ico' },
  { key: 'clientId', label: 'Client ID', placeholder: 'client-id' },
  { key: 'clientSecret', label: 'Client Secret', placeholder: 'client-secret', type: 'password' },
  { key: 'frontendCallbackUrl', label: 'Frontend Callback URL', placeholder: 'https://app.example.com/login' },
  {
    key: 'redirectUri',
    label: 'Backend Redirect URI',
    placeholder: 'https://api.example.com/api/auth/sso/callback',
  },
  { key: 'requestTimeoutMs', label: 'Request Timeout (ms)', placeholder: '10000' },
  { key: 'scopes', label: 'Scopes', placeholder: 'openid profile email' },
];

const ssoOAuth2TextFields: Array<{
  key: SsoProfileField;
  label: string;
  placeholder: string;
}> = [
  { key: 'authorizationUrl', label: 'Authorization URL', placeholder: 'https://id.example.com/oauth2/authorize' },
  { key: 'tokenUrl', label: 'Token URL', placeholder: 'https://id.example.com/oauth2/token' },
  { key: 'userInfoUrl', label: 'UserInfo URL', placeholder: 'https://id.example.com/oauth2/userinfo' },
  { key: 'subjectField', label: 'Subject Field', placeholder: 'sub' },
  { key: 'emailField', label: 'Email Field', placeholder: 'email' },
  { key: 'emailVerifiedField', label: 'Email Verified Field', placeholder: 'email_verified' },
  { key: 'displayNameField', label: 'Display Name Field', placeholder: 'name' },
  { key: 'usernameField', label: 'Username Field', placeholder: 'preferred_username' },
];

function SsoProfilesField({
  appDomain,
  disabled,
  onValueChange,
  value,
}: {
  appDomain: string;
  disabled: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const profiles = parseProfileArray(value, isProfileObject).map((profile) =>
    normalizeSsoProfileDraft(profile, appDomain),
  );
  const updateProfiles = (nextProfiles: SsoProfileDraft[]) => {
    onValueChange(JSON.stringify(nextProfiles.map(normalizeSsoProfileForStorage)));
  };
  const updateProfile = (index: number, field: SsoProfileField, fieldValue: string | boolean) => {
    updateProfiles(
      profiles.map((profile, profileIndex) => (profileIndex === index ? { ...profile, [field]: fieldValue } : profile)),
    );
  };
  const updateProtocol = (index: number, protocol: SsoProtocol) => {
    updateProfiles(
      profiles.map((profile, profileIndex) =>
        profileIndex === index
          ? {
              ...profile,
              protocol,
            }
          : profile,
      ),
    );
  };
  const addProfile = () => {
    updateProfiles([...profiles, getDefaultSsoProfile(profiles, appDomain)]);
  };
  const removeProfile = (index: number) => {
    updateProfiles(profiles.filter((_, profileIndex) => profileIndex !== index));
  };

  return (
    <div className="grid gap-4">
      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No SSO profiles are configured.
        </div>
      ) : null}
      {profiles.map((profile, index) => (
        <div className="grid gap-4 rounded-md border p-4" key={`${profile.id}-${index}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{profile.name || 'SSO profile'}</div>
              <div className="truncate text-xs text-muted-foreground">{profile.id || 'Provider ID is required'}</div>
            </div>
            <Button
              disabled={disabled}
              onClick={() => removeProfile(index)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2Icon />
              <span className="sr-only">Remove SSO profile</span>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`setup-sso-profile-${index}-protocol`}>Protocol</Label>
              <NativeSelect
                disabled={disabled}
                id={`setup-sso-profile-${index}-protocol`}
                onChange={(event) => updateProtocol(index, event.target.value as SsoProtocol)}
                value={profile.protocol}
              >
                {ssoProtocolOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <SsoProfileBooleanSelect
              disabled={disabled}
              id={`setup-sso-profile-${index}-login-enabled`}
              label="Provider Login Access"
              onChange={(enabled) => updateProfile(index, 'loginEnabled', enabled)}
              value={profile.loginEnabled}
            />
            <SsoProfileBooleanSelect
              disabled={disabled}
              id={`setup-sso-profile-${index}-binding-enabled`}
              label="User Binding Access"
              onChange={(enabled) => updateProfile(index, 'bindingEnabled', enabled)}
              value={profile.bindingEnabled}
            />
            {ssoCommonTextFields.map((field) => (
              <ProfileTextInput
                disabled={disabled}
                id={`setup-sso-profile-${index}-${field.key}`}
                key={field.key}
                label={field.label}
                onChange={(fieldValue) => updateProfile(index, field.key, fieldValue)}
                placeholder={field.placeholder}
                type={field.type}
                value={String(profile[field.key])}
              />
            ))}
            {profile.protocol === 'oidc' ? (
              <ProfileTextInput
                disabled={disabled}
                id={`setup-sso-profile-${index}-issuer-url`}
                label="Issuer URL"
                onChange={(fieldValue) => updateProfile(index, 'issuerUrl', fieldValue)}
                placeholder="https://id.example.com/realms/main"
                value={profile.issuerUrl}
              />
            ) : (
              ssoOAuth2TextFields.map((field) => (
                <ProfileTextInput
                  disabled={disabled}
                  id={`setup-sso-profile-${index}-${field.key}`}
                  key={field.key}
                  label={field.label}
                  onChange={(fieldValue) => updateProfile(index, field.key, fieldValue)}
                  placeholder={field.placeholder}
                  value={String(profile[field.key])}
                />
              ))
            )}
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          Add SSO profile
        </Button>
      </div>
    </div>
  );
}

function SsoProfileBooleanSelect({
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value === 'true')}
        value={String(value)}
      >
        <NativeSelectOption value="true">Enabled</NativeSelectOption>
        <NativeSelectOption value="false">Disabled</NativeSelectOption>
      </NativeSelect>
    </div>
  );
}

function isEmptySsoProfilesValue(value: string | undefined) {
  return parseProfileArray(value ?? '[]', isProfileObject).length === 0;
}

function normalizeSsoProfileDraft(profile: Record<string, unknown>, appDomain?: string): SsoProfileDraft {
  const defaults = getDefaultSsoProfileBase(appDomain);
  const rawScopes = profile.scopes;
  const scopes = Array.isArray(rawScopes) ? rawScopes.join(' ') : typeof rawScopes === 'string' ? rawScopes : '';

  return {
    ...defaults,
    id: typeof profile.id === 'string' ? profile.id : 'oidc',
    name: typeof profile.name === 'string' ? profile.name : defaults.name,
    iconUrl: typeof profile.iconUrl === 'string' ? profile.iconUrl : '',
    protocol: profile.protocol === 'oauth2' ? 'oauth2' : 'oidc',
    loginEnabled: typeof profile.loginEnabled === 'boolean' ? profile.loginEnabled : true,
    bindingEnabled: typeof profile.bindingEnabled === 'boolean' ? profile.bindingEnabled : true,
    clientId: typeof profile.clientId === 'string' ? profile.clientId : '',
    clientSecret: typeof profile.clientSecret === 'string' ? profile.clientSecret : '',
    frontendCallbackUrl:
      typeof profile.frontendCallbackUrl === 'string' ? profile.frontendCallbackUrl : defaults.frontendCallbackUrl,
    redirectUri: typeof profile.redirectUri === 'string' ? profile.redirectUri : defaults.redirectUri,
    requestTimeoutMs:
      profile.requestTimeoutMs === undefined ? defaults.requestTimeoutMs : String(profile.requestTimeoutMs),
    scopes: scopes || defaults.scopes,
    issuerUrl: typeof profile.issuerUrl === 'string' ? profile.issuerUrl : '',
    authorizationUrl: typeof profile.authorizationUrl === 'string' ? profile.authorizationUrl : '',
    tokenUrl: typeof profile.tokenUrl === 'string' ? profile.tokenUrl : '',
    userInfoUrl: typeof profile.userInfoUrl === 'string' ? profile.userInfoUrl : '',
    subjectField: typeof profile.subjectField === 'string' ? profile.subjectField : defaults.subjectField,
    emailField: typeof profile.emailField === 'string' ? profile.emailField : defaults.emailField,
    emailVerifiedField:
      typeof profile.emailVerifiedField === 'string' ? profile.emailVerifiedField : defaults.emailVerifiedField,
    displayNameField:
      typeof profile.displayNameField === 'string' ? profile.displayNameField : defaults.displayNameField,
    usernameField: typeof profile.usernameField === 'string' ? profile.usernameField : defaults.usernameField,
  };
}

function getDefaultSsoProfile(profiles: SsoProfileDraft[], appDomain?: string): SsoProfileDraft {
  const defaults = getDefaultSsoProfileBase(appDomain);
  const usedIds = new Set(profiles.map((profile) => profile.id));
  let id = 'oidc';
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `oidc-${suffix}`;
    suffix += 1;
  }

  return {
    ...defaults,
    id,
  };
}

function normalizeSsoProfileForStorage(profile: SsoProfileDraft) {
  const base = {
    id: profile.id,
    name: profile.name,
    ...(profile.iconUrl.trim() ? { iconUrl: profile.iconUrl } : {}),
    protocol: profile.protocol,
    loginEnabled: profile.loginEnabled,
    bindingEnabled: profile.bindingEnabled,
    clientId: profile.clientId,
    clientSecret: profile.clientSecret,
    frontendCallbackUrl: profile.frontendCallbackUrl,
    redirectUri: profile.redirectUri,
    requestTimeoutMs: profile.requestTimeoutMs,
    scopes: profile.scopes
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  };

  if (profile.protocol === 'oauth2') {
    return {
      ...base,
      authorizationUrl: profile.authorizationUrl,
      tokenUrl: profile.tokenUrl,
      userInfoUrl: profile.userInfoUrl,
      subjectField: profile.subjectField,
      emailField: profile.emailField,
      emailVerifiedField: profile.emailVerifiedField,
      displayNameField: profile.displayNameField,
      usernameField: profile.usernameField,
    };
  }

  return {
    ...base,
    issuerUrl: profile.issuerUrl,
  };
}

type SmsProfileCountryCode = '+86' | '+852' | '+853';
type SmsProfileType = 'MKT' | 'NOTIFY' | 'OTP';

interface SmsProfileDraft {
  phoneCountryCode: SmsProfileCountryCode;
  apiVersion: '2017-05-25' | '2018-05-01';
  operation: 'SendMessageToGlobe' | 'SendSms';
  regionId: string;
  endpoint: string;
  accessKeyId: string;
  accessKeySecret: string;
  signName?: string;
  templateCode?: string;
  messageTemplate?: string;
  senderId?: string;
  type?: SmsProfileType;
}

const smsCountryCodeOptions: Array<{ label: string; value: SmsProfileCountryCode }> = [
  { label: 'China Mainland (+86)', value: '+86' },
  { label: 'Hong Kong, China (+852)', value: '+852' },
  { label: 'Macao, China (+853)', value: '+853' },
];

const smsProfileTypeOptions: Array<{ label: string; value: SmsProfileType }> = [
  { label: 'OTP', value: 'OTP' },
  { label: 'Notification', value: 'NOTIFY' },
  { label: 'Marketing', value: 'MKT' },
];

const defaultSmsProfiles: Record<SmsProfileCountryCode, SmsProfileDraft> = {
  '+86': {
    phoneCountryCode: '+86',
    apiVersion: '2017-05-25',
    operation: 'SendSms',
    regionId: 'cn-hangzhou',
    endpoint: 'dysmsapi.aliyuncs.com',
    accessKeyId: '',
    accessKeySecret: '',
    signName: '',
    templateCode: '',
  },
  '+852': {
    phoneCountryCode: '+852',
    apiVersion: '2018-05-01',
    operation: 'SendMessageToGlobe',
    regionId: 'ap-southeast-1',
    endpoint: 'dysmsapi.ap-southeast-1.aliyuncs.com',
    accessKeyId: '',
    accessKeySecret: '',
    messageTemplate: 'Your verification code is ${code}.',
    senderId: '',
    type: 'OTP',
  },
  '+853': {
    phoneCountryCode: '+853',
    apiVersion: '2018-05-01',
    operation: 'SendMessageToGlobe',
    regionId: 'ap-southeast-1',
    endpoint: 'dysmsapi.ap-southeast-1.aliyuncs.com',
    accessKeyId: '',
    accessKeySecret: '',
    messageTemplate: 'Your verification code is ${code}.',
    senderId: '',
    type: 'OTP',
  },
};

const domesticSmsProfileFields = [
  {
    key: 'signName',
    label: 'Sign Name',
  },
  {
    key: 'templateCode',
    label: 'Template Code',
  },
] as const;

const internationalSmsProfileFields = [
  {
    key: 'senderId',
    label: 'Sender ID',
  },
  {
    key: 'messageTemplate',
    label: 'Message Template',
  },
] as const;

function SmsProfilesField({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const profiles = parseProfileArray(value, isSmsProfileDraft).map((profile) => ({
    ...getDefaultSmsProfile(profile.phoneCountryCode),
    ...profile,
  }));
  const unusedCountryCode = smsCountryCodeOptions.find(
    (option) => !profiles.some((profile) => profile.phoneCountryCode === option.value),
  )?.value;
  const updateProfiles = (nextProfiles: SmsProfileDraft[]) => {
    onValueChange(JSON.stringify(nextProfiles.map(normalizeSmsProfileForStorage)));
  };
  const updateProfile = (index: number, field: keyof SmsProfileDraft, fieldValue: string) => {
    updateProfiles(
      profiles.map((profile, profileIndex) => (profileIndex === index ? { ...profile, [field]: fieldValue } : profile)),
    );
  };
  const updateCountryCode = (index: number, countryCode: SmsProfileCountryCode) => {
    const current = profiles[index];

    updateProfiles(
      profiles.map((profile, profileIndex) =>
        profileIndex === index
          ? {
              ...getDefaultSmsProfile(countryCode),
              accessKeyId: current?.accessKeyId ?? '',
              accessKeySecret: current?.accessKeySecret ?? '',
            }
          : profile,
      ),
    );
  };
  const addProfile = () => {
    if (unusedCountryCode) {
      updateProfiles([...profiles, getDefaultSmsProfile(unusedCountryCode)]);
    }
  };
  const removeProfile = (index: number) => {
    updateProfiles(profiles.filter((_, profileIndex) => profileIndex !== index));
  };

  return (
    <div className="grid gap-4">
      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No SMS country code profiles are configured.
        </div>
      ) : null}
      {profiles.map((profile, index) => (
        <div className="grid gap-4 rounded-md border p-4" key={`${profile.phoneCountryCode}-${index}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{getSmsCountryCodeLabel(profile.phoneCountryCode)}</div>
            <Button
              disabled={disabled}
              onClick={() => removeProfile(index)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2Icon />
              <span className="sr-only">Remove SMS profile</span>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`setup-sms-profile-${index}-country`}>Country Code</Label>
              <NativeSelect
                disabled={disabled}
                id={`setup-sms-profile-${index}-country`}
                onChange={(event) => updateCountryCode(index, event.target.value as SmsProfileCountryCode)}
                value={profile.phoneCountryCode}
              >
                {smsCountryCodeOptions.map((option) => (
                  <NativeSelectOption
                    disabled={
                      option.value !== profile.phoneCountryCode &&
                      profiles.some((smsProfile) => smsProfile.phoneCountryCode === option.value)
                    }
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <ProfileTextInput
              disabled
              value={profile.apiVersion}
              id={`setup-sms-profile-${index}-api-version`}
              label="API Version"
            />
            <ProfileTextInput
              disabled
              value={profile.operation}
              id={`setup-sms-profile-${index}-operation`}
              label="Operation"
            />
            <ProfileTextInput
              disabled
              value={profile.endpoint}
              id={`setup-sms-profile-${index}-endpoint`}
              label="Endpoint"
            />
            <ProfileTextInput
              disabled
              value={profile.regionId}
              id={`setup-sms-profile-${index}-region`}
              label="Region ID"
            />
            <ProfileTextInput
              disabled={disabled}
              id={`setup-sms-profile-${index}-access-key-id`}
              label="Access Key ID"
              onChange={(fieldValue) => updateProfile(index, 'accessKeyId', fieldValue)}
              value={profile.accessKeyId}
            />
            <ProfileTextInput
              disabled={disabled}
              id={`setup-sms-profile-${index}-access-key-secret`}
              label="Access Key Secret"
              onChange={(fieldValue) => updateProfile(index, 'accessKeySecret', fieldValue)}
              type="password"
              value={profile.accessKeySecret}
            />
            {profile.phoneCountryCode === '+86'
              ? domesticSmsProfileFields.map((field) => (
                  <ProfileTextInput
                    disabled={disabled}
                    id={`setup-sms-profile-${index}-${field.key}`}
                    key={field.key}
                    label={field.label}
                    onChange={(fieldValue) => updateProfile(index, field.key, fieldValue)}
                    value={profile[field.key] ?? ''}
                  />
                ))
              : internationalSmsProfileFields.map((field) => (
                  <ProfileTextInput
                    disabled={disabled}
                    id={`setup-sms-profile-${index}-${field.key}`}
                    key={field.key}
                    label={field.label}
                    onChange={(fieldValue) => updateProfile(index, field.key, fieldValue)}
                    value={profile[field.key] ?? ''}
                  />
                ))}
            {profile.phoneCountryCode === '+86' ? null : (
              <div className="grid gap-2">
                <Label htmlFor={`setup-sms-profile-${index}-type`}>Message Type</Label>
                <NativeSelect
                  disabled={disabled}
                  id={`setup-sms-profile-${index}-type`}
                  onChange={(event) => updateProfile(index, 'type', event.target.value)}
                  value={profile.type ?? 'OTP'}
                >
                  {smsProfileTypeOptions.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled || !unusedCountryCode} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          Add SMS profile
        </Button>
      </div>
    </div>
  );
}

function isSmsProfileDraft(value: unknown): value is SmsProfileDraft {
  if (!isProfileObject(value)) {
    return false;
  }

  const profile = value;

  return (
    (profile.phoneCountryCode === '+86' ||
      profile.phoneCountryCode === '+852' ||
      profile.phoneCountryCode === '+853') &&
    typeof profile.apiVersion === 'string' &&
    typeof profile.operation === 'string' &&
    typeof profile.regionId === 'string' &&
    typeof profile.endpoint === 'string' &&
    typeof profile.accessKeyId === 'string' &&
    typeof profile.accessKeySecret === 'string'
  );
}

function getDefaultSmsProfile(countryCode: SmsProfileCountryCode): SmsProfileDraft {
  return { ...defaultSmsProfiles[countryCode] };
}

function normalizeSmsProfileForStorage(profile: SmsProfileDraft) {
  if (profile.phoneCountryCode === '+86') {
    return {
      phoneCountryCode: profile.phoneCountryCode,
      apiVersion: '2017-05-25',
      operation: 'SendSms',
      regionId: profile.regionId,
      endpoint: 'dysmsapi.aliyuncs.com',
      accessKeyId: profile.accessKeyId,
      accessKeySecret: profile.accessKeySecret,
      signName: profile.signName ?? '',
      templateCode: profile.templateCode ?? '',
    };
  }

  return {
    phoneCountryCode: profile.phoneCountryCode,
    apiVersion: '2018-05-01',
    operation: 'SendMessageToGlobe',
    regionId: 'ap-southeast-1',
    endpoint: 'dysmsapi.ap-southeast-1.aliyuncs.com',
    accessKeyId: profile.accessKeyId,
    accessKeySecret: profile.accessKeySecret,
    messageTemplate: profile.messageTemplate ?? '',
    ...(profile.senderId?.trim() ? { senderId: profile.senderId } : {}),
    type: profile.type ?? 'OTP',
  };
}

function getSmsCountryCodeLabel(countryCode: SmsProfileCountryCode) {
  return smsCountryCodeOptions.find((option) => option.value === countryCode)?.label ?? countryCode;
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
              <h3 className="text-sm font-semibold">Existing users detected</h3>
              <p className="text-sm leading-6">
                The selected database already contains available users. Administrator creation is skipped, and existing
                users are retained.
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
        autoComplete="username"
        disabled={disabled}
        field="username"
        label="Administrator username"
        onChange={onChange('username')}
        value={administrator.username}
      />
      <AdministratorField
        autoComplete="name"
        disabled={disabled}
        field="displayName"
        label="Administrator display name"
        onChange={onChange('displayName')}
        value={administrator.displayName}
      />
      <AdministratorField
        autoComplete="email"
        disabled={disabled}
        field="email"
        label="Administrator email"
        onChange={onChange('email')}
        type="email"
        value={administrator.email}
      />
      <AdministratorField
        autoComplete="new-password"
        disabled={disabled}
        field="password"
        label="Administrator password"
        onChange={onChange('password')}
        type="password"
        value={administrator.password}
      />
      <AdministratorField
        autoComplete="new-password"
        disabled={disabled}
        field="confirmPassword"
        label="Confirm administrator password"
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
    ['File storage', environment.FILE_STORAGE_DRIVER],
    ['Email', environment.EMAIL_VERIFICATION_SERVICE],
    ['SMS', environment.SMS_VERIFICATION_SERVICE],
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
          Sensitive configuration
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
            <span>No sensitive optional values are configured.</span>
          )}
        </div>
      </section>
    </div>
  );
}

function getPrimaryActionLabel(stepId: string, environment: SetupEnvironment, hasExistingUsers: boolean) {
  if (stepId === 'database') {
    return 'Verify database and continue';
  }

  if (stepId === 'administrator' && hasExistingUsers) {
    return 'Continue';
  }

  if (stepId === 'cache' && environment.CACHE_STORE === 'redis') {
    return 'Verify Redis and continue';
  }

  if (stepId === 'file-storage' && environment.FILE_STORAGE_DRIVER === 'oss') {
    return 'Verify OSS and continue';
  }

  if (stepId === 'file-storage') {
    return 'Verify storage and continue';
  }

  if (stepId === 'logging' && hasLogTarget(environment, 'sls')) {
    return 'Verify SLS and continue';
  }

  if (stepId === 'email' && environment.EMAIL_VERIFICATION_SERVICE === 'smtp') {
    return 'Verify SMTP and continue';
  }

  if (stepId === 'sms' && environment.SMS_VERIFICATION_SERVICE === 'aliyun') {
    return 'Verify SMS and continue';
  }

  if (stepId === 'sso' && environment.SSO_ENABLED === 'true') {
    return 'Verify SSO and continue';
  }

  if (stepId === 'review') {
    return 'Complete setup';
  }

  return 'Validate and continue';
}

function getAdministratorValidationError(administrator: SetupAdministrator) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/.test(administrator.username.trim())) {
    return 'The administrator username may contain letters, numbers, underscores, and hyphens.';
  }

  if (administrator.username.trim().length < 3) {
    return 'The administrator username must contain at least 3 characters.';
  }

  if (administrator.username.trim().length > 32) {
    return 'The administrator username must contain at most 32 characters.';
  }

  if (administrator.displayName.trim().length < 2) {
    return 'The administrator display name must contain at least 2 characters.';
  }

  if (administrator.displayName.trim().length > 64) {
    return 'The administrator display name must contain at most 64 characters.';
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
    key === 'CACHE_REDIS_URL' ||
    key === 'EMAIL_SMTP_PROFILES' ||
    key === 'SMS_ALICLOUD_PROFILES' ||
    key === 'SSO_PROFILES'
  );
}

function isEnvironmentValidationStep(stepId: string): stepId is SetupEnvironmentStepId {
  return stepId === 'administrator' || stepId === 'runtime' || stepId === 'scheduler' || stepId === 'security';
}

function generateSecret() {
  const bytes = new Uint8Array(48);

  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function shouldReplaceDomainDefault(value: string | undefined, appDomain: string | undefined) {
  const normalizedValue = value?.trim() ?? '';
  const normalizedDomain = getOriginOrValue(appDomain ?? '', appDomain ?? '');

  return !normalizedValue || normalizedValue === normalizedDomain;
}

function updateDefaultSsoProfileUrlsForDomain(value: string, previousDomain: string | undefined, nextDomain: string) {
  const profiles = parseProfileArray(value, isProfileObject);

  if (profiles.length === 0) {
    return value;
  }

  const previousDefaults = getDefaultSsoProfileBase(previousDomain);
  const fallbackDefaults = getDefaultSsoProfileBase(fallbackAppDomain);
  const nextDefaults = getDefaultSsoProfileBase(nextDomain);

  return JSON.stringify(
    profiles
      .map((profile) => {
        const draft = normalizeSsoProfileDraft(profile, previousDomain);

        return {
          ...draft,
          frontendCallbackUrl: shouldReplaceUrlDefault(
            draft.frontendCallbackUrl,
            previousDefaults.frontendCallbackUrl,
            fallbackDefaults.frontendCallbackUrl,
          )
            ? nextDefaults.frontendCallbackUrl
            : draft.frontendCallbackUrl,
          redirectUri: shouldReplaceUrlDefault(
            draft.redirectUri,
            previousDefaults.redirectUri,
            fallbackDefaults.redirectUri,
          )
            ? nextDefaults.redirectUri
            : draft.redirectUri,
        };
      })
      .map(normalizeSsoProfileForStorage),
  );
}

function shouldReplaceUrlDefault(value: string, ...defaultValues: string[]) {
  const normalizedValue = value.trim();

  return !normalizedValue || defaultValues.includes(normalizedValue);
}

function getOriginOrValue(value: string, fallback: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

function getUrlFromDomain(domain: string, relativePath: string, fallback: string) {
  try {
    return new URL(relativePath, domain).toString();
  } catch {
    return fallback;
  }
}

function getCurrentOrigin(fallback: string) {
  return typeof window === 'undefined' ? fallback : window.location.origin || fallback;
}

export default Index;
