import { useIntl } from 'react-intl';

import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { Sheet } from '@/shadcn/components/ui/sheet';
import { SetupSsoProtocol } from '@tilty/shared/setup';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

import { ConfigurationTextInput, SelectControl } from './FormControls';
import {
  SetupProfileBooleanSelect,
  SetupProfileSection,
  SetupProfileSheet,
  type SetupProfileTextField,
  SetupProfileTextFields,
} from './ProfileSheetControls';
import { useProfileListEditor } from './useProfileListEditor';
import {
  getDefaultSsoProfile,
  isProfileObject,
  normalizeSsoProfileDraft,
  normalizeSsoProfileForStorage,
  parseProfileArray,
  type SsoProfileDraft,
} from './utils';

type SsoProtocol = SsoProfileDraft['protocol'];
type SsoProfileField = keyof SsoProfileDraft;

const ssoProtocolOptions: Array<{ value: SsoProtocol }> = [
  { value: SetupSsoProtocol.Oidc },
  { value: SetupSsoProtocol.Oauth2 },
];

const ssoBasicTextFields: Array<SetupProfileTextField<SsoProfileField>> = [{ key: 'id' }, { key: 'name' }];

const ssoCredentialTextFields: Array<SetupProfileTextField<SsoProfileField>> = [
  { key: 'clientId' },
  { key: 'clientSecret', type: 'password' },
];

const ssoCallbackTextFields: Array<SetupProfileTextField<SsoProfileField>> = [
  { key: 'frontendCallbackUrl' },
  { key: 'redirectUri' },
];

const ssoOAuth2EndpointFields: Array<SetupProfileTextField<SsoProfileField>> = [
  { key: 'authorizationUrl' },
  { key: 'tokenUrl' },
  { key: 'userInfoUrl' },
];

const ssoOptionsTextFields: Array<SetupProfileTextField<SsoProfileField>> = [
  { key: 'requestTimeoutMs' },
  { key: 'scopes' },
  { key: 'iconUrl' },
];

const ssoOAuth2ClaimFields: Array<SetupProfileTextField<SsoProfileField>> = [
  { key: 'subjectField' },
  { key: 'emailField' },
  { key: 'emailVerifiedField' },
  { key: 'displayNameField' },
  { key: 'usernameField' },
];

