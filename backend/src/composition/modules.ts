import { defaultFileUploadMaxBytes } from '@tilty/shared/setup';

import { type BackendModule } from '../core/module';
import { rateLimitMiddleware, type RateLimitOptions } from '../middleware/rate-limit';
import { createAdminModule } from '../modules/admin';
import { createApiKeyModule } from '../modules/api-keys';
import { createAuthModule } from '../modules/auth';
import { type AuthCookieConfig, defaultAuthCookieConfig } from '../modules/auth/auth.http';
import { createDemoModule } from '../modules/demo';
import { createDocsModule } from '../modules/docs';
import { createHealthModule, type ReadinessCheck } from '../modules/health';
import { createLockedSetupModule } from '../modules/setup';
import { createUsersModule } from '../modules/users';
import { type Services } from './services';

interface ModuleConfig {
  authCookies?: AuthCookieConfig;
  authRateLimit: RateLimitOptions;
  fileUploadMaxBytes: number;
  readinessChecks?: ReadinessCheck[];
}

export function createModules(services: Services, config?: ModuleConfig): BackendModule[] {
  const authRateLimit = config ? rateLimitMiddleware(config.authRateLimit) : undefined;
  const authOptions = authRateLimit ? { rateLimit: authRateLimit } : {};
  const authCookies = config?.authCookies ?? defaultAuthCookieConfig;
  const fileUploadMaxBytes = config?.fileUploadMaxBytes ?? defaultFileUploadMaxBytes;
  const healthOptions = config?.readinessChecks ? { readinessChecks: config.readinessChecks } : {};

  return [
    createLockedSetupModule(),
    createHealthModule(healthOptions),
    createAuthModule(services.auth, {
      ...authOptions,
      cookies: authCookies,
      fileUploadMaxBytes,
      ssoService: services.sso,
    }),
    createApiKeyModule(services.apiKey, services.auth, {
      cookies: authCookies,
    }),
    createUsersModule(services.user, services.auth, {
      apiKeyService: services.apiKey,
      cookies: authCookies,
      fileUploadMaxBytes,
      ...(authRateLimit ? { rateLimit: authRateLimit } : {}),
    }),
    createAdminModule(services.user, services.accessControl, services.auth, {
      apiKeyService: services.apiKey,
      cookies: authCookies,
      fileUploadMaxBytes,
      ssoService: services.sso,
    }),
    createDocsModule(),
    createDemoModule(),
  ];
}
