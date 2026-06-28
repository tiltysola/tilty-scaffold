import { type ChangeEvent } from 'react';

import { RefreshCwIcon } from 'lucide-react';

import { type SetupEnvironment } from '@/lib/setup';
import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import { Textarea } from '@/shadcn/components/ui/textarea';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

import { type SetupFieldDefinition, setupFieldHelp } from './definitions';
import { PasswordInput, SelectControl } from './FormControls';
import { SmsProfilesField } from './SmsProfilesField';
import { SmtpProfilesField } from './SmtpProfilesField';
import { SsoProfilesField } from './SsoProfilesField';
import { fieldGroupsNeedHeader, getFieldGroups } from './utils';

export function EnvironmentStep({
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
  onChange: (key: string) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onValueChange: (key: string, value: string) => void;
  onRegenerateSecret: () => void;
}) {
  const shouldShowGroupHeaders = fieldGroupsNeedHeader(getFieldGroups(fields));
  const visibleFields = fields.filter((field) => !field.visible || field.visible(environment));
  const fieldGroups = getFieldGroups(visibleFields);

  return (
    <div className="grid w-full max-w-5xl gap-6">
      {fieldGroups.map((group) => (
        <section className="grid gap-4 border-b border-border/70 pb-6 last:border-b-0 last:pb-0" key={group.name}>
          {shouldShowGroupHeaders ? <h3 className="text-sm font-semibold text-foreground">{group.name}</h3> : null}
          <div className="grid gap-4">
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
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onValueChange: (value: string) => void;
  onRegenerateSecret?: () => void;
  value: string;
}) {
  const inputId = `setup-${field.key.toLowerCase().replaceAll('_', '-')}`;
  const descriptionId = `${inputId}-description`;
  const help = setupFieldHelp[field.key];
  const labelFor =
    field.kind === 'sms-profiles' || field.kind === 'smtp-profiles' || field.kind === 'sso-profiles'
      ? undefined
      : inputId;

  return (
    <div className="grid min-w-0 items-start gap-2 lg:grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)] lg:gap-4">
      <div className="grid min-w-0 self-start content-start gap-1 lg:pt-2">
        <Label className="text-sm font-medium" htmlFor={labelFor}>
          {field.label}
        </Label>
        {help?.description ? (
          <p className="text-xs leading-5 text-muted-foreground" id={descriptionId}>
            {help.description}
          </p>
        ) : null}
      </div>
      <div className="min-w-0">
        <SetupFieldControl
          describedBy={help?.description ? descriptionId : undefined}
          disabled={disabled}
          environment={environment}
          field={field}
          inputId={inputId}
          onChange={onChange}
          onRegenerateSecret={onRegenerateSecret}
          onValueChange={onValueChange}
          placeholder={help?.placeholder ?? field.placeholder}
          value={value}
        />
      </div>
    </div>
  );
}

function SetupFieldControl({
  describedBy,
  disabled,
  environment,
  field,
  inputId,
  onChange,
  onValueChange,
  onRegenerateSecret,
  placeholder,
  value,
}: {
  describedBy?: string;
  disabled: boolean;
  environment: SetupEnvironment;
  field: SetupFieldDefinition;
  inputId: string;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onValueChange: (value: string) => void;
  onRegenerateSecret?: () => void;
  placeholder?: string;
  value: string;
}) {
  if (field.kind === 'select') {
    return (
      <SelectControl
        aria-describedby={describedBy}
        disabled={disabled}
        id={inputId}
        onValueChange={onValueChange}
        options={field.options ?? []}
        value={value}
      />
    );
  }

  if (field.kind === 'textarea') {
    return (
      <Textarea
        aria-describedby={describedBy}
        disabled={disabled}
        id={inputId}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
    );
  }

  if (field.kind === 'smtp-profiles') {
    return <SmtpProfilesField disabled={disabled} onValueChange={onValueChange} value={value} />;
  }

  if (field.kind === 'sms-profiles') {
    return <SmsProfilesField disabled={disabled} onValueChange={onValueChange} value={value} />;
  }

  if (field.kind === 'sso-profiles') {
    return (
      <SsoProfilesField
        appDomain={environment.APP_DOMAIN ?? ''}
        disabled={disabled}
        onValueChange={onValueChange}
        value={value}
      />
    );
  }

  const input =
    field.kind === 'password' ? (
      <PasswordInput
        aria-describedby={describedBy}
        autoComplete="new-password"
        disabled={disabled}
        id={inputId}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
    ) : (
      <Input
        aria-describedby={describedBy}
        autoComplete="off"
        disabled={disabled}
        id={inputId}
        onChange={onChange}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    );

  if (!onRegenerateSecret) {
    return input;
  }

  return (
    <div className="flex min-w-0 gap-2">
      {input}
      <ConfirmActionDialog
        confirmLabel="Regenerate"
        description="The token signing secret will be replaced in this form. Saved changes can invalidate existing authentication tokens."
        onConfirm={onRegenerateSecret}
        title="Regenerate token signing secret?"
      >
        <Button disabled={disabled} size="icon" type="button" variant="outline">
          <RefreshCwIcon />
          <span className="sr-only">Regenerate token signing secret</span>
        </Button>
      </ConfirmActionDialog>
    </div>
  );
}
