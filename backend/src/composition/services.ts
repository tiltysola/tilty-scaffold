import { type CacheStore, MemoryCacheStore } from '../infra/cache';
import { type FileStorage } from '../infra/file-storage';
import { AccessControlService } from '../modules/access-control/access-control.service';
import { EmailVerificationService, type SmtpEmailSenderConfig, SmtpEmailSenderPool } from '../modules/auth/auth.email';
import { AuthService, type AuthTokenConfig, defaultAuthTokenConfig } from '../modules/auth/auth.service';
import { type AliyunSmsProfileConfig, AliyunSmsSenderPool, SmsVerificationService } from '../modules/auth/auth.sms';
import { SsoService, type SsoServiceConfig } from '../modules/auth/auth.sso';
import { defaultTotpConfig, type TotpConfig, TotpService } from '../modules/auth/auth.totp';
import {
  defaultPasskeyRuntimeConfig,
  type PasskeyConfig,
  type PasskeyRuntimeConfig,
  PasskeyService,
} from '../modules/auth/auth-passkey.service';
import { AuthSessionService } from '../modules/auth/auth-session.service';
import {
  type AuthVerificationConfig,
  AuthVerificationService,
  defaultAuthVerificationConfig,
} from '../modules/auth/auth-verification.service';
import { UserService } from '../modules/users/user.service';
import { type Models } from './models';

interface ServiceConfig {
  appDomain?: string;
  authTokens?: AuthTokenConfig;
  authTokenSecret: string;
  authVerification?: AuthVerificationConfig;
  cacheStore?: CacheStore;
  email?: EmailServiceConfig;
  fileStorage?: FileStorage;
  passkey?: PasskeyRuntimeConfig;
  sms?: SmsServiceConfig;
  sso?: SsoServiceConfig;
  totp?: TotpConfig;
}

interface EmailServiceConfig {
  codeCooldownMs: number;
  codeExpiresInMs: number;
  smtpProfiles: SmtpEmailSenderConfig[];
}

interface SmsServiceConfig {
  aliyunProfiles: AliyunSmsProfileConfig[];
  codeCooldownMs: number;
  codeExpiresInMs: number;
}

export interface Services {
  accessControl: AccessControlService;
  auth: AuthService;
  authPasskey: PasskeyService;
  authSession: AuthSessionService;
  authVerification: AuthVerificationService;
  sso: SsoService;
  totp: TotpService;
  user: UserService;
}

export function createServices(models: Models, config: ServiceConfig): Services {
  const accessControl = new AccessControlService(models);
  const user = new UserService(models.user, models.ssoIdentity);
  const cacheStore = config.cacheStore ?? new MemoryCacheStore();
  const authTokens = config.authTokens ?? defaultAuthTokenConfig;
  const emailVerification = createEmailVerificationService(config.email, cacheStore, config.authTokenSecret);
  const smsVerification = createSmsVerificationService(config.sms, cacheStore, config.authTokenSecret);
  const authSession = new AuthSessionService(models.authSession, config.authTokenSecret);
  const authPasskey = new PasskeyService(
    models.authPasskey,
    cacheStore,
    getPasskeyConfig(config.appDomain, config.passkey),
  );
  const totp = new TotpService(models.user, cacheStore, config.authTokenSecret, config.totp ?? defaultTotpConfig);
  const authVerification = new AuthVerificationService(
    cacheStore,
    config.authTokenSecret,
    authPasskey,
    totp,
    emailVerification,
    smsVerification,
    config.authVerification ?? defaultAuthVerificationConfig,
  );

  return {
    accessControl,
    auth: new AuthService(
      user,
      accessControl,
      config.authTokenSecret,
      emailVerification,
      config.fileStorage,
      authTokens,
      cacheStore,
      authSession,
      totp,
      authPasskey,
      authVerification,
      smsVerification,
    ),
    authPasskey,
    authSession,
    authVerification,
    sso: new SsoService(
      user,
      accessControl,
      config.authTokenSecret,
      config.sso,
      cacheStore,
      authTokens,
      authSession,
      authVerification,
    ),
    totp,
    user,
  };
}

function getPasskeyConfig(
  appDomain = 'http://localhost:8011',
  config: PasskeyRuntimeConfig = defaultPasskeyRuntimeConfig,
): PasskeyConfig {
  const origin = new URL(appDomain).origin;

  return {
    origin,
    rpID: new URL(origin).hostname,
    rpName: config.rpName,
    registrationTtlMs: config.registrationTtlMs,
    operationTimeoutMs: config.operationTimeoutMs,
  };
}

function createSmsVerificationService(
  config: SmsServiceConfig | undefined,
  cacheStore: CacheStore,
  verificationSecret: string,
) {
  if (!config) {
    return new SmsVerificationService();
  }

  const sender = new AliyunSmsSenderPool(config.aliyunProfiles);

  return new SmsVerificationService({
    cacheStore,
    codeCooldownMs: config.codeCooldownMs,
    codeExpiresInMs: config.codeExpiresInMs,
    phoneCountryCodes: sender.getPhoneCountryCodes(),
    sender,
    verificationSecret,
  });
}

function createEmailVerificationService(
  config: EmailServiceConfig | undefined,
  cacheStore: CacheStore,
  verificationSecret: string,
) {
  if (!config) {
    return new EmailVerificationService();
  }

  return new EmailVerificationService({
    cacheStore,
    codeCooldownMs: config.codeCooldownMs,
    codeExpiresInMs: config.codeExpiresInMs,
    sender: new SmtpEmailSenderPool(config.smtpProfiles),
    verificationSecret,
  });
}
