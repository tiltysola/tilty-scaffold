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
type SsoTextField = {
  key: SsoProfileField;
  label: string;
  placeholder: string;
  type?: 'password' | 'text';
};

const ssoProtocolOptions: Array<{ label: string; value: SsoProtocol }> = [
  { label: 'OpenID Connect', value: 'oidc' },
  { label: 'OAuth 2.0', value: 'oauth2' },
];

const ssoBasicTextFields: SsoTextField[] = [
  { key: 'id', label: 'Provider ID', placeholder: 'corporate-oidc' },
  { key: 'name', label: 'Display Name', placeholder: 'Corporate SSO' },
];

const ssoCredentialTextFields: SsoTextField[] = [
  { key: 'clientId', label: 'Client ID', placeholder: 'client-id' },
  { key: 'clientSecret', label: 'Client Secret', placeholder: 'client-secret', type: 'password' },
];

const ssoCallbackTextFields: SsoTextField[] = [
  { key: 'frontendCallbackUrl', label: 'Frontend Callback URL', placeholder: 'https://app.example.com/sso/callback' },
  {
    key: 'redirectUri',
    label: 'Backend Redirect URI',
    placeholder: 'https://api.example.com/api/auth/sso/callback',
  },
];

const ssoOAuth2EndpointFields: SsoTextField[] = [
  { key: 'authorizationUrl', label: 'Authorization URL', placeholder: 'https://id.example.com/oauth2/authorize' },
  { key: 'tokenUrl', label: 'Token URL', placeholder: 'https://id.example.com/oauth2/token' },
  { key: 'userInfoUrl', label: 'UserInfo URL', placeholder: 'https://id.example.com/oauth2/userinfo' },
];

const ssoOptionsTextFields: SsoTextField[] = [
  { key: 'requestTimeoutMs', label: 'Request Timeout (ms)', placeholder: '10000' },
  { key: 'scopes', label: 'Scopes', placeholder: 'openid profile email' },
  { key: 'iconUrl', label: 'Icon URL', placeholder: 'https://id.example.com/favicon.ico' },
];

