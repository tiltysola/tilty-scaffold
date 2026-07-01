import { type Middleware } from 'koa';

import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import { readMultipartFile } from '../../infra/multipart';
import { getRequestLocale } from '../../middleware/locale';
import {
  type AuthCookieConfig,
  clearAuthCookies,
  getAuthRequestContext,
  getAuthToken,
  setAuthCookies,
  setSensitiveAuthResponseHeaders,
} from './auth.http';
import {
  authDeviceSessionIdSchema,
  authPasskeyIdSchema,
  changePasswordSchema,
  loginSchema,
  mfaSettingsSchema,
  passkeyRegistrationVerifySchema,
  registerSchema,
  resetPasswordSchema,
  sendEmailVerificationSchema,
  sendProfilePhoneVerificationSchema,
  ssoBindAccountSchema,
  ssoCreateAccountSchema,
  ssoSessionSchema,
  ssoStartQuerySchema,
  totpSetupEnableSchema,
  updateCurrentUserSchema,
  verificationChallengeCreateSchema,
  verificationCodeSendSchema,
  verificationConfirmSchema,
  verificationTokenSchema,
  verifyProfileEmailSchema,
  verifyProfilePhoneSchema,
} from './auth.schemas';
import { type AuthService } from './auth.service';
import { type SsoCallbackInput, type SsoService } from './auth.sso';

