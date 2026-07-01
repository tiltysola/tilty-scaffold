import { describe, expect, it } from 'vitest';

import { formatDateOnlyValue, formatDateValue, getMonthOptions } from '../src/i18n';

describe('localized date formatting', () => {
  it('formats date-only values with the active locale', () => {
    expect(formatDateOnlyValue('2000-01-02', 'zh-CN')).toContain('2000');
    expect(formatDateOnlyValue('2000-01-02', 'zh-CN')).toContain('1');
    expect(formatDateOnlyValue('invalid', 'zh-CN')).toBe('invalid');
  });

  it('formats month options with the active locale', () => {
    const englishMonths = getMonthOptions('en-US');
    const chineseMonths = getMonthOptions('zh-CN');

    expect(englishMonths[0]).toEqual({ label: 'January', value: '0' });
    expect(chineseMonths[0]?.label).not.toBe('January');
    expect(chineseMonths[0]?.value).toBe('0');
  });

  it('keeps invalid date-time values unchanged', () => {
    expect(formatDateValue('invalid', 'zh-CN')).toBe('invalid');
  });
});
