import { type Middleware } from 'koa';

import { defaultFileUploadMaxBytes } from '@tilty/shared/setup';

import { type BackendModule } from '../../core/module';
import { type ApiKeyService } from '../api-keys/api-key.service';
import { type AuthCookieConfig } from '../auth/auth.http';
import { requireAuthenticated, requireCookieAuthenticated } from '../auth/auth.middleware';
import { type AuthService } from '../auth/auth.service';
import { CurrentUserController } from './current-user.controller';
import { type UserService } from './user.service';
import { UserProfileOptionsController } from './user-profile-options.controller';

interface UsersModuleOptions {
  apiKeyService?: ApiKeyService | undefined;
  cookies: AuthCookieConfig;
  fileUploadMaxBytes?: number;
  rateLimit?: Middleware;
}

export function createUsersModule(
  userService: UserService,
  authService: AuthService,
  options: UsersModuleOptions,
): BackendModule {
  const currentUserController = new CurrentUserController(
    authService,
    options.fileUploadMaxBytes ?? defaultFileUploadMaxBytes,
  );
  const profileOptionsController = new UserProfileOptionsController(userService);
  const requireUsersAuthenticated = requireAuthenticated(authService, options.cookies, options.apiKeyService);
  const requireUsersSession = requireCookieAuthenticated(authService, options.cookies);
  const currentUserHandlers = (handler: Middleware, optionsOverride: { rateLimited?: boolean } = {}) =>
    options.rateLimit && optionsOverride.rateLimited
      ? [requireUsersAuthenticated, options.rateLimit, handler]
      : [requireUsersAuthenticated, handler];
  const currentUserSessionHandlers = (handler: Middleware, optionsOverride: { rateLimited?: boolean } = {}) =>
    options.rateLimit && optionsOverride.rateLimited
      ? [requireUsersSession, options.rateLimit, handler]
      : [requireUsersSession, handler];

  return {
    name: 'users',
    prefix: '/api/users',
    routes: [
      {
        method: 'get',
        path: '/me',
        handlers: currentUserHandlers(currentUserController.me),
      },
      {
        method: 'patch',
        path: '/me',
        handlers: currentUserHandlers(currentUserController.updateMe, { rateLimited: true }),
      },
      {
        method: 'post',
        path: '/me/email-verification',
        handlers: currentUserSessionHandlers(currentUserController.sendEmailVerification, { rateLimited: true }),
      },
      {
        method: 'post',
        path: '/me/email-verification/confirm',
        handlers: currentUserSessionHandlers(currentUserController.verifyEmail, { rateLimited: true }),
      },
      {
        method: 'post',
        path: '/me/phone-verification',
        handlers: currentUserSessionHandlers(currentUserController.sendPhoneVerification, { rateLimited: true }),
      },
      {
        method: 'post',
        path: '/me/phone-verification/confirm',
        handlers: currentUserSessionHandlers(currentUserController.verifyPhone, { rateLimited: true }),
      },
      {
        method: 'post',
        path: '/me/avatar',
        handlers: currentUserHandlers(currentUserController.uploadAvatar, { rateLimited: true }),
      },
      {
        method: 'delete',
        path: '/me/avatar',
        handlers: currentUserHandlers(currentUserController.deleteAvatar, { rateLimited: true }),
      },
      {
        method: 'post',
        path: '/me/profile-banner',
        handlers: currentUserHandlers(currentUserController.uploadProfileBanner, { rateLimited: true }),
      },
      {
        method: 'delete',
        path: '/me/profile-banner',
        handlers: currentUserHandlers(currentUserController.deleteProfileBanner, { rateLimited: true }),
      },
      {
        method: 'post',
        path: '/me/profile-background',
        handlers: currentUserHandlers(currentUserController.uploadProfileBackground, { rateLimited: true }),
      },
      {
        method: 'delete',
        path: '/me/profile-background',
        handlers: currentUserHandlers(currentUserController.deleteProfileBackground, { rateLimited: true }),
      },
      {
        method: 'get',
        path: '/profile-options/genders',
        handlers: [requireUsersAuthenticated, profileOptionsController.genders],
      },
      {
        method: 'get',
        path: '/profile-options/locations/countries',
        handlers: [profileOptionsController.locationCountries],
      },
      {
        method: 'get',
        path: '/profile-options/locations/regions',
        handlers: [profileOptionsController.locationRegions],
      },
      {
        method: 'get',
        path: '/profile-options/locations/cities',
        handlers: [profileOptionsController.locationCities],
      },
    ],
  };
}
