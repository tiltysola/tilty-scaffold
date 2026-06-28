import { type ReactNode, useState } from 'react';

import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shadcn/components/ui/sheet';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

import { ConfigurationTextInput, SelectControl } from './FormControls';
import { isProfileObject, parseProfileArray } from './utils';

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
type SmtpTextField = {
  key: SmtpProfileField;
  label: string;
  placeholder: string;
  type?: 'password' | 'text';
};

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

const smtpServerTextFields: SmtpTextField[] = [
  { key: 'host', label: 'SMTP Host', placeholder: 'smtp.example.com' },
  { key: 'port', label: 'SMTP Port', placeholder: '465' },
  { key: 'from', label: 'SMTP Sender', placeholder: 'Tilty <no-reply@example.com>' },
];

const smtpCredentialTextFields: SmtpTextField[] = [
  { key: 'username', label: 'SMTP Username', placeholder: 'no-reply@example.com' },
  { key: 'password', label: 'SMTP Password', placeholder: 'SMTP password or app token', type: 'password' },
];

const smtpOptionsTextFields: SmtpTextField[] = [
  { key: 'timeoutMs', label: 'SMTP Request Timeout (ms)', placeholder: '10000' },
];

export function SmtpProfilesField({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [activeProfileIndex, setActiveProfileIndex] = useState<number | null>(null);
  const profiles = parseProfileArray(value, isProfileObject).map(normalizeSmtpProfileDraft);
  const activeProfile = activeProfileIndex === null ? null : profiles[activeProfileIndex];
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
    setActiveProfileIndex(profiles.length);
  };
  const removeProfile = (index: number) => {
    updateProfiles(profiles.filter((_, profileIndex) => profileIndex !== index));

    if (activeProfileIndex === index) {
      setActiveProfileIndex(null);
    } else if (activeProfileIndex !== null && activeProfileIndex > index) {
      setActiveProfileIndex(activeProfileIndex - 1);
    }
  };

  return (
    <div className="grid gap-4">
      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          No SMTP profiles are configured.
        </div>
      ) : null}
      {profiles.map((profile, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border bg-card/70 p-3"
          key={`${profile.host || 'smtp'}-${index}`}
        >
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-0 truncate text-sm font-medium">{getSmtpProfileLabel(profile, index)}</div>
            </div>
            <div className="truncate text-xs text-muted-foreground">{profile.from || 'SMTP sender is required'}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1 self-start">
            <Button
              disabled={disabled}
              onClick={() => setActiveProfileIndex(index)}
              size="sm"
              type="button"
              variant="outline"
            >
              <PencilIcon />
              Edit
            </Button>
            <ConfirmActionDialog
              confirmLabel="Remove"
              description="This SMTP profile will be removed from the current configuration form. Save changes to apply it."
              onConfirm={() => removeProfile(index)}
              title="Remove SMTP profile?"
            >
              <Button disabled={disabled} size="icon-sm" type="button" variant="destructive">
                <Trash2Icon />
                <span className="sr-only">Remove SMTP profile</span>
              </Button>
            </ConfirmActionDialog>
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          Add SMTP profile
        </Button>
      </div>
      <Sheet
        open={Boolean(activeProfile)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setActiveProfileIndex(null);
          }
        }}
      >
        {activeProfile && activeProfileIndex !== null ? (
          <SmtpProfileSheetContent
            disabled={disabled}
            index={activeProfileIndex}
            onFieldChange={updateProfile}
            profile={activeProfile}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function SmtpProfileSheetContent({
  disabled,
  index,
  onFieldChange,
  profile,
}: {
  disabled: boolean;
  index: number;
  onFieldChange: (index: number, field: SmtpProfileField, value: string | boolean) => void;
  profile: SmtpProfileDraft;
}) {
  return (
    <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
      <SheetHeader className="border-b pr-12">
        <SheetTitle>{getSmtpProfileLabel(profile, index)}</SheetTitle>
        <SheetDescription>{profile.from || 'SMTP sender is required'}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="grid gap-6 py-1 pb-4">
          <SmtpProfileSection title="Server">
            <div className="grid gap-4">
              <SmtpProfileTextFields
                disabled={disabled}
                fields={smtpServerTextFields}
                index={index}
                onFieldChange={onFieldChange}
                profile={profile}
              />
            </div>
          </SmtpProfileSection>
          <SmtpProfileSection title="Credentials">
            <div className="grid gap-4">
              <SmtpProfileTextFields
                disabled={disabled}
                fields={smtpCredentialTextFields}
                index={index}
                onFieldChange={onFieldChange}
                profile={profile}
              />
            </div>
          </SmtpProfileSection>
          <SmtpProfileSection title="Transport">
            <div className="grid gap-4">
              <SmtpProfileBooleanSelect
                disabled={disabled}
                id={`setup-smtp-profile-${index}-secure`}
                label="SMTP Implicit TLS"
                onChange={(enabled) => onFieldChange(index, 'secure', enabled)}
                value={profile.secure}
              />
              <SmtpProfileBooleanSelect
                disabled={disabled}
                falseLabel="Disabled"
                id={`setup-smtp-profile-${index}-starttls`}
                label="SMTP STARTTLS"
                onChange={(enabled) => onFieldChange(index, 'startTls', enabled)}
                trueLabel="Enabled"
                value={profile.startTls}
              />
            </div>
          </SmtpProfileSection>
          <SmtpProfileSection title="Options">
            <div className="grid gap-4">
              <SmtpProfileTextFields
                disabled={disabled}
                fields={smtpOptionsTextFields}
                index={index}
                onFieldChange={onFieldChange}
                profile={profile}
              />
            </div>
          </SmtpProfileSection>
        </div>
      </div>
      <SheetFooter className="border-t">
        <SheetClose asChild>
          <Button type="button">
            <CheckIcon />
            Done
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}

function SmtpProfileSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function SmtpProfileTextFields({
  disabled,
  fields,
  index,
  onFieldChange,
  profile,
}: {
  disabled: boolean;
  fields: SmtpTextField[];
  index: number;
  onFieldChange: (index: number, field: SmtpProfileField, value: string | boolean) => void;
  profile: SmtpProfileDraft;
}) {
  return fields.map((field) => (
    <ConfigurationTextInput
      disabled={disabled}
      id={`setup-smtp-profile-${index}-${field.key}`}
      key={field.key}
      label={field.label}
      onChange={(fieldValue) => onFieldChange(index, field.key, fieldValue)}
      placeholder={field.placeholder}
      type={field.type}
      value={String(profile[field.key])}
    />
  ));
}

function SmtpProfileBooleanSelect({
  disabled,
  falseLabel = 'Disabled',
  id,
  label,
  onChange,
  trueLabel = 'Enabled',
  value,
}: {
  disabled: boolean;
  falseLabel?: string;
  id: string;
  label: string;
  onChange: (value: boolean) => void;
  trueLabel?: string;
  value: boolean;
}) {
  return (
    <SelectControl
      disabled={disabled}
      id={id}
      label={label}
      onValueChange={(fieldValue) => onChange(fieldValue === 'true')}
      options={[
        { label: trueLabel, value: 'true' },
        { label: falseLabel, value: 'false' },
      ]}
      value={String(value)}
    />
  );
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
