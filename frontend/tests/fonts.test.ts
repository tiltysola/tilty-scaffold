import { describe, expect, it } from 'vitest';

import { normalizeAppFontLanguage } from '../src/lib/fonts';

describe('font utilities', () => {
  it('normalizes supported CJK font languages', () => {
    expect(normalizeAppFontLanguage('zh')).toBe('zh');
    expect(normalizeAppFontLanguage('zh-CN')).toBe('zh');
    expect(normalizeAppFontLanguage('ZH-Hans')).toBe('zh');
    expect(normalizeAppFontLanguage('ja')).toBe('ja');
    expect(normalizeAppFontLanguage('ja-JP')).toBe('ja');
  });

  it('ignores unsupported or empty font languages', () => {
    expect(normalizeAppFontLanguage('en-US')).toBeUndefined();
    expect(normalizeAppFontLanguage('')).toBeUndefined();
    expect(normalizeAppFontLanguage(null)).toBeUndefined();
    expect(normalizeAppFontLanguage(undefined)).toBeUndefined();
  });
});
