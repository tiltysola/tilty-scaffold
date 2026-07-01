import { createIntl, createIntlCache } from 'react-intl';

import { describe, expect, it } from 'vitest';

import { defaultMessages } from '../src/i18n';
import { formatMfaMethodList, formatPasskeyCount, formatPasskeyDisplayName } from '../src/lib/security-display';

const intl = createIntl(
  {
    locale: 'en-US',
    messages: defaultMessages,
  },
  createIntlCache(),
);

describe('security component utilities', () => {
  it('formats MFA methods with localized labels', () => {
    expect(formatMfaMethodList(['passkey', 'totp', 'sms', 'email'], intl)).toBe(
      'Passkey, Authenticator app, SMS, Email',
    );
    expect(formatMfaMethodList([], intl)).toBe('none');
  });

  it('formats passkey counts with units', () => {
    expect(formatPasskeyCount(0, intl)).toBe('0 passkeys');
    expect(formatPasskeyCount(1, intl)).toBe('1 passkey');
    expect(formatPasskeyCount(2, intl)).toBe('2 passkeys');
  });

  it('formats passkey display names from stored registration names', () => {
    expect(formatPasskeyDisplayName('', intl)).toBe('Passkey');
    expect(formatPasskeyDisplayName('Passkey', intl)).toBe('Passkey');
    expect(formatPasskeyDisplayName('Passkey 1', intl)).toBe('Passkey 1');
    expect(formatPasskeyDisplayName('Remark: Work laptop', intl)).toBe('Remark: Work laptop');
    expect(formatPasskeyDisplayName('Work laptop', intl)).toBe('Remark: Work laptop');
  });
});
