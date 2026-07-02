import { type IntlShape } from 'react-intl';

import { type SetupAdministrator, type SetupEnvironment, type SetupEnvironmentStepId } from '@/lib/setup';
import { routePath } from '@/router';
import {
  setupEnvironmentStepValues,
  SetupSmsVerificationService,
  SetupSsoProtocol,
  type SetupSsoProtocolValue,
} from '@tilty/shared/setup';
import {
  displayNameMaxLength,
  displayNameMinLength,
  emailMaxLength,
  passwordMaxLength,
  passwordMinLength,
  usernameMaxLength,
  usernameMinLength,
  usernamePattern,
} from '@tilty/shared/validation';

import { hasLogTarget, type SetupFieldDefinition, type SetupStepDefinition } from './definitions';

interface SetupFieldGroup {
  fields: SetupFieldDefinition[];
  name: string;
}

export interface SsoProfileDraft {
  id: string;
  name: string;
  protocol: SetupSsoProtocolValue;
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

const setupEnvironmentStepSet = new Set<string>(setupEnvironmentStepValues);

const fallbackAppDomain = 'http://localhost:8011';

const setupCommonOptionMessageIds: Record<string, string> = {
  false: 'common.disabled',
  off: 'common.disabled',
  true: 'common.enabled',
};

export function getFieldGroups(fields: SetupFieldDefinition[]) {
  const groups: SetupFieldGroup[] = [];

  for (const field of fields) {
    const name = field.group ?? 'general';
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

export function shouldShowFieldGroupHeaders(groups: SetupFieldGroup[]) {
  return groups.length > 1 || groups[0]?.name !== 'general';
}

export function getAdministratorValidationError(administrator: SetupAdministrator, intl: IntlShape) {
  const username = administrator.username.trim();
  const displayName = administrator.displayName.trim();
  const email = administrator.email.trim();

  if (username.length < usernameMinLength) {
    return intl.formatMessage({ id: 'setup.validation.username.min' });
  }

  if (username.length > usernameMaxLength) {
    return intl.formatMessage({ id: 'setup.validation.username.max' });
  }

  if (!usernamePattern.test(username)) {
    return intl.formatMessage({ id: 'setup.validation.username.pattern' });
  }

  if (displayName.length < displayNameMinLength) {
    return intl.formatMessage({ id: 'setup.validation.display.name.min' });
  }

  if (displayName.length > displayNameMaxLength) {
    return intl.formatMessage({ id: 'setup.validation.display.name.max' });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return intl.formatMessage({ id: 'setup.validation.email.required' });
  }

  if (email.length > emailMaxLength) {
    return intl.formatMessage({ id: 'setup.validation.email.max' });
  }

  if (administrator.password.length < passwordMinLength) {
    return intl.formatMessage({ id: 'setup.validation.password.min' });
  }

  if (administrator.password.length > passwordMaxLength) {
    return intl.formatMessage({ id: 'setup.validation.password.max' });
  }

  if (administrator.password !== administrator.confirmPassword) {
    return intl.formatMessage({ id: 'setup.validation.password.confirmation.mismatch' });
  }

  return null;
}

export function isProfileObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProfileArray<T>(value: string, guard: (profile: unknown) => profile is T): T[] {
  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

export function formatSetupStepTitle(step: Pick<SetupStepDefinition, 'id'>, intl: IntlShape) {
  return intl.formatMessage({ id: `setup.step.${toMessagePathPart(step.id)}` });
}

export function formatSetupFieldGroupName(name: string, intl: IntlShape) {
  return intl.formatMessage({ id: `setup.section.${toMessagePathPart(name)}` });
}

export function formatSetupFieldLabel(field: SetupFieldDefinition, intl: IntlShape) {
  return intl.formatMessage({ id: `setup.field.${field.key}.label` });
}

export function formatSetupFieldDescription(key: string, intl: IntlShape) {
  return intl.formatMessage({ id: `setup.field.${key}.description` });
}

export function formatSetupFieldPlaceholder(key: string, intl: IntlShape) {
  return intl.formatMessage({ id: `setup.field.${key}.placeholder` });
}

export function formatSetupFieldOptions(field: SetupFieldDefinition, intl: IntlShape) {
  return field.options?.map((option) => ({
    ...option,
    label: formatSetupOptionLabel(field.key, option, intl),
  }));
}

function formatSetupOptionLabel(
  fieldKey: string,
  option: NonNullable<SetupFieldDefinition['options']>[number],
  intl: IntlShape,
) {
  const commonId = setupCommonOptionMessageIds[option.value];

  return intl.formatMessage({ id: commonId ?? `setup.option.${fieldKey}.${toMessageKeyPart(option.value)}` });
}

function toMessageKeyPart(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'empty'
  );
}

export function toMessagePathPart(value: string) {
  return (
    value
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1.$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'empty'
  );
}

export function getPrimaryActionLabel(
  stepId: string,
  environment: SetupEnvironment,
  hasExistingUsers: boolean,
  intl: IntlShape,
) {
  if (stepId === 'database') {
    return formatSetupUtilityMessage(intl, 'setup.action.verify.database.and.continue');
  }

  if (stepId === 'administrator' && hasExistingUsers) {
    return formatSetupUtilityMessage(intl, 'common.continue');
  }

  if (stepId === 'cache' && environment.CACHE_STORE === 'redis') {
    return formatSetupUtilityMessage(intl, 'setup.action.verify.redis.and.continue');
  }

  if (stepId === 'file-storage' && environment.FILE_STORAGE_DRIVER === 'oss') {
    return formatSetupUtilityMessage(intl, 'setup.action.verify.oss.and.continue');
  }

  if (stepId === 'file-storage') {
    return formatSetupUtilityMessage(intl, 'setup.action.verify.storage.and.continue');
  }

  if (stepId === 'logging' && hasLogTarget(environment, 'sls')) {
    return formatSetupUtilityMessage(intl, 'setup.action.verify.sls.and.continue');
  }

  if (stepId === 'email' && environment.EMAIL_VERIFICATION_SERVICE === 'smtp') {
    return formatSetupUtilityMessage(intl, 'setup.action.verify.smtp.and.continue');
  }

  if (stepId === 'sms' && environment.SMS_VERIFICATION_SERVICE === SetupSmsVerificationService.Aliyun) {
    return formatSetupUtilityMessage(intl, 'setup.action.verify.sms.and.continue');
  }

  if (stepId === 'sso' && environment.SSO_ENABLED === 'true') {
    return formatSetupUtilityMessage(intl, 'setup.action.verify.sso.and.continue');
  }

  if (stepId === 'review') {
    return formatSetupUtilityMessage(intl, 'setup.action.complete.setup');
  }

  return formatSetupUtilityMessage(intl, 'setup.action.validate.and.continue');
}

function formatSetupUtilityMessage(intl: IntlShape, id: string) {
  return intl.formatMessage({ id });
}

export function isEnvironmentValidationStep(stepId: string): stepId is SetupEnvironmentStepId {
  return setupEnvironmentStepSet.has(stepId);
}

export function getDefaultSsoProfileBase(appDomain?: string) {
  const domain = getOriginOrValue(appDomain ?? getCurrentOrigin(fallbackAppDomain), fallbackAppDomain);

  return {
    name: 'SSO',
    protocol: SetupSsoProtocol.Oidc,
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
    protocol: profile.protocol === SetupSsoProtocol.Oauth2 ? SetupSsoProtocol.Oauth2 : SetupSsoProtocol.Oidc,
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

  if (profile.protocol === SetupSsoProtocol.Oauth2) {
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
