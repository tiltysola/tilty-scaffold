import { type SetupAdministrator, type SetupEnvironment, type SetupEnvironmentStepId } from '@/lib/setup';
import { routePath } from '@/router';

import { hasLogTarget, type SetupFieldDefinition } from './definitions';

interface SetupFieldGroup {
  fields: SetupFieldDefinition[];
  name: string;
}

export interface SsoProfileDraft {
  id: string;
  name: string;
  protocol: 'oauth2' | 'oidc';
  clientId: string;
  clientSecret: string;
  frontendCallbackUrl: string;
  redirectUri: string;
  requestTimeoutMs: string;
  scopes: string;
  issuerUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  subjectField: string;
  emailField: string;
  emailVerifiedField: string;
  displayNameField: string;
  usernameField: string;
  iconUrl: string;
  loginEnabled: boolean;
  bindingEnabled: boolean;
}

const fallbackAppDomain = 'http://localhost:8011';

export function getFieldGroups(fields: SetupFieldDefinition[]) {
  const groups: SetupFieldGroup[] = [];

  for (const field of fields) {
    const name = field.group ?? 'General';
    const existingGroup = groups.find((group) => group.name === name);

    if (existingGroup) {
      existingGroup.fields.push(field);
    } else {
      groups.push({
        fields: [field],
        name,
      });
    }
  }

  return groups;
}

export function fieldGroupsNeedHeader(groups: SetupFieldGroup[]) {
  return groups.length > 1 || groups[0]?.name !== 'General';
}

export function parseProfileArray<T>(value: string, isProfile: (profile: unknown) => profile is T) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isProfile);
  } catch {
    return [];
  }
}

export function isProfileObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function getAdministratorValidationError(administrator: SetupAdministrator) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/.test(administrator.username.trim())) {
    return 'The administrator username may contain letters, numbers, underscores, and hyphens.';
  }

  if (administrator.username.trim().length < 3) {
    return 'The administrator username must contain at least 3 characters.';
  }

  if (administrator.username.trim().length > 32) {
    return 'The administrator username must contain at most 32 characters.';
  }

  if (administrator.displayName.trim().length < 2) {
    return 'The administrator display name must contain at least 2 characters.';
  }

  if (administrator.displayName.trim().length > 64) {
    return 'The administrator display name must contain at most 64 characters.';
  }

  if (!administrator.email.trim()) {
    return 'The administrator email address is required.';
  }

  if (administrator.password.length < 8) {
    return 'The administrator password must contain at least 8 characters.';
  }

  if (administrator.password !== administrator.confirmPassword) {
    return 'The administrator password confirmation does not match.';
  }

  return null;
}

export function getPrimaryActionLabel(stepId: string, environment: SetupEnvironment, hasExistingUsers: boolean) {
  if (stepId === 'database') {
    return 'Verify database and continue';
  }

  if (stepId === 'administrator' && hasExistingUsers) {
    return 'Continue';
  }

  if (stepId === 'cache' && environment.CACHE_STORE === 'redis') {
    return 'Verify Redis and continue';
  }

  if (stepId === 'file-storage' && environment.FILE_STORAGE_DRIVER === 'oss') {
    return 'Verify OSS and continue';
  }

  if (stepId === 'file-storage') {
    return 'Verify storage and continue';
  }

  if (stepId === 'logging' && hasLogTarget(environment, 'sls')) {
    return 'Verify SLS and continue';
  }

  if (stepId === 'email' && environment.EMAIL_VERIFICATION_SERVICE === 'smtp') {
    return 'Verify SMTP and continue';
  }

  if (stepId === 'sms' && environment.SMS_VERIFICATION_SERVICE === 'aliyun') {
    return 'Verify SMS and continue';
  }

  if (stepId === 'sso' && environment.SSO_ENABLED === 'true') {
    return 'Verify SSO and continue';
  }

  if (stepId === 'review') {
    return 'Complete setup';
  }

  return 'Validate and continue';
}