const ssoOAuth2ClaimFields: SsoTextField[] = [
  { key: 'subjectField', label: 'Subject Field', placeholder: 'sub' },
  { key: 'emailField', label: 'Email Field', placeholder: 'email' },
  { key: 'emailVerifiedField', label: 'Email Verified Field', placeholder: 'email_verified' },
  { key: 'displayNameField', label: 'Display Name Field', placeholder: 'name' },
  { key: 'usernameField', label: 'Username Field', placeholder: 'preferred_username' },
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
  const [activeProfileIndex, setActiveProfileIndex] = useState<number | null>(null);
  const profiles = parseProfileArray(value, isProfileObject).map((profile) =>
    normalizeSsoProfileDraft(profile, appDomain),
  );
  const activeProfile = activeProfileIndex === null ? null : profiles[activeProfileIndex];
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
          No SSO profiles are configured.
        </div>
      ) : null}
      {profiles.map((profile, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border bg-card/70 p-3"
          key={`${profile.id}-${index}`}
        >
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-0 truncate text-sm font-medium">{profile.name || 'SSO profile'}</div>
            </div>
            <div className="truncate text-xs text-muted-foreground">{profile.id || 'Provider ID is required'}</div>
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
              description="This SSO provider profile will be removed from the current configuration form. Save changes to apply it."
              onConfirm={() => removeProfile(index)}
              title="Remove SSO profile?"
            >
              <Button disabled={disabled} size="icon-sm" type="button" variant="destructive">
                <Trash2Icon />
                <span className="sr-only">Remove SSO profile</span>
              </Button>
            </ConfirmActionDialog>
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          Add SSO profile
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
  return (
    <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
      <SheetHeader className="border-b pr-12">
        <SheetTitle>{profile.name || 'SSO profile'}</SheetTitle>
        <SheetDescription>{profile.id || 'Provider ID is required'}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="grid gap-6 py-1 pb-4">
          <SsoProfileSection title="Basic">
            <div className="grid gap-4">
              <SelectControl
                disabled={disabled}
                id={`setup-sso-profile-${index}-protocol`}
                label="Protocol"
                onValueChange={(fieldValue) => onProtocolChange(index, fieldValue as SsoProtocol)}
                options={ssoProtocolOptions}
                value={profile.protocol}
              />
              <SsoProfileBooleanSelect
                disabled={disabled}
                id={`setup-sso-profile-${index}-login-enabled`}
                label="Provider Login Access"
                onChange={(enabled) => onFieldChange(index, 'loginEnabled', enabled)}
                value={profile.loginEnabled}
              />
              <SsoProfileBooleanSelect
                disabled={disabled}
                id={`setup-sso-profile-${index}-binding-enabled`}
                label="User Binding Access"
                onChange={(enabled) => onFieldChange(index, 'bindingEnabled', enabled)}
                value={profile.bindingEnabled}
              />
              <SsoProfileTextFields
                disabled={disabled}
                fields={ssoBasicTextFields}
                index={index}
                onFieldChange={onFieldChange}
                profile={profile}
              />
            </div>
          </SsoProfileSection>
          <SsoProfileSection title="Credentials">
            <div className="grid gap-4">
              <SsoProfileTextFields
                disabled={disabled}
                fields={ssoCredentialTextFields}
                index={index}
                onFieldChange={onFieldChange}
                profile={profile}
              />
            </div>
          </SsoProfileSection>
          <SsoProfileSection title="Callback URLs">
            <SsoProfileTextFields
              disabled={disabled}
              fields={ssoCallbackTextFields}
              index={index}
              onFieldChange={onFieldChange}
              profile={profile}
            />
          </SsoProfileSection>
          <SsoProfileSection title="Provider Endpoint">
            {profile.protocol === 'oidc' ? (
              <ConfigurationTextInput
                disabled={disabled}
                id={`setup-sso-profile-${index}-issuer-url`}
                label="Issuer URL"
                onChange={(fieldValue) => onFieldChange(index, 'issuerUrl', fieldValue)}
                placeholder="https://id.example.com/realms/main"
                value={profile.issuerUrl}
              />
            ) : (
              <SsoProfileTextFields
                disabled={disabled}
                fields={ssoOAuth2EndpointFields}
                index={index}
                onFieldChange={onFieldChange}
                profile={profile}
              />
            )}
          </SsoProfileSection>
          <SsoProfileSection title="Options">
            <div className="grid gap-4">
              <SsoProfileTextFields
                disabled={disabled}
                fields={ssoOptionsTextFields}
                index={index}
                onFieldChange={onFieldChange}
                profile={profile}
              />
            </div>
          </SsoProfileSection>
          {profile.protocol === 'oauth2' ? (
            <SsoProfileSection title="Claims">
              <div className="grid gap-4">
                <SsoProfileTextFields
                  disabled={disabled}
                  fields={ssoOAuth2ClaimFields}
                  index={index}
                  onFieldChange={onFieldChange}
                  profile={profile}
                />
              </div>
            </SsoProfileSection>
          ) : null}
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

function SsoProfileSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  );
}

function SsoProfileTextFields({
  disabled,
  fields,
  index,
  onFieldChange,
  profile,
}: {
  disabled: boolean;
  fields: SsoTextField[];
  index: number;
  onFieldChange: (index: number, field: SsoProfileField, value: string | boolean) => void;
  profile: SsoProfileDraft;
}) {
  return fields.map((field) => (
    <ConfigurationTextInput
      disabled={disabled}
      id={`setup-sso-profile-${index}-${field.key}`}
      key={field.key}
      label={field.label}
      onChange={(fieldValue) => onFieldChange(index, field.key, fieldValue)}
      placeholder={field.placeholder}
      type={field.type}
      value={String(profile[field.key])}
    />
  ));
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
    <SelectControl
      disabled={disabled}
      id={id}
      label={label}
      onValueChange={(fieldValue) => onChange(fieldValue === 'true')}
      options={[
        { label: 'Enabled', value: 'true' },
        { label: 'Disabled', value: 'false' },
      ]}
      value={String(value)}
    />
  );
}
