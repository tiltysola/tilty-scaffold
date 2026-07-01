import { useIntl } from 'react-intl';

import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { Sheet } from '@/shadcn/components/ui/sheet';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

import {
  SetupProfileBooleanSelect,
  SetupProfileSection,
  SetupProfileSheet,
  type SetupProfileTextField,
  SetupProfileTextFields,
} from './ProfileSheetControls';
import { useProfileListEditor } from './useProfileListEditor';
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

const smtpServerTextFields: Array<SetupProfileTextField<SmtpProfileField>> = [
  { key: 'host' },
  { key: 'port' },
  { key: 'from' },
];

const smtpCredentialTextFields: Array<SetupProfileTextField<SmtpProfileField>> = [
  { key: 'username' },
  { key: 'password', type: 'password' },
];

const smtpOptionsTextFields: Array<SetupProfileTextField<SmtpProfileField>> = [{ key: 'timeoutMs' }];

export function SmtpProfilesField({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const intl = useIntl();
  const profiles = parseProfileArray(value, isProfileObject).map(normalizeSmtpProfileDraft);
  const { activeProfile, activeProfileIndex, closeProfile, openProfile, removeProfile, updateProfile, updateProfiles } =
    useProfileListEditor({
      normalizeForStorage: normalizeSmtpProfileForStorage,
      onValueChange,
      profiles,
    });
  const addProfile = () => {
    updateProfiles([...profiles, { ...defaultSmtpProfile }]);
    openProfile(profiles.length);
  };

  return (
    <div className="grid gap-4">
      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          {intl.formatMessage({ id: 'setup.smtp.profiles.empty' })}
        </div>
      ) : null}
      {profiles.map((profile, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border bg-card/70 p-3"
          key={`${profile.host || 'smtp'}-${index}`}
        >
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-0 truncate text-sm font-medium">{getSmtpProfileLabel(profile, index, intl)}</div>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {profile.from || intl.formatMessage({ id: 'setup.smtp.profiles.sender.required' })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 self-start">
            <Button disabled={disabled} onClick={() => openProfile(index)} size="sm" type="button" variant="outline">
              <PencilIcon />
              {intl.formatMessage({ id: 'common.edit' })}
            </Button>
            <ConfirmActionDialog
              confirmLabel={intl.formatMessage({ id: 'common.remove' })}
              description={intl.formatMessage({ id: 'setup.smtp.profiles.remove.description' })}
              onConfirm={() => removeProfile(index)}
              title={intl.formatMessage({ id: 'setup.remove.smtp.profile.title' })}
            >
              <Button disabled={disabled} size="icon-sm" type="button" variant="destructive">
                <Trash2Icon />
                <span className="sr-only">{intl.formatMessage({ id: 'setup.remove.smtp.profile' })}</span>
              </Button>
            </ConfirmActionDialog>
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          {intl.formatMessage({ id: 'setup.smtp.profiles.add' })}
        </Button>
      </div>
      <Sheet
        open={Boolean(activeProfile)}
        onOpenChange={(open: boolean) => {
          if (!open) {
            closeProfile();
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
  const intl = useIntl();

  return (
    <SetupProfileSheet
      description={profile.from || intl.formatMessage({ id: 'setup.smtp.profiles.sender.required' })}
      title={getSmtpProfileLabel(profile, index, intl)}
    >
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.server' })}>
        <div className="grid gap-4">
          <SetupProfileTextFields
            disabled={disabled}
            fields={smtpServerTextFields}
            idPrefix={`setup-smtp-profile-${index}`}
            messagePrefix="setup.smtp.profile"
            onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
            values={profile}
          />
        </div>
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.credentials' })}>
        <div className="grid gap-4">
          <SetupProfileTextFields
            disabled={disabled}
            fields={smtpCredentialTextFields}
            idPrefix={`setup-smtp-profile-${index}`}
            messagePrefix="setup.smtp.profile"
            onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
            values={profile}
          />
        </div>
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.transport' })}>
        <div className="grid gap-4">
          <SetupProfileBooleanSelect
            disabled={disabled}
            id={`setup-smtp-profile-${index}-secure`}
            label={intl.formatMessage({ id: 'setup.smtp.profile.secure.label' })}
            onChange={(enabled) => onFieldChange(index, 'secure', enabled)}
            value={profile.secure}
          />
          <SetupProfileBooleanSelect
            disabled={disabled}
            id={`setup-smtp-profile-${index}-starttls`}
            label={intl.formatMessage({ id: 'setup.smtp.profile.start.tls.label' })}
            onChange={(enabled) => onFieldChange(index, 'startTls', enabled)}
            value={profile.startTls}
          />
        </div>
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.options' })}>
        <div className="grid gap-4">
          <SetupProfileTextFields
            disabled={disabled}
            fields={smtpOptionsTextFields}
            idPrefix={`setup-smtp-profile-${index}`}
            messagePrefix="setup.smtp.profile"
            onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
            values={profile}
          />
        </div>
      </SetupProfileSection>
    </SetupProfileSheet>
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

function getSmtpProfileLabel(profile: SmtpProfileDraft, index: number, intl: ReturnType<typeof useIntl>) {
  return (
    profile.host.trim() ||
    profile.from.trim() ||
    intl.formatMessage({ id: 'setup.smtp.profiles.default.name' }, { index: index + 1 })
  );
}