export function isEnvironmentValidationStep(stepId: string): stepId is SetupEnvironmentStepId {
  return stepId === 'administrator' || stepId === 'runtime' || stepId === 'scheduler' || stepId === 'security';
}

export function getDefaultSsoProfileBase(appDomain?: string) {
  const domain = getOriginOrValue(appDomain ?? getCurrentOrigin(fallbackAppDomain), fallbackAppDomain);

  return {
    name: 'SSO',
    protocol: 'oidc' as const,
    clientId: '',
    clientSecret: '',
    frontendCallbackUrl: getUrlFromDomain(
      domain,
      routePath('ssoCallback'),
      `${fallbackAppDomain}${routePath('ssoCallback')}`,
    ),
    redirectUri: getUrlFromDomain(domain, '/api/auth/sso/callback', `${fallbackAppDomain}/api/auth/sso/callback`),
    requestTimeoutMs: '10000',
    scopes: 'openid profile email',
    issuerUrl: '',
    authorizationUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    subjectField: 'sub',
    emailField: 'email',
    emailVerifiedField: 'email_verified',
    displayNameField: 'name',
    usernameField: 'preferred_username',
    iconUrl: '',
    loginEnabled: true,
    bindingEnabled: true,
  };
}

export function isEmptySsoProfilesValue(value: string | undefined) {
  return parseProfileArray(value ?? '[]', isProfileObject).length === 0;
}

export function normalizeSsoProfileDraft(profile: Record<string, unknown>, appDomain?: string): SsoProfileDraft {
  const defaults = getDefaultSsoProfileBase(appDomain);
  const rawScopes = profile.scopes;
  const scopes = Array.isArray(rawScopes) ? rawScopes.join(' ') : typeof rawScopes === 'string' ? rawScopes : '';

  return {
    id: typeof profile.id === 'string' ? profile.id : 'oidc',
    ...defaults,
    name: typeof profile.name === 'string' ? profile.name : defaults.name,
    protocol: profile.protocol === 'oauth2' ? 'oauth2' : 'oidc',
    clientId: typeof profile.clientId === 'string' ? profile.clientId : '',
    clientSecret: typeof profile.clientSecret === 'string' ? profile.clientSecret : '',
    frontendCallbackUrl:
      typeof profile.frontendCallbackUrl === 'string' ? profile.frontendCallbackUrl : defaults.frontendCallbackUrl,
    redirectUri: typeof profile.redirectUri === 'string' ? profile.redirectUri : defaults.redirectUri,
    requestTimeoutMs:
      profile.requestTimeoutMs === undefined ? defaults.requestTimeoutMs : String(profile.requestTimeoutMs),
    scopes: scopes || defaults.scopes,
    issuerUrl: typeof profile.issuerUrl === 'string' ? profile.issuerUrl : '',
    authorizationUrl: typeof profile.authorizationUrl === 'string' ? profile.authorizationUrl : '',
    tokenUrl: typeof profile.tokenUrl === 'string' ? profile.tokenUrl : '',
    userInfoUrl: typeof profile.userInfoUrl === 'string' ? profile.userInfoUrl : '',
    subjectField: typeof profile.subjectField === 'string' ? profile.subjectField : defaults.subjectField,
    emailField: typeof profile.emailField === 'string' ? profile.emailField : defaults.emailField,
    emailVerifiedField:
      typeof profile.emailVerifiedField === 'string' ? profile.emailVerifiedField : defaults.emailVerifiedField,
    displayNameField:
      typeof profile.displayNameField === 'string' ? profile.displayNameField : defaults.displayNameField,
    usernameField: typeof profile.usernameField === 'string' ? profile.usernameField : defaults.usernameField,
    iconUrl: typeof profile.iconUrl === 'string' ? profile.iconUrl : '',
    loginEnabled: typeof profile.loginEnabled === 'boolean' ? profile.loginEnabled : true,
    bindingEnabled: typeof profile.bindingEnabled === 'boolean' ? profile.bindingEnabled : true,
  };
}

