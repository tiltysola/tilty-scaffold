import { describe, expect, it } from 'vitest';

import { type AuthUser, type MfaSettings } from '../src/lib/auth';
import { getDashboardAccountAlerts } from '../src/pages/Dashboard/utils';

const verifiedUser: AuthUser = {
  username: 'admin',
  displayName: 'Admin',
  gender: 'other',
  birthday: '1990-01-01',
  bio: 'Application administrator',
  location: 'Shanghai',
  websiteUrl: 'https://example.com',
  email: 'admin@example.com',
  emailVerified: true,
  phoneNumber: '+8613800000000',
  phoneVerified: true,
  totpEnabled: true,
  mfaAllowedMethods: ['totp'],
  mfaRequiredForSso: true,
  avatarUrl: '/uploads/avatar.png',
  profileBannerUrl: '/uploads/profile-banner.webp',
  profileBackgroundUrl: '/uploads/profile-background.webp',
  roles: [],
  permissions: [],
};

const enabledMfaSettings: MfaSettings = {
  availableMethods: ['totp'],
  defaultMethod: 'totp',
  effectiveMethods: ['totp'],
  mfaRequiredForSso: true,
  passkeyCount: 1,
  twoStepCanDisable: false,
  twoStepCanEnable: true,
  twoStepEnabled: true,
};

describe('dashboard account alerts', () => {
  it('does not show alerts for a verified account with configured security methods', () => {
    expect(getDashboardAccountAlerts(verifiedUser, enabledMfaSettings)).toEqual([]);
  });

  it('shows account completion alerts from user and MFA state', () => {
    const alerts = getDashboardAccountAlerts(
      {
        ...verifiedUser,
        emailVerified: false,
        phoneNumber: undefined,
        phoneVerified: false,
        gender: undefined,
        birthday: undefined,
        bio: undefined,
        location: undefined,
        websiteUrl: undefined,
        totpEnabled: false,
        mfaAllowedMethods: [],
        avatarUrl: undefined,
        profileBannerUrl: undefined,
        profileBackgroundUrl: undefined,
      },
      {
        ...enabledMfaSettings,
        availableMethods: [],
        defaultMethod: undefined,
        effectiveMethods: [],
        passkeyCount: 0,
        twoStepCanEnable: false,
        twoStepEnabled: false,
      },
    );

    expect(alerts.map((alert) => alert.id)).toEqual([
      'email-unverified',
      'phone-missing',
      'totp-missing',
      'passkey-missing',
      'profile-details-missing',
      'avatar-missing',
      'profile-banner-missing',
      'profile-background-missing',
    ]);
    expect(alerts.map((alert) => alert.priority)).toEqual([
      'warn',
      'warn',
      'warn',
      'warn',
      'info',
      'info',
      'info',
      'info',
    ]);
  });

  it('does not require every optional profile detail field when at least one is set', () => {
    const alerts = getDashboardAccountAlerts(
      {
        ...verifiedUser,
        gender: undefined,
        birthday: undefined,
        bio: 'Application administrator',
        location: undefined,
        websiteUrl: undefined,
      },
      enabledMfaSettings,
    );

    expect(alerts.map((alert) => alert.id)).toEqual([]);
  });

  it('shows profile media alerts when personalized images are not configured', () => {
    const alerts = getDashboardAccountAlerts(
      {
        ...verifiedUser,
        avatarUrl: undefined,
        profileBannerUrl: undefined,
        profileBackgroundUrl: undefined,
      },
      enabledMfaSettings,
    );

    expect(alerts.map((alert) => alert.id)).toEqual([
      'avatar-missing',
      'profile-banner-missing',
      'profile-background-missing',
    ]);
    expect(alerts.every((alert) => alert.priority === 'info')).toBe(true);
    expect(alerts.every((alert) => alert.actionTo === '/profile')).toBe(true);
  });

  it('shows phone verification instead of phone binding when a phone number exists', () => {
    const alerts = getDashboardAccountAlerts(
      {
        ...verifiedUser,
        phoneVerified: false,
      },
      enabledMfaSettings,
    );

    expect(alerts.map((alert) => alert.id)).toEqual(['phone-unverified']);
    expect(alerts[0]?.priority).toBe('warn');
    expect(alerts[0]?.actionTo).toBe('/profile');
  });

  it('shows the two-step alert only when verification can be enabled', () => {
    const alerts = getDashboardAccountAlerts(
      {
        ...verifiedUser,
        mfaAllowedMethods: [],
      },
      {
        ...enabledMfaSettings,
        effectiveMethods: [],
        twoStepCanEnable: true,
        twoStepEnabled: false,
      },
    );

    expect(alerts.map((alert) => alert.id)).toEqual(['mfa-disabled']);
    expect(alerts[0]?.priority).toBe('warn');
    expect(alerts[0]?.actionTo).toBe('/security');
  });
});
