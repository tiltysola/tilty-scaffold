import { describe, expect, it } from 'vitest';

import { formatPasskeyCount, formatPasskeyDisplayName } from '../src/pages/Security/components/utils';

describe('security component utilities', () => {
  it('formats passkey counts with units', () => {
    expect(formatPasskeyCount(0)).toBe('0 passkeys');
    expect(formatPasskeyCount(1)).toBe('1 passkey');
    expect(formatPasskeyCount(2)).toBe('2 passkeys');
  });

  it('formats passkey display names from stored registration names', () => {
    expect(formatPasskeyDisplayName('')).toBe('Passkey');
    expect(formatPasskeyDisplayName('Passkey')).toBe('Passkey');
    expect(formatPasskeyDisplayName('Passkey 1')).toBe('Passkey 1');
    expect(formatPasskeyDisplayName('Remark: Work laptop')).toBe('Remark: Work laptop');
    expect(formatPasskeyDisplayName('Work laptop')).toBe('Remark: Work laptop');
  });
});
