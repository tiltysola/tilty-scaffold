import { describe, expect, it } from 'vitest';

import { normalizeApiBaseUrl } from '../src/lib/config';

describe('frontend configuration', () => {
  it('normalizes API base URLs', () => {
    expect(normalizeApiBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(normalizeApiBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
  });

  it('rejects unsafe API base URLs', () => {
    expect(() => normalizeApiBaseUrl('javascript:alert(1)')).toThrow('VITE_API_BASE_URL');
    expect(() => normalizeApiBaseUrl('https://user:pass@api.example.com')).toThrow('VITE_API_BASE_URL');
    expect(() => normalizeApiBaseUrl('https://api.example.com?debug=true')).toThrow('VITE_API_BASE_URL');
  });
});
