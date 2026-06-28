import { type BackendModule } from '../core/module';
import { rateLimitMiddleware, type RateLimitOptions } from '../middleware/rate-limit';
import { createAuthModule } from '../modules/auth';
import { type AuthCookieConfig, defaultAuthCookieConfig } from '../modules/auth/auth.http';
import { createDemoModule } from '../modules/demo';
import { createDocsModule } from '../modules/docs';
import { createHealthModule, type ReadinessCheck } from '../modules/health';
import { createProfileOptionsModule } from '../modules/profile-options';
import { createLockedSetupModule } from '../modules/setup';
import { createSystemSettingsModule } from '../modules/system-settings';
import { createUsersModule } from '../modules/users';
import { type Services } from './services';

interface ModuleConfig {
  authCookies?: AuthCookieConfig;
  authRateLimit: RateLimitOptions;
  avatarUploadMaxBytes: number;
  readinessChecks?: ReadinessCheck[];
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
      avatarUploadMaxBytes: config?.avatarUploadMaxBytes ?? 2 * 1024 * 1024,
      cookies: authCookies,
      ssoService: services.sso,
    }),
    createSystemSettingsModule(services.auth, {
      cookies: authCookies,
    }),
    createProfileOptionsModule(services.user, {
      authService: services.auth,
      cookies: authCookies,
    }),
    createDocsModule(),
    createDemoModule(),
  ];
}
