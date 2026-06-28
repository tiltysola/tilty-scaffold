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

export function SmsProfilesField({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [activeProfileIndex, setActiveProfileIndex] = useState<number | null>(null);
  const profiles = parseProfileArray(value, isSmsProfileDraft).map((profile) => ({
    ...getDefaultSmsProfile(profile.phoneCountryCode),
    ...profile,
  }));
  const activeProfile = activeProfileIndex === null ? null : profiles[activeProfileIndex];
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
      setActiveProfileIndex(profiles.length);
    }
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
          No SMS country code profiles are configured.
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
                {getSmsCountryCodeLabel(profile.phoneCountryCode)}
              </div>
            </div>
            <div className="truncate text-xs text-muted-foreground">{profile.endpoint}</div>
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
              description="This SMS country code profile will be removed from the current configuration form. Save changes to apply it."
              onConfirm={() => removeProfile(index)}
              title="Remove SMS profile?"
            >
              <Button disabled={disabled} size="icon-sm" type="button" variant="destructive">
                <Trash2Icon />
                <span className="sr-only">Remove SMS profile</span>
              </Button>
            </ConfirmActionDialog>
          </div>
        </div>
      ))}
      <div>
        <Button disabled={disabled || !unusedCountryCode} onClick={addProfile} type="button" variant="outline">
          <PlusIcon />
          Add SMS profile
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
  return (
    <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
      <SheetHeader className="border-b pr-12">
        <SheetTitle>{getSmsCountryCodeLabel(profile.phoneCountryCode)}</SheetTitle>
        <SheetDescription>{profile.endpoint}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <div className="grid gap-6 py-1 pb-4">
          <SmsProfileSection title="Basic">
            <div className="grid gap-4">
              <SelectControl
                disabled={disabled}
                id={`setup-sms-profile-${index}-country`}
                label="Country Code"
                onValueChange={(fieldValue) => onCountryCodeChange(index, fieldValue as SmsProfileCountryCode)}
                options={smsCountryCodeOptions.map((option) => ({
                  ...option,
                  disabled:
                    option.value !== profile.phoneCountryCode &&
                    profiles.some((smsProfile) => smsProfile.phoneCountryCode === option.value),
                }))}
                value={profile.phoneCountryCode}
              />
              <ConfigurationTextInput
                disabled={disabled}
                id={`setup-sms-profile-${index}-access-key-id`}
                label="Access Key ID"
                onChange={(fieldValue) => onFieldChange(index, 'accessKeyId', fieldValue)}
                value={profile.accessKeyId}
              />
              <ConfigurationTextInput
                disabled={disabled}
                id={`setup-sms-profile-${index}-access-key-secret`}
                label="Access Key Secret"
                onChange={(fieldValue) => onFieldChange(index, 'accessKeySecret', fieldValue)}
                placeholder="access-key-secret"
                type="password"
                value={profile.accessKeySecret}
              />
            </div>
          </SmsProfileSection>
          <SmsProfileSection title="Message">
            <div className="grid gap-4">
              {profile.phoneCountryCode === '+86'
                ? domesticSmsProfileFields.map((field) => (
                    <ConfigurationTextInput
                      disabled={disabled}
                      id={`setup-sms-profile-${index}-${field.key}`}
                      key={field.key}
                      label={field.label}
                      onChange={(fieldValue) => onFieldChange(index, field.key, fieldValue)}
                      value={profile[field.key] ?? ''}
                    />
                  ))
                : internationalSmsProfileFields.map((field) => (
                    <ConfigurationTextInput
                      disabled={disabled}
                      id={`setup-sms-profile-${index}-${field.key}`}
                      key={field.key}
                      label={field.label}
                      onChange={(fieldValue) => onFieldChange(index, field.key, fieldValue)}
                      value={profile[field.key] ?? ''}
                    />
                  ))}
              {profile.phoneCountryCode === '+86' ? null : (
                <SelectControl
                  disabled={disabled}
                  id={`setup-sms-profile-${index}-type`}
                  label="Message Type"
                  onValueChange={(fieldValue) => onFieldChange(index, 'type', fieldValue)}
                  options={smsProfileTypeOptions}
                  value={profile.type ?? 'OTP'}
                />
              )}
            </div>
          </SmsProfileSection>
          <SmsProfileSection title="Aliyun API">
            <div className="grid gap-4">
              <ConfigurationTextInput
                disabled
                id={`setup-sms-profile-${index}-api-version`}
                label="API Version"
                value={profile.apiVersion}
              />
              <ConfigurationTextInput
                disabled
                id={`setup-sms-profile-${index}-operation`}
                label="Operation"
                value={profile.operation}
              />
              <ConfigurationTextInput
                disabled
                id={`setup-sms-profile-${index}-region`}
                label="Region ID"
                value={profile.regionId}
              />
              <ConfigurationTextInput
                disabled
                id={`setup-sms-profile-${index}-endpoint`}
                label="Endpoint"
                value={profile.endpoint}
              />
            </div>
          </SmsProfileSection>
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

function SmsProfileSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
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
