import { type Middleware } from 'koa';

import { defaultFileUploadMaxBytes } from '@tilty/shared/setup';

import { type BackendModule } from '../../core/module';
import { type AuthCookieConfig } from './auth.http';
import { rejectApiKeyAuthorization } from './auth.middleware';
import { type AuthService } from './auth.service';
import { type SsoService } from './auth.sso';
import { AuthAccountController } from './auth-account.controller';
import { AuthDeviceController } from './auth-device.controller';
import { AuthMfaController } from './auth-mfa.controller';
import { AuthPasskeyController } from './auth-passkey.controller';
import { AuthPasswordController } from './auth-password.controller';
import { AuthSessionController } from './auth-session.controller';
import { AuthSsoController } from './auth-sso.controller';
import { AuthTotpController } from './auth-totp.controller';
import { AuthVerificationController } from './auth-verification.controller';

interface AuthModuleOptions {
  cookies: AuthCookieConfig;
  fileUploadMaxBytes?: number;
  rateLimit?: Middleware;
  ssoService: SsoService;
}

export function createAuthModule(authService: AuthService, options: AuthModuleOptions): BackendModule {
  const accountController = new AuthAccountController(
    authService,
    options.fileUploadMaxBytes ?? defaultFileUploadMaxBytes,
    options.cookies,
  );
  const deviceController = new AuthDeviceController(authService, options.cookies);
  const mfaController = new AuthMfaController(authService, options.cookies);
  const passkeyController = new AuthPasskeyController(authService, options.cookies);
  const passwordController = new AuthPasswordController(authService, options.cookies);
  const sessionController = new AuthSessionController(authService, options.cookies);
  const ssoController = new AuthSsoController(authService, options.ssoService, options.cookies);
  const totpController = new AuthTotpController(authService, options.cookies);
  const verificationController = new AuthVerificationController(authService, options.cookies);
  const rejectApiKey = rejectApiKeyAuthorization(options.cookies);
  const withApiKeyRejection = (handler: Middleware) =>
    (async (ctx, next) => {
      await rejectApiKey(ctx, () => handler(ctx, next));
    }) satisfies Middleware;
  const sessionHandlers = (handler: Middleware) => [withApiKeyRejection(handler)];
  const rateLimitedSessionHandlers = (handler: Middleware) =>
    options.rateLimit ? [options.rateLimit, withApiKeyRejection(handler)] : sessionHandlers(handler);

  return {
    name: 'auth',
    prefix: '/api/auth',
    routes: [
      {
        method: 'get',
        path: '/config',
        handlers: [accountController.config],
      },
      {
        method: 'post',
        path: '/register',
        handlers: rateLimitedSessionHandlers(accountController.register),
      },
      {
        method: 'post',
        path: '/register/email-verification',
        handlers: rateLimitedSessionHandlers(accountController.sendRegistrationEmailVerification),
      },
      {
        method: 'post',
        path: '/password-reset/email-verification',
        handlers: rateLimitedSessionHandlers(accountController.sendPasswordResetEmailVerification),
      },
      {
        method: 'post',
        path: '/login',
        handlers: rateLimitedSessionHandlers(sessionController.login),
      },
      {
        method: 'post',
        path: '/password-reset',
        handlers: rateLimitedSessionHandlers(accountController.resetPassword),
      },
      {
        method: 'patch',
        path: '/password',
        handlers: rateLimitedSessionHandlers(passwordController.changePassword),
      },
      {
        method: 'post',
        path: '/refresh',
        handlers: sessionHandlers(sessionController.refresh),
      },
      {
        method: 'post',
        path: '/logout',
        handlers: sessionHandlers(sessionController.logout),
      },
      {
        method: 'get',
        path: '/totp',
        handlers: sessionHandlers(totpController.status),
      },
      {
        method: 'post',
        path: '/totp/setup',
        handlers: rateLimitedSessionHandlers(totpController.setup),
      },
      {
        method: 'post',
        path: '/totp/enable',
        handlers: rateLimitedSessionHandlers(totpController.enable),
      },
      {
        method: 'post',
        path: '/verification/challenges',
        handlers: rateLimitedSessionHandlers(verificationController.createChallenge),
      },
      {
        method: 'post',
        path: '/verification/code',
        handlers: rateLimitedSessionHandlers(verificationController.sendCode),
      },
      {
        method: 'post',
        path: '/verification/passkey/options',
        handlers: rateLimitedSessionHandlers(verificationController.createPasskeyOptions),
      },
      {
        method: 'post',
        path: '/verification/confirm',
        handlers: rateLimitedSessionHandlers(verificationController.verifyChallenge),
      },
      {
        method: 'post',
        path: '/totp/disable',
        handlers: rateLimitedSessionHandlers(totpController.disable),
      },
      {
        method: 'post',
        path: '/totp/recovery-codes',
        handlers: rateLimitedSessionHandlers(totpController.regenerateRecoveryCodes),
      },
      {
        method: 'get',
        path: '/mfa',
        handlers: sessionHandlers(mfaController.getSettings),
      },
      {
        method: 'patch',
        path: '/mfa',
        handlers: rateLimitedSessionHandlers(mfaController.updateSettings),
      },
      {
        method: 'get',
        path: '/passkeys',
        handlers: sessionHandlers(passkeyController.list),
      },
      {
        method: 'post',
        path: '/passkeys/registration-options',
        handlers: rateLimitedSessionHandlers(passkeyController.createRegistrationOptions),
      },
      {
        method: 'post',
        path: '/passkeys',
        handlers: rateLimitedSessionHandlers(passkeyController.verifyRegistration),
      },
      {
        method: 'delete',
        path: '/passkeys/:passkeyId',
        handlers: rateLimitedSessionHandlers(passkeyController.delete),
      },
      {
        method: 'get',
        path: '/devices',
        handlers: sessionHandlers(deviceController.list),
      },
      {
        method: 'delete',
        path: '/devices/others',
        handlers: rateLimitedSessionHandlers(deviceController.revokeOthers),
      },
      {
        method: 'delete',
        path: '/devices/:sessionId',
        handlers: rateLimitedSessionHandlers(deviceController.revoke),
      },
      {
        method: 'get',
        path: '/sso/config',
        handlers: [ssoController.config],
      },
      {
        method: 'get',
        path: '/sso/start',
        handlers: [ssoController.start],
      },
      {
        method: 'get',
        path: '/sso/bind/start',
        handlers: sessionHandlers(ssoController.bindStart),
      },
      {
        method: 'get',
        path: '/sso/callback',
        handlers: [ssoController.callback],
      },
      {
        method: 'post',
        path: '/sso/session',
        handlers: sessionHandlers(ssoController.session),
      },
      {
        method: 'post',
        path: '/sso/account',
        handlers: rateLimitedSessionHandlers(ssoController.createAccount),
      },
      {
        method: 'post',
        path: '/sso/bind',
        handlers: rateLimitedSessionHandlers(ssoController.bindAccount),
      },
      {
        method: 'get',
        path: '/sso/identities',
        handlers: sessionHandlers(ssoController.identities),
      },
    ],
  };
}
