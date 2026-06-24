import { type Sequelize } from 'sequelize';

import { type BackendModule } from '../core/module';
import { type CacheStore, MemoryCacheStore } from '../infra/cache';
import { type FileStorage } from '../infra/file-storage';
import { rateLimitMiddleware, type RateLimitOptions } from '../middleware/rate-limit';
import {
  initAccessControlModels,
  type PermissionModel,
  type RoleModel,
  type RolePermissionModel,
  type UserRoleModel,
} from './access-control/access-control.model';
import { AccessControlService } from './access-control/access-control.service';
import { createAuthModule } from './auth';
import { type AuthCookieConfig, defaultAuthCookieConfig } from './auth/auth.controller';
import { EmailVerificationService, type SmtpEmailSenderConfig, SmtpEmailSenderPool } from './auth/auth.email';
import { AuthService, type AuthTokenConfig, defaultAuthTokenConfig } from './auth/auth.service';
import { type AliyunSmsProfileConfig, AliyunSmsSenderPool, SmsVerificationService } from './auth/auth.sms';
import { SsoService, type SsoServiceConfig } from './auth/auth.sso';
import { createDemoModule } from './demo';
import { createDocsModule } from './docs';
import { createHealthModule, type ReadinessCheck } from './health';
import { createLockedSetupModule } from './setup';
import { createUsersModule } from './users';
import { initSsoIdentityModel, initUserModel, type SsoIdentityModel, type UserModel } from './users/user.model';
import { UserService } from './users/user.service';

interface ServiceConfig {
  authTokens?: AuthTokenConfig;
  authTokenSecret: string;
  cacheStore?: CacheStore;
  email?: EmailServiceConfig;
  fileStorage?: FileStorage;
  sms?: SmsServiceConfig;
  sso?: SsoServiceConfig;
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

interface ModuleConfig {
  authCookies?: AuthCookieConfig;
  authRateLimit: RateLimitOptions;
  avatarUploadMaxBytes: number;
  readinessChecks?: ReadinessCheck[];
}

interface Models {
  permission: typeof PermissionModel;
  role: typeof RoleModel;
  rolePermission: typeof RolePermissionModel;
  ssoIdentity: typeof SsoIdentityModel;
  user: typeof UserModel;
  userRole: typeof UserRoleModel;
}

interface Services {
  accessControl: AccessControlService;
  auth: AuthService;
  sso: SsoService;
  user: UserService;
}

export function initModels(sequelize: Sequelize): Models {
  const user = initUserModel(sequelize);

  return {
    ...initAccessControlModels(sequelize),
    ssoIdentity: initSsoIdentityModel(sequelize),
    user,
  };
}

export function createServices(models: Models, config: ServiceConfig): Services {
  const accessControl = new AccessControlService(models);
  const user = new UserService(models.user, models.ssoIdentity);
  const cacheStore = config.cacheStore ?? new MemoryCacheStore();
  const authTokens = config.authTokens ?? defaultAuthTokenConfig;
  const emailVerification = createEmailVerificationService(config.email, cacheStore, config.authTokenSecret);
  const smsVerification = createSmsVerificationService(config.sms, cacheStore, config.authTokenSecret);

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
      smsVerification,
    ),
    sso: new SsoService(user, accessControl, config.authTokenSecret, config.sso, cacheStore, authTokens),
    user,
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

export function createModules(services: Services, config?: ModuleConfig): BackendModule[] {
  const authRateLimit = config ? rateLimitMiddleware(config.authRateLimit) : undefined;
  const authOptions = authRateLimit ? { rateLimit: authRateLimit } : {};
  const authCookies = config?.authCookies ?? defaultAuthCookieConfig;
  const healthOptions = config?.readinessChecks ? { readinessChecks: config.readinessChecks } : {};

  return [
    createLockedSetupModule(),
    createHealthModule(healthOptions),
    createAuthModule(services.auth, {
      ...authOptions,
      avatarUploadMaxBytes: config?.avatarUploadMaxBytes ?? 2 * 1024 * 1024,
      cookies: authCookies,
      ssoService: services.sso,
    }),
    createUsersModule(services.user, services.accessControl, services.auth, {
      cookies: authCookies,
    }),
    createDocsModule(),
    createDemoModule(),
  ];
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
