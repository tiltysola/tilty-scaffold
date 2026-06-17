import { AppError } from '../../core/errors';
import { UserModel } from '../users/user.model';
import { UserService } from '../users/user.service';
import { createAccessToken, hashPassword, verifyAccessToken, verifyPassword } from './auth.crypto';
import { EmailVerificationService } from './auth.email';

export interface RegisterInput {
  email: string;
  emailVerificationCode?: string | undefined;
  password: string;
  confirmPassword: string;
  username: string;
}

export interface ResetPasswordInput {
  email: string;
  emailVerificationCode: string;
  password: string;
  confirmPassword: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly tokenSecret: string,
    private readonly emailVerification: EmailVerificationService = new EmailVerificationService(),
  ) {}

  getPublicConfig() {
    return {
      passwordRecoveryEnabled: this.emailVerification.isEnabled(),
      registrationEmailVerificationRequired: this.emailVerification.isEnabled(),
    };
  }

  async sendRegistrationEmailVerification(input: { email: string }) {
    const existing = await this.userService.findByEmail(input.email);

    if (existing) {
      throw new AppError('USER_EMAIL_EXISTS', 'The email address is already registered.', 409);
    }

    return await this.emailVerification.sendRegistrationCode(input.email);
  }

  async sendPasswordResetEmailVerification(input: { email: string }) {
    const user = await this.userService.findByEmail(input.email);

    if (!isPasswordResetEligibleUser(user)) {
      return this.emailVerification.getDeliveryMetadata();
    }

    return await this.emailVerification.sendPasswordResetCode(input.email);
  }

  async register(input: RegisterInput) {
    if (input.password !== input.confirmPassword) {
      throw new AppError('AUTH_PASSWORD_CONFIRMATION_MISMATCH', 'Password confirmation does not match.', 400);
    }

    this.emailVerification.verifyRegistrationCode(input.email, input.emailVerificationCode);

    const credentials = await hashPassword(input.password);
    const user = await this.userService.createWithCredentials({
      username: input.username,
      email: input.email,
      ...credentials,
    });

    return createAuthSession(user, this.tokenSecret);
  }

  async login(input: LoginInput) {
    const user = await this.userService.findByEmail(input.email);

    if (!user || !user.available || !user.passwordHash || !user.passwordSalt) {
      throwInvalidCredentials();
    }

    const valid = await verifyPassword(input.password, user.passwordHash, user.passwordSalt);

    if (!valid) {
      throwInvalidCredentials();
    }

    return createAuthSession(user, this.tokenSecret);
  }

  async resetPassword(input: ResetPasswordInput) {
    if (input.password !== input.confirmPassword) {
      throw new AppError('AUTH_PASSWORD_CONFIRMATION_MISMATCH', 'Password confirmation does not match.', 400);
    }

    const user = await this.userService.findByEmail(input.email);

    this.emailVerification.verifyPasswordResetCode(input.email, input.emailVerificationCode);

    if (!isPasswordResetEligibleUser(user)) {
      throw new AppError('EMAIL_VERIFICATION_INVALID', 'Email verification code is invalid or expired.', 400);
    }

    const credentials = await hashPassword(input.password);

    await this.userService.updatePassword(user, credentials);

    return { reset: true } as const;
  }

  async getCurrentUser(token: string) {
    const payload = await verifyAccessToken(token, this.tokenSecret);
    const user = await this.userService.findById(payload.sub);

    if (!user) {
      throw new AppError('AUTH_INVALID_TOKEN', 'Authentication token is invalid.', 401);
    }

    return toAuthUser(user);
  }
}

export async function createAuthSession(user: UserModel, tokenSecret: string) {
  const authUser = toAuthUser(user);
  const token = await createAccessToken(
    {
      sub: authUser.id,
      email: authUser.email,
      username: authUser.username,
    },
    tokenSecret,
  );

  return {
    accessToken: token.accessToken,
    expiresAt: token.expiresAt,
    tokenType: 'Bearer',
    user: authUser,
  } as const;
}

export function toAuthUser(user: UserModel) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}

function throwInvalidCredentials(): never {
  throw new AppError('AUTH_INVALID_CREDENTIALS', 'The email address or password is invalid.', 401);
}

function isPasswordResetEligibleUser(user: UserModel | null): user is UserModel {
  return Boolean(user?.available && user.passwordHash && user.passwordSalt);
}