export function getDefaultSsoProfile(profiles: SsoProfileDraft[], appDomain?: string): SsoProfileDraft {
  const defaults = getDefaultSsoProfileBase(appDomain);
  const usedIds = new Set(profiles.map((profile) => profile.id));
  let id = 'oidc';
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `oidc-${suffix}`;
    suffix += 1;
  }

  return {
    id,
    ...defaults,
  };
}

export function normalizeSsoProfileForStorage(profile: SsoProfileDraft) {
  const base = {
    id: profile.id,
    name: profile.name,
    protocol: profile.protocol,
    clientId: profile.clientId,
    clientSecret: profile.clientSecret,
    frontendCallbackUrl: profile.frontendCallbackUrl,
    redirectUri: profile.redirectUri,
    requestTimeoutMs: profile.requestTimeoutMs,
    scopes: profile.scopes
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  };

  if (profile.protocol === 'oauth2') {
    return {
      ...base,
      authorizationUrl: profile.authorizationUrl,
      tokenUrl: profile.tokenUrl,
      userInfoUrl: profile.userInfoUrl,
      subjectField: profile.subjectField,
      emailField: profile.emailField,
      emailVerifiedField: profile.emailVerifiedField,
      displayNameField: profile.displayNameField,
      usernameField: profile.usernameField,
      ...(profile.iconUrl.trim() ? { iconUrl: profile.iconUrl } : {}),
      loginEnabled: profile.loginEnabled,
      bindingEnabled: profile.bindingEnabled,
    };
  }

  return {
    ...base,
    issuerUrl: profile.issuerUrl,
    ...(profile.iconUrl.trim() ? { iconUrl: profile.iconUrl } : {}),
    loginEnabled: profile.loginEnabled,
    bindingEnabled: profile.bindingEnabled,
  };
}

export function shouldReplaceDomainDefault(value: string | undefined, appDomain: string | undefined) {
  const normalizedValue = value?.trim() ?? '';
  const normalizedDomain = getOriginOrValue(appDomain ?? '', appDomain ?? '');

  return !normalizedValue || normalizedValue === normalizedDomain;
}

export function updateDefaultSsoProfileUrlsForDomain(
  value: string,
  previousDomain: string | undefined,
  nextDomain: string,
) {
  const profiles = parseProfileArray(value, isProfileObject);

  if (profiles.length === 0) {
    return value;
  }

  const previousDefaults = getDefaultSsoProfileBase(previousDomain);
  const fallbackDefaults = getDefaultSsoProfileBase(fallbackAppDomain);
  const nextDefaults = getDefaultSsoProfileBase(nextDomain);

  return JSON.stringify(
    profiles
      .map((profile) => {
        const draft = normalizeSsoProfileDraft(profile, previousDomain);

        return {
          ...draft,
          frontendCallbackUrl: shouldReplaceUrlDefault(
            draft.frontendCallbackUrl,
            previousDefaults.frontendCallbackUrl,
            fallbackDefaults.frontendCallbackUrl,
          )
            ? nextDefaults.frontendCallbackUrl
            : draft.frontendCallbackUrl,
          redirectUri: shouldReplaceUrlDefault(
            draft.redirectUri,
            previousDefaults.redirectUri,
            fallbackDefaults.redirectUri,
          )
            ? nextDefaults.redirectUri
            : draft.redirectUri,
        };
      })
      .map(normalizeSsoProfileForStorage),
  );
}

function shouldReplaceUrlDefault(value: string, ...defaultValues: string[]) {
  const normalizedValue = value.trim();

  return !normalizedValue || defaultValues.includes(normalizedValue);
}

export function getOriginOrValue(value: string, fallback: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

function getUrlFromDomain(domain: string, relativePath: string, fallback: string) {
  try {
    return new URL(relativePath, domain).toString();
  } catch {
    return fallback;
  }
}

export function getCurrentOrigin(fallback: string) {
  return typeof window === 'undefined' ? fallback : window.location.origin || fallback;
}