type AuthenticatedSession = Awaited<ReturnType<AuthService['register']>>;

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
    private readonly avatarUploadMaxBytes: number,
    private readonly cookieConfig: AuthCookieConfig,
  ) {}

  config: Middleware = async (ctx) => {
    ctx.body = ok({
      fileUploadMaxBytes: this.avatarUploadMaxBytes,
      ...this.authService.getPublicConfig(),
    });
  };

  register: Middleware = async (ctx) => {
    const input = registerSchema.parse(ctx.request.body);
    const session = await this.authService.register(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.status = 201;
    ctx.body = ok(toSessionResponse(session));
  };

  sendRegistrationEmailVerification: Middleware = async (ctx) => {
    const input = sendEmailVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendRegistrationEmailVerification(input, getRequestLocale(ctx));

    ctx.body = ok(result);
  };

  sendPasswordResetEmailVerification: Middleware = async (ctx) => {
    const input = sendEmailVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendPasswordResetEmailVerification(input, getRequestLocale(ctx));

    ctx.body = ok(result);
  };

  sendProfileEmailVerification: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const result = await this.authService.sendProfileEmailVerification(token, getRequestLocale(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(result);
  };

  sendProfilePhoneVerification: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = sendProfilePhoneVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendProfilePhoneVerification(token, input);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(result);
  };

  login: Middleware = async (ctx) => {
    const input = loginSchema.parse(ctx.request.body);
    const result = await this.authService.login(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    if (isVerificationRequiredResponse(result)) {
      ctx.body = ok(result);
      return;
    }

    setAuthCookies(ctx, result, this.cookieConfig);
    ctx.body = ok(toSessionResponse(result));
  };

  resetPassword: Middleware = async (ctx) => {
    const input = resetPasswordSchema.parse(ctx.request.body);
    const result = await this.authService.resetPassword(input);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(result);
  };

  verifyProfileEmail: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = verifyProfileEmailSchema.parse(ctx.request.body);
    const user = await this.authService.verifyProfileEmail(token, input);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  verifyProfilePhone: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = verifyProfilePhoneSchema.parse(ctx.request.body);
    const user = await this.authService.verifyProfilePhone(token, input);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  me: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const user = await this.authService.getCurrentUser(token);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  updateMe: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = updateCurrentUserSchema.parse(ctx.request.body);
    const user = await this.authService.updateCurrentUser(token, input);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  changePassword: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = changePasswordSchema.parse(ctx.request.body);
    const result = await this.authService.changeCurrentUserPassword(token, input);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(result);
  };

  avatar: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const file = await readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName: 'avatar',
      maxBytes: this.avatarUploadMaxBytes,
    });
    const user = await this.authService.uploadAvatar(token, file);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  deleteAvatar: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const user = await this.authService.deleteAvatar(token);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  profileBanner: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const file = await readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName: 'profileBanner',
      maxBytes: this.avatarUploadMaxBytes,
    });
    const user = await this.authService.uploadProfileBanner(token, file);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  deleteProfileBanner: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const user = await this.authService.deleteProfileBanner(token);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  profileBackground: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const file = await readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName: 'profileBackground',
      maxBytes: this.avatarUploadMaxBytes,
    });
    const user = await this.authService.uploadProfileBackground(token, file);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  deleteProfileBackground: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const user = await this.authService.deleteProfileBackground(token);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(user);
  };

  refresh: Middleware = async (ctx) => {
    setSensitiveAuthResponseHeaders(ctx);

    const refreshToken = ctx.cookies.get(this.cookieConfig.refreshTokenName);

    if (!refreshToken) {
      clearAuthCookies(ctx, this.cookieConfig);
      throw new AppError('AUTH_REFRESH_TOKEN_REQUIRED', 'error.AUTH_REFRESH_TOKEN_REQUIRED', 401);
    }

    let session: Awaited<ReturnType<AuthService['refreshSession']>>;

    try {
      session = await this.authService.refreshSession(refreshToken, getAuthRequestContext(ctx));
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        clearAuthCookies(ctx, this.cookieConfig);
      }

      throw error;
    }

    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.body = ok(toSessionResponse(session));
  };

  logout: Middleware = async (ctx) => {
    const refreshToken = ctx.cookies.get(this.cookieConfig.refreshTokenName);

    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }

    setSensitiveAuthResponseHeaders(ctx);
    clearAuthCookies(ctx, this.cookieConfig);
    ctx.body = ok({ signedOut: true });
  };

  ssoConfig: Middleware = async (ctx) => {
    ctx.body = ok(this.ssoService.getPublicConfig());
  };

  ssoStart: Middleware = async (ctx) => {
    const query = ssoStartQuerySchema.parse(ctx.query);
    const loginUrl = await this.ssoService.createLoginUrl(query.redirect, query.providerId);

    ctx.redirect(loginUrl);
  };

  ssoBindStart: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const { user } = await this.authService.requireSsoBindingAccess(token);
    const query = ssoStartQuerySchema.parse(ctx.query);
    const loginUrl = await this.ssoService.createBindUrl(user.id, query.redirect, query.providerId);

    ctx.redirect(loginUrl);
  };

  ssoCallback: Middleware = async (ctx) => {
    const redirectUrl = await this.ssoService.handleCallback(
      {
        code: getQueryStringValue(ctx.query.code),
        error: getQueryStringValue(ctx.query.error),
        errorDescription: getQueryStringValue(ctx.query.error_description),
        state: getQueryStringValue(ctx.query.state),
      } satisfies SsoCallbackInput,
      getAuthRequestContext(ctx),
    );

    ctx.redirect(redirectUrl);
  };

  ssoSession: Middleware = async (ctx) => {
    const input = ssoSessionSchema.parse(ctx.request.body);
    const session = await this.ssoService.exchangeHandoffToken(input.token, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.body = ok(toSessionResponse(session));
  };

  ssoCreateAccount: Middleware = async (ctx) => {
    const input = ssoCreateAccountSchema.parse(ctx.request.body);
    const session = await this.ssoService.createSsoAccount(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    setAuthCookies(ctx, session, this.cookieConfig);
    ctx.status = 201;
    ctx.body = ok(toSessionResponse(session));
  };

  ssoBindAccount: Middleware = async (ctx) => {
    const input = ssoBindAccountSchema.parse(ctx.request.body);
    const result = await this.ssoService.bindSsoAccount(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    if (isVerificationRequiredResponse(result)) {
      ctx.body = ok(result);
      return;
    }

    setAuthCookies(ctx, result, this.cookieConfig);
    ctx.body = ok(toSessionResponse(result));
  };

  ssoIdentities: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const { user } = await this.authService.authenticate(token);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok({
      identities: await this.ssoService.listUserIdentities(user.id),
    });
  };

  totpStatus: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.getTotpStatus(token));
  };

  totpSetup: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.createTotpSetup(token));
  };

  totpEnable: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = totpSetupEnableSchema.parse(ctx.request.body);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.enableTotp(token, input));
  };

  totpDisable: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.disableTotp(token));
  };

  totpRegenerateRecoveryCodes: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.regenerateTotpRecoveryCodes(token));
  };

  mfaSettings: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.getMfaSettings(token));
  };

  updateMfaSettings: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = mfaSettingsSchema.parse(ctx.request.body);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.updateMfaSettings(token, input));
  };

  createVerificationChallenge: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = verificationChallengeCreateSchema.parse(ctx.request.body);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.createVerificationChallenge(token, input.purpose, getAuthRequestContext(ctx)));
  };

  sendVerificationCode: Middleware = async (ctx) => {
    const input = verificationCodeSendSchema.parse(ctx.request.body);
    const token = ctx.cookies.get(this.cookieConfig.accessTokenName);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(
      await this.authService.sendVerificationCode(token, input, getAuthRequestContext(ctx), getRequestLocale(ctx)),
    );
  };

  verificationPasskeyOptions: Middleware = async (ctx) => {
    const input = verificationTokenSchema.parse(ctx.request.body);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(
      await this.authService.createPasskeyVerificationOptions(input.verificationToken, getAuthRequestContext(ctx)),
    );
  };

  verifyAuthenticationChallenge: Middleware = async (ctx) => {
    const input = verificationConfirmSchema.parse(ctx.request.body);
    const result = await this.authService.verifyAuthenticationChallenge(input, getAuthRequestContext(ctx));

    setSensitiveAuthResponseHeaders(ctx);
    if ('accessToken' in result) {
      setAuthCookies(ctx, result, this.cookieConfig);
      ctx.body = ok(toSessionResponse(result));
      return;
    }

    ctx.body = ok(result);
  };

  passkeys: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.listPasskeys(token));
  };

  passkeyRegistrationOptions: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.createPasskeyRegistrationOptions(token));
  };

  passkeyRegistrationVerify: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const input = passkeyRegistrationVerifySchema.parse(ctx.request.body);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.verifyPasskeyRegistration(token, input));
  };

  deletePasskey: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const { passkeyId } = authPasskeyIdSchema.parse(ctx.params);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.deletePasskey(token, passkeyId));
  };

  deviceSessions: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.listDeviceSessions(token));
  };

  revokeDeviceSession: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);
    const { sessionId } = authDeviceSessionIdSchema.parse(ctx.params);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.revokeDeviceSession(token, sessionId));
  };

  revokeOtherDeviceSessions: Middleware = async (ctx) => {
    const token = getAuthToken(ctx, this.cookieConfig);

    setSensitiveAuthResponseHeaders(ctx);
    ctx.body = ok(await this.authService.revokeOtherDeviceSessions(token));
  };
}

function toSessionResponse(session: AuthenticatedSession) {
  return {
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    user: session.user,
  };
}

function isAuthenticationFailure(error: unknown) {
  return error instanceof AppError && error.status === 401;
}

function isVerificationRequiredResponse(value: unknown): value is { requiresVerification: true } {
  return Boolean(
    value && typeof value === 'object' && (value as { requiresVerification?: unknown }).requiresVerification === true,
  );
}

function getQueryStringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
