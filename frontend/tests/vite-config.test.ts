import { describe, expect, it } from 'vitest';

import { devServerProxy } from '../vite.config';

function isProxiedByDevServer(requestPath: string) {
  return Object.keys(devServerProxy).some((pattern) => new RegExp(pattern).test(requestPath));
}

describe('frontend Vite config', () => {
  it('keeps browser routes that start with api in the frontend app', () => {
    expect(isProxiedByDevServer('/api')).toBe(true);
    expect(isProxiedByDevServer('/api/health')).toBe(true);
    expect(isProxiedByDevServer('/api/api-keys')).toBe(true);
    expect(isProxiedByDevServer('/api-keys')).toBe(false);
  });

  it('proxies only uploaded file route prefixes', () => {
    expect(isProxiedByDevServer('/uploads')).toBe(true);
    expect(isProxiedByDevServer('/uploads/avatar.png')).toBe(true);
    expect(isProxiedByDevServer('/uploads-old/avatar.png')).toBe(false);
  });
});
