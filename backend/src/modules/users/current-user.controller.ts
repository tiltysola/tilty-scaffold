import { type Middleware } from 'koa';

import { type ProfileImageFieldName } from '@tilty/shared/auth';

import { readMultipartFile } from '../../infra/multipart';
import { getRequestLocale } from '../../middleware/locale';
import { respondWithSensitiveOk } from '../auth/auth.responses';
import {
  sendProfilePhoneVerificationSchema,
  updateCurrentUserSchema,
  verifyProfileEmailSchema,
  verifyProfilePhoneSchema,
} from '../auth/auth.schemas';
import { type AuthService } from '../auth/auth.service';
import { type UserModel } from './user.model';

interface CurrentUserAuthState {
  authMethod: 'apiKey' | 'session';
  sessionId?: string | undefined;
  user: UserModel;
}

export class CurrentUserController {
  constructor(
    private readonly authService: AuthService,
    private readonly fileUploadMaxBytes: number,
  ) {}

  me: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);

    await respondWithSensitiveOk(ctx, this.authService.getCurrentAuthenticatedUser(auth.user));
  };

  updateMe: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);
    const input = updateCurrentUserSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(
      ctx,
      this.authService.updateAuthenticatedCurrentUser(auth.user, input, {
        sessionId: auth.sessionId,
      }),
    );
  };

  sendEmailVerification: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);

    await respondWithSensitiveOk(
      ctx,
      this.authService.sendAuthenticatedProfileEmailVerification(auth.user, getRequestLocale(ctx), {
        sessionId: auth.sessionId,
      }),
    );
  };

  verifyEmail: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);
    const input = verifyProfileEmailSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(
      ctx,
      this.authService.verifyAuthenticatedProfileEmail(auth.user, input, {
        sessionId: auth.sessionId,
      }),
    );
  };

  sendPhoneVerification: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);
    const input = sendProfilePhoneVerificationSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(
      ctx,
      this.authService.sendAuthenticatedProfilePhoneVerification(auth.user, input, {
        sessionId: auth.sessionId,
      }),
    );
  };

  verifyPhone: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);
    const input = verifyProfilePhoneSchema.parse(ctx.request.body);

    await respondWithSensitiveOk(
      ctx,
      this.authService.verifyAuthenticatedProfilePhone(auth.user, input, {
        sessionId: auth.sessionId,
      }),
    );
  };

  uploadAvatar: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);
    const file = await this.readProfileImage(ctx, 'avatar');

    await respondWithSensitiveOk(ctx, this.authService.uploadAuthenticatedAvatar(auth.user, file));
  };

  deleteAvatar: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);

    await respondWithSensitiveOk(ctx, this.authService.deleteAuthenticatedAvatar(auth.user));
  };

  uploadProfileBanner: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);
    const file = await this.readProfileImage(ctx, 'profileBanner');

    await respondWithSensitiveOk(ctx, this.authService.uploadAuthenticatedProfileBanner(auth.user, file));
  };

  deleteProfileBanner: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);

    await respondWithSensitiveOk(ctx, this.authService.deleteAuthenticatedProfileBanner(auth.user));
  };

  uploadProfileBackground: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);
    const file = await this.readProfileImage(ctx, 'profileBackground');

    await respondWithSensitiveOk(ctx, this.authService.uploadAuthenticatedProfileBackground(auth.user, file));
  };

  deleteProfileBackground: Middleware = async (ctx) => {
    const auth = getCurrentUserAuth(ctx);

    await respondWithSensitiveOk(ctx, this.authService.deleteAuthenticatedProfileBackground(auth.user));
  };

  private readProfileImage(ctx: Parameters<Middleware>[0], fieldName: ProfileImageFieldName) {
    return readMultipartFile(ctx.req, ctx.get('content-type'), ctx.get('content-length'), {
      fieldName,
      maxBytes: this.fileUploadMaxBytes,
    });
  }
}

function getCurrentUserAuth(ctx: Parameters<Middleware>[0]) {
  const auth = ctx.state.auth as CurrentUserAuthState | undefined;

  if (!auth?.user) {
    throw new Error('Authenticated user context is missing.');
  }

  if (auth.authMethod === 'session' && !auth.sessionId) {
    throw new Error('Authenticated session context is missing.');
  }

  return {
    sessionId: auth.authMethod === 'session' ? auth.sessionId : undefined,
    user: auth.user,
  };
}
