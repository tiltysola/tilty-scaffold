import { isIP } from 'net';

import { SetupCacheStore, SetupDatabaseDialect, SetupFileStorageDriver, SetupLogTarget } from '@tilty/shared/setup';

import { parseLogTargets, type SetupEnvironment } from '../../config/setup-environment';
import { AppError } from '../../core/errors';

export type SetupNetworkTargetKind = 'cache' | 'database' | 'email' | 'file-storage' | 'logging' | 'sms' | 'sso';

const forbiddenHostnames = new Set([
  'instance-data.ec2.internal',
  'metadata.azure.internal',
  'metadata.google.internal',
  'metadata.goog',
]);
const forbiddenIpAddresses = new Set(['100.100.100.200', '168.63.129.16', 'fd00:ec2::254']);

export function assertSafeSetupNetworkTargets(environment: SetupEnvironment, kind: SetupNetworkTargetKind) {
  for (const target of getNetworkTargets(environment, kind)) {
    assertSafeNetworkTarget(target.value, target.field);
  }
}

function getNetworkTargets(environment: SetupEnvironment, kind: SetupNetworkTargetKind) {
  if (kind === 'database') {
    return environment.DATABASE_DIALECT.trim() === SetupDatabaseDialect.Sqlite
      ? []
      : [{ field: 'DATABASE_URL', value: environment.DATABASE_URL }];
  }

  if (kind === 'cache') {
    return environment.CACHE_STORE.trim() === SetupCacheStore.Redis
      ? [{ field: 'CACHE_REDIS_URL', value: environment.CACHE_REDIS_URL }]
      : [];
  }

  if (kind === 'file-storage') {
    return environment.FILE_STORAGE_DRIVER.trim() === SetupFileStorageDriver.Oss
      ? [{ field: 'FILE_OSS_ENDPOINT', value: environment.FILE_OSS_ENDPOINT }]
      : [];
  }

  if (kind === 'logging') {
    return parseLogTargets(environment.LOG_TARGETS).includes(SetupLogTarget.Sls)
      ? [{ field: 'LOG_SLS_ENDPOINT', value: environment.LOG_SLS_ENDPOINT }]
      : [];
  }

  if (kind === 'email') {
    return getProfileTargets(environment.EMAIL_SMTP_PROFILES, 'EMAIL_SMTP_PROFILES', ['host']);
  }

  if (kind === 'sms') {
    return getProfileTargets(environment.SMS_ALICLOUD_PROFILES, 'SMS_ALICLOUD_PROFILES', ['endpoint']);
  }

  return getProfileTargets(environment.SSO_PROFILES, 'SSO_PROFILES', [
    'authorizationUrl',
    'issuerUrl',
    'jwksUrl',
    'tokenUrl',
    'userInfoUrl',
  ]);
}

function getProfileTargets(value: string, environmentField: string, targetFields: string[]) {
  try {
    const profiles = JSON.parse(value) as unknown;

    if (!Array.isArray(profiles)) {
      return [];
    }

    return profiles.flatMap((profile, index) => {
      if (!profile || typeof profile !== 'object') {
        return [];
      }

      return targetFields.flatMap((field) => {
        const target = (profile as Record<string, unknown>)[field];

        return typeof target === 'string' && target
          ? [{ field: `${environmentField}.${index}.${field}`, value: target }]
          : [];
      });
    });
  } catch {
    return [];
  }
}

function assertSafeNetworkTarget(value: string, field: string) {
  const hostname = getHostname(value);

  if (!hostname) {
    return;
  }

  const normalizedHostname = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (forbiddenHostnames.has(normalizedHostname) || isForbiddenIpAddress(normalizedHostname)) {
    throw new AppError('SETUP_NETWORK_TARGET_FORBIDDEN', 'error.SETUP_NETWORK_TARGET_FORBIDDEN', 400, { field });
  }
}

function getHostname(value: string) {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname;
  } catch {
    return undefined;
  }
}

function isForbiddenIpAddress(value: string): boolean {
  if (forbiddenIpAddresses.has(value)) {
    return true;
  }

  const ipVersion = isIP(value);

  if (ipVersion === 4) {
    const octets = value.split('.').map(Number);
    const [first, second, third, fourth] = octets;

    return (
      first === 0 ||
      (first === 100 && second === 100 && third === 100 && fourth === 200) ||
      (first === 169 && second === 254) ||
      (first !== undefined && first >= 224)
    );
  }

  if (ipVersion === 6) {
    const normalized = value.toLowerCase();
    const mappedIpv4 = getMappedIpv4Address(normalized);

    return (
      (mappedIpv4 !== undefined && isForbiddenIpAddress(mappedIpv4)) ||
      normalized === '::' ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff')
    );
  }

  return false;
}

function getMappedIpv4Address(value: string) {
  const match = /^(?:::ffff:|64:ff9b::)([\da-f]{1,4}):([\da-f]{1,4})$/.exec(value);

  if (!match) {
    return undefined;
  }

  const high = Number.parseInt(match[1]!, 16);
  const low = Number.parseInt(match[2]!, 16);

  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}
