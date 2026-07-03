import { describe, expect, it } from 'vitest';

import { resolveAppliedTheme } from '../src/components/ThemeProvider/theme-mode';

describe('theme provider', () => {
  it('uses profile background tone only in auto mode', () => {
    expect(resolveAppliedTheme('auto', 'dark')).toBe('dark');
    expect(resolveAppliedTheme('auto', 'light')).toBe('light');
    expect(resolveAppliedTheme('auto', null)).toBe('system');
  });

  it('keeps explicit theme choices independent of profile background tone', () => {
    expect(resolveAppliedTheme('dark', 'light')).toBe('dark');
    expect(resolveAppliedTheme('light', 'dark')).toBe('light');
  });
});
