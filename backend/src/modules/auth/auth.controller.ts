import { Middleware } from 'koa';
import { z } from 'zod';

import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import { isSafeRedirectPath } from '../../core/redirects';
import { AuthService } from './auth.service';
import { SsoCallbackInput, SsoService } from './auth.sso';

const passwordSchema = z.string().min(8).max(128);
const emailSchema = z.string().trim().email().max(255).transform((email) => email.toLowerCase());
const emailVerificationCodeSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().regex(/^\d{6}$/).optional(),
);

const registerSchema = z
  .object({
    username: z.string().trim().min(2).max(32),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: passwordSchema,
    emailVerificationCode: emailVerificationCodeSchema,
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Password confirmation does not match.',
    path: ['confirmPassword'],
  });

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const sendRegistrationEmailVerificationSchema = z.object({
  email: emailSchema,
});

const sendPasswordResetEmailVerificationSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z
  .object({
    email: emailSchema,
    emailVerificationCode: z.string().trim().regex(/^\d{6}$/),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Password confirmation does not match.',
    path: ['confirmPassword'],
  });

const ssoSessionSchema = z.object({
  token: z.string().min(1),
});

const ssoCreateAccountSchema = z
  .object({
    token: z.string().min(1),
    username: z.string().trim().min(2).max(32),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Password confirmation does not match.',
    path: ['confirmPassword'],
  });

const ssoBindAccountSchema = z.object({
  token: z.string().min(1),
  email: z.string().trim().email().max(255).transform((email) => email.toLowerCase()),
  password: passwordSchema,
});
const redirectPathSchema = z.string().refine(isSafeRedirectPath, {
  message: 'Redirect path is invalid.',
});
const ssoStartQuerySchema = z.object({
  redirect: redirectPathSchema.optional(),
});

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
  ) {}

  config: Middleware = async (ctx) => {
    ctx.body = ok(this.authService.getPublicConfig());
  };

  register: Middleware = async (ctx) => {
    const input = registerSchema.parse(ctx.request.body);
    const session = await this.authService.register(input);

    ctx.status = 201;
    ctx.body = ok(session);
  };

  sendRegistrationEmailVerification: Middleware = async (ctx) => {
    const input = sendRegistrationEmailVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendRegistrationEmailVerification(input);

    ctx.body = ok(result);
  };

  sendPasswordResetEmailVerification: Middleware = async (ctx) => {
    const input = sendPasswordResetEmailVerificationSchema.parse(ctx.request.body);
    const result = await this.authService.sendPasswordResetEmailVerification(input);

    ctx.body = ok(result);
  };

  login: Middleware = async (ctx) => {
    const input = loginSchema.parse(ctx.request.body);
    const session = await this.authService.login(input);

    ctx.body = ok(session);
  };

  resetPassword: Middleware = async (ctx) => {
    const input = resetPasswordSchema.parse(ctx.request.body);
    const result = await this.authService.resetPassword(input);

    ctx.body = ok(result);
  };

  me: Middleware = async (ctx) => {
    const token = getBearerToken(ctx.get('authorization'));
    const user = await this.authService.getCurrentUser(token);

    ctx.body = ok(user);
  };

  ssoConfig: Middleware = async (ctx) => {
    ctx.body = ok(this.ssoService.getPublicConfig());
  };

  ssoStart: Middleware = async (ctx) => {
    const query = ssoStartQuerySchema.parse(ctx.query);
    const loginUrl = await this.ssoService.createLoginUrl(query.redirect);

    ctx.redirect(loginUrl);
  };

  ssoCallback: Middleware = async (ctx) => {
    const redirectUrl = await this.ssoService.handleCallback({
      code: getQueryString(ctx.query.code),
      error: getQueryString(ctx.query.error),
      errorDescription: getQueryString(ctx.query.error_description),
      state: getQueryString(ctx.query.state),
    } satisfies SsoCallbackInput);

    ctx.redirect(redirectUrl);
  };

  ssoSession: Middleware = async (ctx) => {
    const input = ssoSessionSchema.parse(ctx.request.body);
    const session = await this.ssoService.exchangeHandoffToken(input.token);

    ctx.body = ok(session);
  };

  ssoCreateAccount: Middleware = async (ctx) => {
    const input = ssoCreateAccountSchema.parse(ctx.request.body);
    const session = await this.ssoService.createSsoAccount(input);

    ctx.status = 201;
    ctx.body = ok(session);
  };

  ssoBindAccount: Middleware = async (ctx) => {
    const input = ssoBindAccountSchema.parse(ctx.request.body);
    const session = await this.ssoService.bindSsoAccount(input);

    ctx.body = ok(session);
  };
}

function getBearerToken(authorization: string) {
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('AUTH_REQUIRED', 'Authentication is required.', 401);
  }

  return token;
}

function getQueryString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
