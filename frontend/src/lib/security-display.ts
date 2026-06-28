import { type MfaMethod, type MfaSettings } from './auth';

const mfaMethodLabels: Record<MfaMethod, string> = {
  email: 'Email',
  passkey: 'Passkey',
  sms: 'SMS',
  totp: 'Authenticator app',
};

export function getTwoStepStatusDescription(settings: MfaSettings) {
  if (settings.twoStepEnabled) {
    return `Enabled methods: ${formatMfaMethodList(settings.effectiveMethods)}.`;
  }

  if (!settings.twoStepCanEnable) {
    return 'Add a verified contact method, authenticator app, or passkey.';
  }

  return `Enable to use ${formatMfaMethodList(settings.availableMethods)}.`;
}

export function formatMfaMethodList(methods: MfaMethod[]) {
  if (methods.length === 0) {
    return 'none';
  }

  return methods.map((method) => mfaMethodLabels[method]).join(', ');
}

export function formatPasskeyDeviceType(deviceType: string) {
  if (deviceType === 'multiDevice') {
    return 'Synced passkey';
  }

  if (deviceType === 'singleDevice') {
    return 'Device-bound passkey';
  }

  return deviceType;
}

export function formatPasskeyCount(count: number) {
  return `${count} ${count === 1 ? 'passkey' : 'passkeys'}`;
}

export function formatPasskeyDisplayName(name: string) {
  const normalizedName = name.trim();

  if (!normalizedName || normalizedName === 'Passkey' || /^Passkey \d+$/.test(normalizedName)) {
    return normalizedName || 'Passkey';
  }

  if (normalizedName.startsWith('Remark: ')) {
    return normalizedName;
  }

  return `Remark: ${normalizedName}`;
}

export function formatSecurityDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
