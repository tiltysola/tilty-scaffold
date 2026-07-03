import { type AuthUser, type MfaSettings } from '@/lib/auth';
import { routePath } from '@/router';

export type DashboardAccountAlertId =
  | 'avatar-missing'
  | 'email-unverified'
  | 'mfa-disabled'
  | 'passkey-missing'
  | 'phone-missing'
  | 'phone-unverified'
  | 'profile-background-missing'
  | 'profile-banner-missing'
  | 'profile-details-missing'
  | 'totp-missing';

export type DashboardAccountAlertPriority = 'info' | 'warn';

export interface DashboardAccountAlert {
  id: DashboardAccountAlertId;
  priority: DashboardAccountAlertPriority;
  titleMessageId:
    | 'dashboard.alert.email.unverified.title'
    | 'dashboard.alert.mfa.disabled.title'
    | 'dashboard.alert.passkey.missing.title'
    | 'dashboard.alert.phone.missing.title'
    | 'dashboard.alert.phone.unverified.title'
    | 'dashboard.alert.profile.avatar.missing.title'
    | 'dashboard.alert.profile.background.missing.title'
    | 'dashboard.alert.profile.banner.missing.title'
    | 'dashboard.alert.profile.details.missing.title'
    | 'dashboard.alert.totp.missing.title';
  descriptionMessageId:
    | 'dashboard.alert.email.unverified.description'
    | 'dashboard.alert.mfa.disabled.description'
    | 'dashboard.alert.passkey.missing.description'
    | 'dashboard.alert.phone.missing.description'
    | 'dashboard.alert.phone.unverified.description'
    | 'dashboard.alert.profile.avatar.missing.description'
    | 'dashboard.alert.profile.background.missing.description'
    | 'dashboard.alert.profile.banner.missing.description'
    | 'dashboard.alert.profile.details.missing.description'
    | 'dashboard.alert.totp.missing.description';
  actionMessageId: 'dashboard.alert.action.profile' | 'dashboard.alert.action.security';
  actionTo: string;
}

export function getDashboardAccountAlerts(user: AuthUser, mfaSettings: MfaSettings | null): DashboardAccountAlert[] {
  const infoAlerts: DashboardAccountAlert[] = [];
  const warnAlerts: DashboardAccountAlert[] = [];
  const profileRoute = routePath('profile');
  const securityRoute = routePath('security');

  if (!user.emailVerified) {
    warnAlerts.push({
      id: 'email-unverified',
      priority: 'warn',
      titleMessageId: 'dashboard.alert.email.unverified.title',
      descriptionMessageId: 'dashboard.alert.email.unverified.description',
      actionMessageId: 'dashboard.alert.action.profile',
      actionTo: profileRoute,
    });
  }

  if (!user.phoneNumber) {
    warnAlerts.push({
      id: 'phone-missing',
      priority: 'warn',
      titleMessageId: 'dashboard.alert.phone.missing.title',
      descriptionMessageId: 'dashboard.alert.phone.missing.description',
      actionMessageId: 'dashboard.alert.action.profile',
      actionTo: profileRoute,
    });
  } else if (!user.phoneVerified) {
    warnAlerts.push({
      id: 'phone-unverified',
      priority: 'warn',
      titleMessageId: 'dashboard.alert.phone.unverified.title',
      descriptionMessageId: 'dashboard.alert.phone.unverified.description',
      actionMessageId: 'dashboard.alert.action.profile',
      actionTo: profileRoute,
    });
  }

  if (!hasProfileDetails(user)) {
    infoAlerts.push({
      id: 'profile-details-missing',
      priority: 'info',
      titleMessageId: 'dashboard.alert.profile.details.missing.title',
      descriptionMessageId: 'dashboard.alert.profile.details.missing.description',
      actionMessageId: 'dashboard.alert.action.profile',
      actionTo: profileRoute,
    });
  }

  if (!hasNonBlankValue(user.avatarUrl)) {
    infoAlerts.push({
      id: 'avatar-missing',
      priority: 'info',
      titleMessageId: 'dashboard.alert.profile.avatar.missing.title',
      descriptionMessageId: 'dashboard.alert.profile.avatar.missing.description',
      actionMessageId: 'dashboard.alert.action.profile',
      actionTo: profileRoute,
    });
  }

  if (!hasNonBlankValue(user.profileBannerUrl)) {
    infoAlerts.push({
      id: 'profile-banner-missing',
      priority: 'info',
      titleMessageId: 'dashboard.alert.profile.banner.missing.title',
      descriptionMessageId: 'dashboard.alert.profile.banner.missing.description',
      actionMessageId: 'dashboard.alert.action.profile',
      actionTo: profileRoute,
    });
  }

  if (!hasNonBlankValue(user.profileBackgroundUrl)) {
    infoAlerts.push({
      id: 'profile-background-missing',
      priority: 'info',
      titleMessageId: 'dashboard.alert.profile.background.missing.title',
      descriptionMessageId: 'dashboard.alert.profile.background.missing.description',
      actionMessageId: 'dashboard.alert.action.profile',
      actionTo: profileRoute,
    });
  }

  if (!user.totpEnabled) {
    warnAlerts.push({
      id: 'totp-missing',
      priority: 'warn',
      titleMessageId: 'dashboard.alert.totp.missing.title',
      descriptionMessageId: 'dashboard.alert.totp.missing.description',
      actionMessageId: 'dashboard.alert.action.security',
      actionTo: securityRoute,
    });
  }

  if (!mfaSettings) {
    return [...warnAlerts, ...infoAlerts];
  }

  if (mfaSettings.passkeyCount === 0) {
    warnAlerts.push({
      id: 'passkey-missing',
      priority: 'warn',
      titleMessageId: 'dashboard.alert.passkey.missing.title',
      descriptionMessageId: 'dashboard.alert.passkey.missing.description',
      actionMessageId: 'dashboard.alert.action.security',
      actionTo: securityRoute,
    });
  }

  if (mfaSettings.twoStepCanEnable && !mfaSettings.twoStepEnabled) {
    warnAlerts.push({
      id: 'mfa-disabled',
      priority: 'warn',
      titleMessageId: 'dashboard.alert.mfa.disabled.title',
      descriptionMessageId: 'dashboard.alert.mfa.disabled.description',
      actionMessageId: 'dashboard.alert.action.security',
      actionTo: securityRoute,
    });
  }

  return [...warnAlerts, ...infoAlerts];
}

function hasProfileDetails(user: AuthUser) {
  return [user.bio, user.gender, user.birthday, user.location, user.websiteUrl].some(hasNonBlankValue);
}

function hasNonBlankValue(value: string | undefined) {
  return Boolean(value?.trim());
}
