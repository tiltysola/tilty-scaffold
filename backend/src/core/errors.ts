import { flattenError, ZodError } from 'zod';

import { defaultLocale } from '@tilty/shared/i18n';

import { type BackendMessageId, backendMessages, getBackendMessage } from '../i18n';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly messageId: BackendMessageId | undefined;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    const messageId = getCatalogMessageId(message);

    super(messageId ? getBackendMessage(defaultLocale, messageId) : message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.messageId = messageId;
  }
}

export function normalizeError(error: unknown) {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError('FIELD_VALIDATE_ERROR', 'error.FIELD_VALIDATE_ERROR', 400, flattenError(error));
  }

  return new AppError('INTERNAL_ERROR', 'error.INTERNAL_ERROR', 500);
}

function getCatalogMessageId(message: string) {
  return Object.hasOwn(backendMessages[defaultLocale], message) ? (message as BackendMessageId) : undefined;
}
