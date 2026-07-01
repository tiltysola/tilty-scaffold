import { useIntl } from 'react-intl';

import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { Sheet } from '@/shadcn/components/ui/sheet';
import {
  SetupSmsPhoneCountryCode,
  type SetupSmsPhoneCountryCodeValue,
  setupSmsPhoneCountryCodeValues,
} from '@tilty/shared/setup';

import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';

import { ConfigurationTextInput, SelectControl } from './FormControls';
import { SetupProfileSection, SetupProfileSheet } from './ProfileSheetControls';
import { useProfileListEditor } from './useProfileListEditor';
import { isProfileObject, parseProfileArray, toMessagePathPart } from './utils';

type SmsProfileCountryCode = SetupSmsPhoneCountryCodeValue;
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

const smsCountryCodeOptions: Array<{ value: SmsProfileCountryCode }> = setupSmsPhoneCountryCodeValues.map((value) => ({
  value,
}));

const smsProfileTypeOptions: Array<{ value: SmsProfileType }> = [
  { value: 'OTP' },
  { value: 'NOTIFY' },
  { value: 'MKT' },
];

const defaultSmsProfiles: Record<SmsProfileCountryCode, SmsProfileDraft> = {
  [SetupSmsPhoneCountryCode.ChinaMainland]: {
    phoneCountryCode: SetupSmsPhoneCountryCode.ChinaMainland,
    apiVersion: '2017-05-25',
    operation: 'SendSms',
    regionId: 'cn-hangzhou',
    endpoint: 'dysmsapi.aliyuncs.com',
    accessKeyId: '',
    accessKeySecret: '',
    signName: '',
    templateCode: '',
  },
  [SetupSmsPhoneCountryCode.HongKong]: {
    phoneCountryCode: SetupSmsPhoneCountryCode.HongKong,
    apiVersion: '2018-05-01',
    operation: 'SendMessageToGlobe',
    regionId: 'ap-southeast-1',
    endpoint: 'dysmsapi.ap-southeast-1.aliyuncs.com',
    accessKeyId: '',
    accessKeySecret: '',
    senderId: '',
    type: 'OTP',
  },
  [SetupSmsPhoneCountryCode.Macao]: {
    phoneCountryCode: SetupSmsPhoneCountryCode.Macao,
    apiVersion: '2018-05-01',
    operation: 'SendMessageToGlobe',
    regionId: 'ap-southeast-1',
    endpoint: 'dysmsapi.ap-southeast-1.aliyuncs.com',
    accessKeyId: '',
    accessKeySecret: '',
    senderId: '',
    type: 'OTP',
  },
};

const domesticSmsProfileFields = [
  {
    key: 'signName',
  },
  {
    key: 'templateCode',
  },
] as const;

const internationalSmsProfileFields = [
  {
    key: 'senderId',
  },
  {
    key: 'messageTemplate',
  },
] as const;

