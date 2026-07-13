import { AuthVerificationPurpose } from '@tilty/shared/auth';

import { type BackendModule } from '../../core/module';
import { type AuthCookieConfig } from '../auth/auth.http';
import { requireCookieAuthenticated, requireSudoAccess } from '../auth/auth.middleware';
import { type AuthService } from '../auth/auth.service';
import { ApiKeyController } from './api-key.controller';
import { type ApiKeyService } from './api-key.service';

interface ApiKeyModuleOptions {
  cookies: AuthCookieConfig;
}

export function createApiKeyModule(
  apiKeyService: ApiKeyService,
  authService: AuthService,
  options: ApiKeyModuleOptions,
): BackendModule {
  const controller = new ApiKeyController(apiKeyService);
  const requireApiKeyManagement = [
    requireCookieAuthenticated(authService, options.cookies),
    requireSudoAccess(authService, options.cookies, AuthVerificationPurpose.ManageApiKey),
  ];

  return {
    name: 'api-keys',
    prefix: '/api',
    routes: [
      {
        method: 'get',
        path: '/api-keys',
        handlers: [...requireApiKeyManagement, controller.list],
      },
      {
        method: 'post',
        path: '/api-keys',
        handlers: [...requireApiKeyManagement, controller.create],
      },
      {
        method: 'post',
        path: '/api-keys/:id/disable',
        handlers: [...requireApiKeyManagement, controller.disable],
      },
      {
        method: 'post',
        path: '/api-keys/:id/enable',
        handlers: [...requireApiKeyManagement, controller.enable],
      },
      {
        method: 'post',
        path: '/api-keys/:id/revoke',
        handlers: [...requireApiKeyManagement, controller.revoke],
      },
    ],
  };
}
