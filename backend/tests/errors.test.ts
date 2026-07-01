import { describe, expect, it } from 'vitest';

import { AppError } from '../src/core/errors';
import { backendMessages } from '../src/i18n';

describe('application errors', () => {
  it('keeps AppError messages readable while retaining catalog message ids', () => {
    const error = new AppError('AUTH_REQUIRED', 'error.AUTH_REQUIRED', 401);

    expect(error.message).toBe(backendMessages['en-US']['error.AUTH_REQUIRED']);
    expect(error.messageId).toBe('error.AUTH_REQUIRED');
  });
});