export function SmsProfilesField({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const intl = useIntl();
  const profiles = parseProfileArray(value, isSmsProfileDraft).map((profile) => ({
    ...getDefaultSmsProfile(profile.phoneCountryCode, intl),
    ...profile,
  }));
  const { activeProfile, activeProfileIndex, closeProfile, openProfile, removeProfile, updateProfile, updateProfiles } =
    useProfileListEditor({
      normalizeForStorage: normalizeSmsProfileForStorage,
      onValueChange,
      profiles,
    });
  const unusedCountryCode = smsCountryCodeOptions.find(
    (option) => !profiles.some((profile) => profile.phoneCountryCode === option.value),
  )?.value;
  const updateCountryCode = (index: number, countryCode: SmsProfileCountryCode) => {
    const current = profiles[index];

    updateProfiles(
      profiles.map((profile, profileIndex) =>
        profileIndex === index
          ? {
              ...getDefaultSmsProfile(countryCode, intl),
              accessKeyId: current?.accessKeyId ?? '',
              accessKeySecret: current?.accessKeySecret ?? '',
            }
          : profile,
      ),
    );
  };
  const addProfile = () => {
    if (unusedCountryCode) {
      updateProfiles([...profiles, getDefaultSmsProfile(unusedCountryCode, intl)]);
      openProfile(profiles.length);
    }
  };

  return (
    <div className="grid gap-4">
      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          {intl.formatMessage({ id: 'setup.sms.profiles.empty' })}
        </div>
      ) : null}
      {profiles.map((profile, index) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border bg-card/70 p-3"
          key={`${profile.phoneCountryCode}-${index}`}
        >
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="min-w-0 truncate text-sm font-medium">
                {getSmsCountryCodeLabel(profile.phoneCountryCode, intl)}
              </div>
            </div>
            <div className="truncate text-xs text-muted-foreground">{profile.endpoint}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1 self-start">
            <Button disabled={disabled} onClick={() => openProfile(index)} size="sm" type="button" variant="outline">
              <PencilIcon />
              {intl.formatMessage({ id: 'common.edit' })}
            </Button>
            <ConfirmActionDialog
              confirmLabel={intl.formatMessage({ id: 'common.remove' })}
              description={intl.formatMessage({ id: 'setup.sms.profiles.remove.description' })}
              onConfirm={() => removeProfile(index)}
              title={intl.formatMessage({ id: 'setup.remove.sms.profile.title' })}
            >
              <Button disabled={disabled} size="icon-sm" type="button" variant="destructive">
                <Trash2Icon />
                <span className="sr-only">{intl.formatMessage({ id: 'setup.remove.sms.profile' })}</span>
              </Button>
            </ConfirmActionDialog>
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled || !unusedCountryCode} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          {intl.formatMessage({ id: 'setup.sms.profiles.add' })}
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
          <SmsProfileSheetContent
            disabled={disabled}
            index={activeProfileIndex}
            onCountryCodeChange={updateCountryCode}
            onFieldChange={updateProfile}
            profiles={profiles}
            profile={activeProfile}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function SmsProfileSheetContent({
  disabled,
  index,
  onCountryCodeChange,
  onFieldChange,
  profiles,
  profile,
}: {
  disabled: boolean;
  index: number;
  onCountryCodeChange: (index: number, countryCode: SmsProfileCountryCode) => void;
  onFieldChange: (index: number, field: keyof SmsProfileDraft, value: string) => void;
  profiles: SmsProfileDraft[];
  profile: SmsProfileDraft;
}) {
  const intl = useIntl();

  return (
    <SetupProfileSheet description={profile.endpoint} title={getSmsCountryCodeLabel(profile.phoneCountryCode, intl)}>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.basic' })}>
        <div className="grid gap-4">
          <SelectControl
            disabled={disabled}
            id={`setup-sms-profile-${index}-country`}
            label={intl.formatMessage({ id: 'setup.sms.profile.phone.country.code.label' })}
            onValueChange={(fieldValue) => onCountryCodeChange(index, fieldValue as SmsProfileCountryCode)}
            options={smsCountryCodeOptions.map((option) => ({
              disabled:
                option.value !== profile.phoneCountryCode &&
                profiles.some((smsProfile) => smsProfile.phoneCountryCode === option.value),
              label: getSmsCountryCodeLabel(option.value, intl),
              value: option.value,
            }))}
            value={profile.phoneCountryCode}
          />
          <ConfigurationTextInput
            disabled={disabled}
            id={`setup-sms-profile-${index}-access-key-id`}
            label={intl.formatMessage({ id: 'setup.sms.profile.access.key.id.label' })}
            onChange={(fieldValue) => onFieldChange(index, 'accessKeyId', fieldValue)}
            value={profile.accessKeyId}
          />
          <ConfigurationTextInput
            disabled={disabled}
            id={`setup-sms-profile-${index}-access-key-secret`}
            label={intl.formatMessage({ id: 'setup.sms.profile.access.key.secret.label' })}
            onChange={(fieldValue) => onFieldChange(index, 'accessKeySecret', fieldValue)}
            placeholder={intl.formatMessage({ id: 'setup.sms.profile.access.key.secret.placeholder' })}
            type="password"
            value={profile.accessKeySecret}
          />
        </div>
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.message' })}>
        <div className="grid gap-4">
          {profile.phoneCountryCode === SetupSmsPhoneCountryCode.ChinaMainland
            ? domesticSmsProfileFields.map((field) => (
                <ConfigurationTextInput
                  disabled={disabled}
                  id={`setup-sms-profile-${index}-${field.key}`}
                  key={field.key}
                  label={intl.formatMessage({ id: `setup.sms.profile.${toMessagePathPart(field.key)}.label` })}
                  onChange={(fieldValue) => onFieldChange(index, field.key, fieldValue)}
                  value={profile[field.key] ?? ''}
                />
              ))
            : internationalSmsProfileFields.map((field) => (
                <ConfigurationTextInput
                  disabled={disabled}
                  id={`setup-sms-profile-${index}-${field.key}`}
                  key={field.key}
                  label={intl.formatMessage({ id: `setup.sms.profile.${toMessagePathPart(field.key)}.label` })}
                  onChange={(fieldValue) => onFieldChange(index, field.key, fieldValue)}
                  value={profile[field.key] ?? ''}
                />
              ))}
          {profile.phoneCountryCode === SetupSmsPhoneCountryCode.ChinaMainland ? null : (
            <SelectControl
              disabled={disabled}
              id={`setup-sms-profile-${index}-type`}
              label={intl.formatMessage({ id: 'setup.sms.profile.type.label' })}
              onValueChange={(fieldValue) => onFieldChange(index, 'type', fieldValue)}
              options={smsProfileTypeOptions.map((option) => ({
                label: intl.formatMessage({ id: `setup.sms.profile.type.${toMessagePathPart(option.value)}` }),
                value: option.value,
              }))}
              value={profile.type ?? 'OTP'}
            />
          )}
        </div>
      </SetupProfileSection>
      <SetupProfileSection title={intl.formatMessage({ id: 'setup.section.aliyun.api' })}>
        <div className="grid gap-4">
          <ConfigurationTextInput
            disabled
            id={`setup-sms-profile-${index}-api-version`}
            label={intl.formatMessage({ id: 'setup.sms.profile.api.version.label' })}
            value={profile.apiVersion}
          />
          <ConfigurationTextInput
            disabled
            id={`setup-sms-profile-${index}-operation`}
            label={intl.formatMessage({ id: 'setup.sms.profile.operation.label' })}
            value={profile.operation}
          />
          <ConfigurationTextInput
            disabled
            id={`setup-sms-profile-${index}-region`}
            label={intl.formatMessage({ id: 'setup.sms.profile.region.id.label' })}
            value={profile.regionId}
          />
          <ConfigurationTextInput
            disabled
            id={`setup-sms-profile-${index}-endpoint`}
            label={intl.formatMessage({ id: 'setup.sms.profile.endpoint.label' })}
            value={profile.endpoint}
          />
        </div>
      </SetupProfileSection>
    </SetupProfileSheet>
  );
}

function isSmsProfileDraft(value: unknown): value is SmsProfileDraft {
  if (!isProfileObject(value)) {
    return false;
  }

  const profile = value;

  return (
    isSmsProfileCountryCode(profile.phoneCountryCode) &&
    typeof profile.apiVersion === 'string' &&
    typeof profile.operation === 'string' &&
    typeof profile.regionId === 'string' &&
    typeof profile.endpoint === 'string' &&
    typeof profile.accessKeyId === 'string' &&
    typeof profile.accessKeySecret === 'string'
  );
}

function getDefaultSmsProfile(countryCode: SmsProfileCountryCode, intl: ReturnType<typeof useIntl>): SmsProfileDraft {
  const profile = { ...defaultSmsProfiles[countryCode] };

  if (countryCode !== SetupSmsPhoneCountryCode.ChinaMainland) {
    profile.messageTemplate = intl.formatMessage(
      { id: 'setup.sms.profile.message.template.default' },
      { code: '${code}' },
    );
  }

  return profile;
}

function isSmsProfileCountryCode(value: unknown): value is SmsProfileCountryCode {
  return typeof value === 'string' && setupSmsPhoneCountryCodeValues.includes(value as SetupSmsPhoneCountryCodeValue);
}

function normalizeSmsProfileForStorage(profile: SmsProfileDraft) {
  if (profile.phoneCountryCode === SetupSmsPhoneCountryCode.ChinaMainland) {
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

function getSmsCountryCodeLabel(countryCode: SmsProfileCountryCode, intl: ReturnType<typeof useIntl>) {
  return intl.formatMessage({ id: `setup.sms.profile.phone.country.code.${countryCode.replace('+', '')}` });
}
