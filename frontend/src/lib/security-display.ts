import { type IntlShape } from 'react-intl';

import { type MfaMethod, type MfaSettings } from './auth';

export function getTwoStepStatusDescription(settings: MfaSettings, intl: IntlShape) {
  if (settings.twoStepEnabled) {
    return intl.formatMessage(
      { id: 'security.two.step.status.enabled.methods' },
      { methods: formatMfaMethodList(settings.effectiveMethods, intl) },
    );
  }

  if (!settings.twoStepCanEnable) {
    return intl.formatMessage({ id: 'security.two.step.status.add.method' });
  }

  return intl.formatMessage(
    { id: 'security.two.step.status.enable.with.methods' },
    { methods: formatMfaMethodList(settings.availableMethods, intl) },
  );
}

export function formatMfaMethodList(methods: MfaMethod[], intl: IntlShape) {
  if (methods.length === 0) {
    return intl.formatMessage({ id: 'security.mfa.methods.none' });
  }

  return methods.map((method) => intl.formatMessage({ id: `security.mfa.method.${method}` })).join(', ');
}

export function formatPasskeyDeviceType(deviceType: string, intl: IntlShape) {
  if (deviceType === 'multiDevice') {
    return intl.formatMessage({ id: 'security.passkey.device.synced' });
  }

  if (deviceType === 'singleDevice') {
    return intl.formatMessage({ id: 'security.passkey.device.device.bound' });
  }

  return deviceType;
}

export function formatPasskeyCount(count: number, intl: IntlShape) {
  return intl.formatMessage({ id: 'security.passkey.count' }, { count });
}

export function formatPasskeyDisplayName(name: string, intl: IntlShape) {
  const normalizedName = name.trim();

  if (!normalizedName || normalizedName === 'Passkey' || /^Passkey \d+$/.test(normalizedName)) {
    const defaultNameMatch = /^Passkey (?<index>\d+)$/.exec(normalizedName);

    return defaultNameMatch?.groups?.index
      ? intl.formatMessage({ id: 'security.passkey.default.name' }, { index: defaultNameMatch.groups.index })
      : intl.formatMessage({ id: 'security.passkey.remark.placeholder' });
  }

  if (normalizedName.startsWith('Remark: ')) {
    return intl.formatMessage({ id: 'security.passkey.remark.display' }, { remark: normalizedName.slice(8) });
  }

  return intl.formatMessage({ id: 'security.passkey.remark.display' }, { remark: normalizedName });
}

export function formatSecurityDate(value: string, intl: IntlShape) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return intl.formatMessage({ id: 'security.unknown.time' });
  }

  return new Intl.DateTimeFormat(intl.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
