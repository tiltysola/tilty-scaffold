import { type ChangeEvent } from 'react';
import { useIntl } from 'react-intl';

import { InfoIcon, type LucideIcon } from 'lucide-react';

import { type SetupAdministrator } from '@/lib/setup';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';

import { administratorFieldHelp } from './definitions';
import { PasswordInput } from './FormControls';

export function ActiveStepIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}

export function AdministratorStep({
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
  const intl = useIntl();

  if (hasExistingUsers) {
    return (
      <div className="grid max-w-3xl gap-5">
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-start gap-3">
            <InfoIcon className="mt-0.5 size-5 shrink-0" />
            <div className="grid gap-1">
              <h3 className="text-sm font-semibold">{intl.formatMessage({ id: 'setup.existing.users.title' })}</h3>
              <p className="text-sm leading-6">{intl.formatMessage({ id: 'setup.existing.users.description' })}</p>
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
        label={intl.formatMessage({ id: 'setup.admin.username' })}
        onChange={onChange('username')}
        value={administrator.username}
      />
      <AdministratorField
        autoComplete="name"
        disabled={disabled}
        field="displayName"
        label={intl.formatMessage({ id: 'setup.admin.display.name' })}
        onChange={onChange('displayName')}
        value={administrator.displayName}
      />
      <AdministratorField
        autoComplete="email"
        disabled={disabled}
        field="email"
        label={intl.formatMessage({ id: 'setup.admin.email' })}
        onChange={onChange('email')}
        type="email"
        value={administrator.email}
      />
      <AdministratorField
        autoComplete="new-password"
        disabled={disabled}
        field="password"
        label={intl.formatMessage({ id: 'setup.admin.password' })}
        onChange={onChange('password')}
        type="password"
        value={administrator.password}
      />
      <AdministratorField
        autoComplete="new-password"
        disabled={disabled}
        field="confirmPassword"
        label={intl.formatMessage({ id: 'setup.admin.confirm.password' })}
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
  const intl = useIntl();
  const inputId = `setup-admin-${field}`;
  const descriptionId = `${inputId}-description`;
  const help = administratorFieldHelp[field];
  const description = intl.formatMessage({ id: `setup.admin.${field}.description` });
  const placeholder = help.placeholderMessageId
    ? intl.formatMessage({ id: help.placeholderMessageId })
    : help.placeholder;

  return (
    <div className="grid gap-2">
      <div className="grid self-start content-start gap-1 lg:pt-2">
        <Label className="text-sm font-medium" htmlFor={inputId}>
          {label}
        </Label>
        <p className="text-xs leading-5 text-muted-foreground" id={descriptionId}>
          {description}
        </p>
      </div>
      <div className="min-w-0 max-w-3xl">
        {type === 'password' ? (
          <PasswordInput
            aria-describedby={descriptionId}
            autoComplete={autoComplete}
            disabled={disabled}
            id={inputId}
            onChange={onChange}
            placeholder={placeholder}
            value={value}
          />
        ) : (
          <Input
            aria-describedby={descriptionId}
            autoComplete={autoComplete}
            disabled={disabled}
            id={inputId}
            onChange={onChange}
            placeholder={placeholder}
            type={type}
            value={value}
          />
        )}
      </div>
    </div>
  );
}
