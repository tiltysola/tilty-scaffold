import { type IntlShape } from 'react-intl';

import { describe, expect, it } from 'vitest';

import { emailMaxLength, passwordMaxLength } from '@tilty/shared/validation';

import { getAdministratorValidationError } from '../src/components/SetupConfiguration/utils';
import { type SetupAdministrator } from '../src/lib/setup';

const intl = {
  formatMessage: ({ id }: { id: string }) => id,
} as IntlShape;

describe('setup configuration utilities', () => {
  it('validates administrator usernames with the backend setup boundary', () => {
    expect(getAdministratorValidationError(createAdministrator({ username: 'root_admin' }), intl)).toBeNull();

    for (const username of ['_admin', 'admin_', '-admin', 'admin-']) {
      expect(getAdministratorValidationError(createAdministrator({ username }), intl)).toBe(
        'setup.validation.username.pattern',
      );
    }
  });

  it('validates administrator email and password upper bounds with shared limits', () => {
    expect(
      getAdministratorValidationError(
        createAdministrator({ email: `${'a'.repeat(emailMaxLength - '@example.com'.length + 1)}@example.com` }),
        intl,
      ),
    ).toBe('setup.validation.email.max');
    expect(
      getAdministratorValidationError(createAdministrator({ password: 'a'.repeat(passwordMaxLength + 1) }), intl),
    ).toBe('setup.validation.password.max');
  });
});

function createAdministrator(overrides: Partial<SetupAdministrator> = {}): SetupAdministrator {
  return {
    username: 'root_admin',
    displayName: 'Root User',
    email: 'root@example.com',
    password: 'password123',
    confirmPassword: 'password123',
    ...overrides,
  };
}
