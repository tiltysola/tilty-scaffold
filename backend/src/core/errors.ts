import { ZodError } from 'zod';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError('FIELD_VALIDATE_ERROR', 'Request fields are invalid.', 400, error.flatten());
  }

  return new AppError('INTERNAL_ERROR', 'Internal server error.', 500);
}
