import { type Middleware } from 'koa';

import { type BackendModule } from '../../core/module';
import { AuthController } from './auth.controller';
import { type AuthCookieConfig } from './auth.http';
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
        path: '/me/phone-verification',
        handlers: rateLimitedHandlers(controller.sendProfilePhoneVerification),
      },
      {
        method: 'post',
        path: '/login',
        handlers: rateLimitedHandlers(controller.login),
      },
      {
        method: 'post',
        path: '/password-reset',
        handlers: rateLimitedHandlers(controller.resetPassword),
      },
      {
        method: 'post',
        path: '/me/email-verification/confirm',
        handlers: rateLimitedHandlers(controller.verifyProfileEmail),
      },
      {
        method: 'post',
        path: '/me/phone-verification/confirm',
        handlers: rateLimitedHandlers(controller.verifyProfilePhone),
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
        method: 'patch',
        path: '/me/password',
        handlers: rateLimitedHandlers(controller.changePassword),
      },
      {
        method: 'post',
        path: '/avatar',
        handlers: rateLimitedHandlers(controller.avatar),
      },
      {
        method: 'delete',
        path: '/avatar',
        handlers: rateLimitedHandlers(controller.deleteAvatar),
      },
      {
        method: 'post',
        path: '/profile-banner',
        handlers: rateLimitedHandlers(controller.profileBanner),
      },
      {
        method: 'delete',
        path: '/profile-banner',
        handlers: rateLimitedHandlers(controller.deleteProfileBanner),
      },
      {
        method: 'post',
        path: '/profile-background',
        handlers: rateLimitedHandlers(controller.profileBackground),
      },
      {
        method: 'delete',
        path: '/profile-background',
        handlers: rateLimitedHandlers(controller.deleteProfileBackground),
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
        method: 'get',
        path: '/totp',
        handlers: [controller.totpStatus],
      },
      {
        method: 'post',
        path: '/totp/setup',
        handlers: rateLimitedHandlers(controller.totpSetup),
      },
      {
        method: 'post',
        path: '/totp/enable',
        handlers: rateLimitedHandlers(controller.totpEnable),
      },
      {
        method: 'post',
        path: '/verification/challenges',
        handlers: rateLimitedHandlers(controller.createVerificationChallenge),
      },
      {
        method: 'post',
        path: '/verification/code',
        handlers: rateLimitedHandlers(controller.sendVerificationCode),
      },
      {
        method: 'post',
        path: '/verification/passkey/options',
        handlers: rateLimitedHandlers(controller.verificationPasskeyOptions),
      },
      {
        method: 'post',
        path: '/verification/confirm',
        handlers: rateLimitedHandlers(controller.verifyAuthenticationChallenge),
      },
      {
        method: 'post',
        path: '/totp/disable',
        handlers: rateLimitedHandlers(controller.totpDisable),
      },
      {
        method: 'post',
        path: '/totp/recovery-codes',
        handlers: rateLimitedHandlers(controller.totpRegenerateRecoveryCodes),
      },
      {
        method: 'get',
        path: '/mfa',
        handlers: [controller.mfaSettings],
      },
      {
        method: 'patch',
        path: '/mfa',
        handlers: rateLimitedHandlers(controller.updateMfaSettings),
      },
      {
        method: 'get',
        path: '/passkeys',
        handlers: [controller.passkeys],
      },
      {
        method: 'post',
        path: '/passkeys/registration-options',
        handlers: rateLimitedHandlers(controller.passkeyRegistrationOptions),
      },
      {
        method: 'post',
        path: '/passkeys',
        handlers: rateLimitedHandlers(controller.passkeyRegistrationVerify),
      },
      {
        method: 'delete',
        path: '/passkeys/:passkeyId',
        handlers: rateLimitedHandlers(controller.deletePasskey),
      },
      {
        method: 'get',
        path: '/devices',
        handlers: [controller.deviceSessions],
      },
      {
        method: 'delete',
        path: '/devices/others',
        handlers: rateLimitedHandlers(controller.revokeOtherDeviceSessions),
      },
      {
        method: 'delete',
        path: '/devices/:sessionId',
        handlers: rateLimitedHandlers(controller.revokeDeviceSession),
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
      {
        method: 'get',
        path: '/sso/identities',
        handlers: [controller.ssoIdentities],
      },
    ],
  };
}