export function SsoProfilesField({
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
  const intl = useIntl();
  const profiles = parseProfileArray(value, isProfileObject).map((profile) =>
    normalizeSsoProfileDraft(profile, appDomain),
  );
  const { activeProfile, activeProfileIndex, closeProfile, openProfile, removeProfile, updateProfile, updateProfiles } =
    useProfileListEditor({
      normalizeForStorage: normalizeSsoProfileForStorage,
      onValueChange,
      profiles,
    });
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
    openProfile(profiles.length);
  };

  return (
    <div className="grid gap-4">
      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          {intl.formatMessage({ id: 'setup.sso.profiles.empty' })}
        </div>
      ) : null}
      {profiles.map((profile, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border bg-card/70 p-3"
          key={`${profile.id}-${index}`}
        >
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-0 truncate text-sm font-medium">
                {profile.name || intl.formatMessage({ id: 'setup.sso.profiles.default.name' })}
              </div>
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {profile.id || intl.formatMessage({ id: 'setup.sso.profiles.provider.id.required' })}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 self-start">
            <Button disabled={disabled} onClick={() => openProfile(index)} size="sm" type="button" variant="outline">
              <PencilIcon />
              {intl.formatMessage({ id: 'common.edit' })}
            </Button>
            <ConfirmActionDialog
              confirmLabel={intl.formatMessage({ id: 'common.remove' })}
              description={intl.formatMessage({ id: 'setup.sso.profiles.remove.description' })}
              onConfirm={() => removeProfile(index)}
              title={intl.formatMessage({ id: 'setup.remove.sso.profile.title' })}
            >
              <Button disabled={disabled} size="icon-sm" type="button" variant="destructive">
                <Trash2Icon />
                <span className="sr-only">{intl.formatMessage({ id: 'setup.remove.sso.profile' })}</span>
              </Button>
            </ConfirmActionDialog>
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          {intl.formatMessage({ id: 'setup.sso.profiles.add' })}
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
          <SsoProfileSheetContent
            disabled={disabled}
            index={activeProfileIndex}
            onFieldChange={updateProfile}
            onProtocolChange={updateProtocol}
            profile={activeProfile}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function SsoProfileSheetContent({
  disabled,
  index,
  onFieldChange,
  onProtocolChange,
  profile,
}: {
  disabled: boolean;
  index: number;
  onFieldChange: (index: number, field: SsoProfileField, value: string | boolean) => void;
  onProtocolChange: (index: number, protocol: SsoProtocol) => void;
  profile: SsoProfileDraft;
}) {
  const intl = useIntl();

  return (
    <SetupProfileSheet
      description={profile.id || intl.formatMessage({ id: 'setup.sso.profiles.provider.id.required' })}
      title={profile.name || intl.formatMessage({ id: 'setup.sso.profiles.default.name' })}
    >
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.basic' })}>
        <div className="grid gap-4">
          <SelectControl
            disabled={disabled}
            id={`setup-sso-profile-${index}-protocol`}
            label={intl.formatMessage({ id: 'setup.sso.profile.protocol.label' })}
            onValueChange={(fieldValue) => onProtocolChange(index, fieldValue as SsoProtocol)}
            options={ssoProtocolOptions.map((option) => ({
              label: intl.formatMessage({ id: `setup.sso.profile.protocol.${option.value}` }),
              value: option.value,
            }))}
            value={profile.protocol}
          />
          <SetupProfileBooleanSelect
            disabled={disabled}
            id={`setup-sso-profile-${index}-login-enabled`}
            label={intl.formatMessage({ id: 'setup.sso.profile.login.enabled.label' })}
            onChange={(enabled) => onFieldChange(index, 'loginEnabled', enabled)}
            value={profile.loginEnabled}
          />
          <SetupProfileBooleanSelect
            disabled={disabled}
            id={`setup-sso-profile-${index}-binding-enabled`}
            label={intl.formatMessage({ id: 'setup.sso.profile.binding.enabled.label' })}
            onChange={(enabled) => onFieldChange(index, 'bindingEnabled', enabled)}
            value={profile.bindingEnabled}
          />
          <SetupProfileTextFields
            disabled={disabled}
            fields={ssoBasicTextFields}
            idPrefix={`setup-sso-profile-${index}`}
            messagePrefix="setup.sso.profile"
            onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
            values={profile}
          />
        </div>
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.credentials' })}>
        <div className="grid gap-4">
          <SetupProfileTextFields
            disabled={disabled}
            fields={ssoCredentialTextFields}
            idPrefix={`setup-sso-profile-${index}`}
            messagePrefix="setup.sso.profile"
            onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
            values={profile}
          />
        </div>
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.callback.urls' })}>
        <SetupProfileTextFields
          disabled={disabled}
          fields={ssoCallbackTextFields}
          idPrefix={`setup-sso-profile-${index}`}
          messagePrefix="setup.sso.profile"
          onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
          values={profile}
        />
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.provider.endpoint' })}>
        {profile.protocol === SetupSsoProtocol.Oidc ? (
          <ConfigurationTextInput
            disabled={disabled}
            id={`setup-sso-profile-${index}-issuer-url`}
            label={intl.formatMessage({ id: 'setup.sso.profile.issuer.url.label' })}
            onChange={(fieldValue) => onFieldChange(index, 'issuerUrl', fieldValue)}
            placeholder={intl.formatMessage({ id: 'setup.sso.profile.issuer.url.placeholder' })}
            value={profile.issuerUrl}
          />
        ) : (
          <SetupProfileTextFields
            disabled={disabled}
            fields={ssoOAuth2EndpointFields}
            idPrefix={`setup-sso-profile-${index}`}
            messagePrefix="setup.sso.profile"
            onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
            values={profile}
          />
        )}
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.options' })}>
        <div className="grid gap-4">
          <SetupProfileTextFields
            disabled={disabled}
            fields={ssoOptionsTextFields}
            idPrefix={`setup-sso-profile-${index}`}
            messagePrefix="setup.sso.profile"
            onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
            values={profile}
          />
        </div>
      </SetupProfileSection>
      {profile.protocol === SetupSsoProtocol.Oauth2 ? (
        <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.claims' })}>
          <div className="grid gap-4">
            <SetupProfileTextFields
              disabled={disabled}
              fields={ssoOAuth2ClaimFields}
              idPrefix={`setup-sso-profile-${index}`}
              messagePrefix="setup.sso.profile"
              onFieldChange={(field, fieldValue) => onFieldChange(index, field, fieldValue)}
              values={profile}
            />
          </div>
        </SetupProfileSection>
      ) : null}
    </SetupProfileSheet>
  );
}
