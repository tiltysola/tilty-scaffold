import {
  type AuthDeviceSession,
  fetchAuthDeviceSessions,
  fetchMfaSettings,
  fetchPasskeys,
  fetchTotpStatus,
  type MfaSettings,
  type PasskeySummary,
  type TotpStatus,
} from '@/lib/auth';

export interface SecurityState {
  devices: AuthDeviceSession[];
  mfaSettings: MfaSettings;
  passkeys: PasskeySummary[];
  totpStatus: TotpStatus;
}

export const defaultTotpStatus: TotpStatus = {
  enabled: false,
  recoveryCodesRemaining: 0,
};

export const defaultMfaSettings: MfaSettings = {
  availableMethods: [],
  effectiveMethods: [],
  mfaRequiredForSso: true,
  passkeyCount: 0,
  twoStepCanDisable: true,
  twoStepCanEnable: false,
  twoStepEnabled: false,
};

export const passkeyRemarkMaxLength = 120;

export async function fetchSecurityState(): Promise<SecurityState> {
  const [nextTotpStatus, deviceResult, nextMfaSettings, passkeyResult] = await Promise.all([
    fetchTotpStatus(),
    fetchAuthDeviceSessions(),
    fetchMfaSettings(),
    fetchPasskeys(),
  ]);

  return {
    devices: sortDevices(deviceResult.sessions),
    mfaSettings: nextMfaSettings,
    passkeys: passkeyResult.passkeys,
    totpStatus: nextTotpStatus,
  };
}

function sortDevices(devices: AuthDeviceSession[]) {
  return [...devices].sort((first, second) => {
    if (first.isCurrent !== second.isCurrent) {
      return first.isCurrent ? -1 : 1;
    }

    return Date.parse(second.lastActiveAt) - Date.parse(first.lastActiveAt);
  });
}
