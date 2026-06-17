import { Sequelize } from 'sequelize';

import { BackendModule } from '../core/module';
import { RateLimitOptions, rateLimitMiddleware } from '../middleware/rate-limit';
import { EmailVerificationService, SmtpEmailSender, SmtpEmailSenderConfig } from './auth/auth.email';
import { AuthService } from './auth/auth.service';
import { SsoConfig, SsoService } from './auth/auth.sso';
import { createAuthModule } from './auth';
import { createDemoModule } from './demo';
import { createDocsModule } from './docs';
import { createHealthModule, ReadinessCheck } from './health';
import { initUserModel, UserModel } from './users/user.model';
import { UserService } from './users/user.service';

export interface ServiceConfig {
  authTokenSecret: string;
  email?: EmailServiceConfig;
  sso?: SsoConfig;
}

export interface EmailServiceConfig {
  codeCooldownMs: number;
  codeExpiresInMs: number;
  smtp: SmtpEmailSenderConfig;
}

export interface ModuleConfig {
  authRateLimit: RateLimitOptions;
  readinessChecks?: ReadinessCheck[];
}

export interface Models {
  user: typeof UserModel;
}

export interface Services {
  auth: AuthService;
  sso: SsoService;
  user: UserService;
}

export function initModels(sequelize: Sequelize): Models {
  return {
    user: initUserModel(sequelize),
  };
}

export function createServices(models: Models, config: ServiceConfig): Services {
  const user = new UserService(models.user);
  const emailVerification = createEmailVerificationService(config.email);

  return {
    auth: new AuthService(user, config.authTokenSecret, emailVerification),
    sso: new SsoService(user, config.authTokenSecret, config.sso),
    user,
  };
}

export function createModules(services: Services, config?: ModuleConfig): BackendModule[] {
  const authRateLimit = config ? rateLimitMiddleware(config.authRateLimit) : undefined;
  const authOptions = authRateLimit ? { rateLimit: authRateLimit } : {};
  const healthOptions = config?.readinessChecks ? { readinessChecks: config.readinessChecks } : {};

  return [
    createHealthModule(healthOptions),
    createAuthModule(services.auth, { ...authOptions, ssoService: services.sso }),
    createDocsModule(),
    createDemoModule(),
  ];
}

function createEmailVerificationService(config?: EmailServiceConfig) {
  if (!config) {
    return new EmailVerificationService();
  }

  return new EmailVerificationService({
    codeCooldownMs: config.codeCooldownMs,
    codeExpiresInMs: config.codeExpiresInMs,
    sender: new SmtpEmailSender(config.smtp),
  });
}
