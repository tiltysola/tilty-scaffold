import { type Middleware } from 'koa';

import { AppError } from '../../core/errors';
import { ok } from '../../core/http';
import { setSensitiveAuthResponseHeaders } from './auth.http';
import { type AuthService } from './auth.service';

type AuthenticatedSession = Awaited<ReturnType<AuthService['register']>>;

export function toSessionResponse(session: AuthenticatedSession) {
  return {
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    user: session.user,
  };
}

export async function respondWithSensitiveOk<T>(ctx: Parameters<Middleware>[0], result: Promise<T> | T) {
  setSensitiveAuthResponseHeaders(ctx);
  ctx.body = ok(await result);
}

export function isAuthenticationFailure(error: unknown) {
  return error instanceof AppError && error.status === 401;
}

export function isVerificationRequiredResponse(value: unknown): value is { requiresVerification: true } {
  return Boolean(
    value && typeof value === 'object' && (value as { requiresVerification?: unknown }).requiresVerification === true,
  );
}

export function getQueryStringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
