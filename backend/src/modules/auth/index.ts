import { type Middleware } from 'koa';

import { type BackendModule } from '../../core/module';
import { AuthController, type AuthCookieConfig } from './auth.controller';
import { type AuthService } from './auth.service';
import { type SsoService } from './auth.sso';

interface AuthModuleOptions {
  avatarUploadMaxBytes?: number;
  cookies: AuthCookieConfig;
  rateLimit?: Middleware;
  ssoService: SsoService;
}

export function createAuthModule(authService: AuthService, options: AuthModuleOptions): BackendModule {
  const controller = new AuthController(
    authService,
    options.ssoService,
    options.avatarUploadMaxBytes ?? 2 * 1024 * 1024,
    options.cookies,
  );
  const rateLimitedHandlers = (handler: Middleware) => (options.rateLimit ? [options.rateLimit, handler] : [handler]);

  return {
    name: 'auth',
    prefix: '/api/auth',
    routes: [
      {
        method: 'get',
        path: '/config',
        handlers: [controller.config],
      },
      {
        method: 'post',
        path: '/register',
        handlers: rateLimitedHandlers(controller.register),
      },
      {
        method: 'post',
        path: '/register/email-verification',
        handlers: rateLimitedHandlers(controller.sendRegistrationEmailVerification),
      },
      {
        method: 'post',
        path: '/password-reset/email-verification',
        handlers: rateLimitedHandlers(controller.sendPasswordResetEmailVerification),
      },
      {
        method: 'post',
        path: '/me/email-verification',
        handlers: rateLimitedHandlers(controller.sendProfileEmailVerification),
      },
      {
        method: 'post',
        path: '/me/email-verification/confirm',
        handlers: rateLimitedHandlers(controller.verifyProfileEmail),
      },
      {
        method: 'post',
        path: '/me/phone-verification',
        handlers: rateLimitedHandlers(controller.sendProfilePhoneVerification),
      },
      {
        method: 'post',
        path: '/me/phone-verification/confirm',
        handlers: rateLimitedHandlers(controller.verifyProfilePhone),
      },
      {
        method: 'post',
        path: '/password-reset',
        handlers: rateLimitedHandlers(controller.resetPassword),
      },
      {
        method: 'post',
        path: '/login',
        handlers: rateLimitedHandlers(controller.login),
      },
      {
        method: 'get',
        path: '/me',
        handlers: [controller.me],
      },
      {
        method: 'patch',
        path: '/me',
        handlers: rateLimitedHandlers(controller.updateMe),
      },
      {
        method: 'post',
        path: '/refresh',
        handlers: [controller.refresh],
      },
      {
        method: 'post',
        path: '/logout',
        handlers: [controller.logout],
      },
      {
        method: 'post',
        path: '/avatar',
        handlers: rateLimitedHandlers(controller.avatar),
      },
      {
        method: 'get',
        path: '/sso/config',
        handlers: [controller.ssoConfig],
      },
      {
        method: 'get',
        path: '/sso/start',
        handlers: [controller.ssoStart],
      },
      {
        method: 'get',
        path: '/sso/bind/start',
        handlers: [controller.ssoBindStart],
      },
      {
        method: 'get',
        path: '/sso/identities',
        handlers: [controller.ssoIdentities],
      },
      {
        method: 'get',
        path: '/sso/callback',
        handlers: [controller.ssoCallback],
      },
      {
        method: 'post',
        path: '/sso/session',
        handlers: [controller.ssoSession],
      },
      {
        method: 'post',
        path: '/sso/account',
        handlers: rateLimitedHandlers(controller.ssoCreateAccount),
      },
      {
        method: 'post',
        path: '/sso/bind',
        handlers: rateLimitedHandlers(controller.ssoBindAccount),
      },
    ],
  };
}
