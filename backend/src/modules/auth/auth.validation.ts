import { AppError } from '../../core/errors';

interface PasswordConfirmationInput {
  password: string;
  confirmPassword: string;
}

export function assertPasswordConfirmation(input: PasswordConfirmationInput) {
  if (input.password === input.confirmPassword) {
    return;
  }

  throw new AppError('AUTH_PASSWORD_CONFIRMATION_MISMATCH', 'Password confirmation does not match.', 400);
}
