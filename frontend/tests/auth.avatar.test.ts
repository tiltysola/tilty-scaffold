import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAssetUrl, uploadAvatar } from '../src/lib/auth';
import {
  clearAuthSession,
  createSession,
  createTestWindow,
  getCurrentAuthSession,
  seedAuthSession,
} from './support/auth';

describe('auth avatar client', () => {
  afterEach(() => {
    clearAuthSession();
    vi.unstubAllGlobals();
  });

  it('uploads avatars and stores the updated user', async () => {
    const window = createTestWindow();
    const storedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...storedSession.user,
      avatarUrl: '/uploads/avatars/avatar.png',
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);

      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: updatedUser,
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('window', window);
    await seedAuthSession(storedSession);
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadAvatar(new File(['avatar'], 'avatar.png', { type: 'image/png' }))).resolves.toEqual(updatedUser);
    expect(getCurrentAuthSession()?.user.avatarUrl).toBe('/uploads/avatars/avatar.png');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/avatar');
  });

  it('keeps refreshed session metadata when avatar uploads refresh authentication', async () => {
    const window = createTestWindow();
    const initialSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const refreshedSession = createSession(new Date(Date.now() + 120_000).toISOString());
    const updatedUser = {
      ...initialSession.user,
      avatarUrl: '/uploads/avatars/refreshed.png',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 401,
            error: 'AUTH_TOKEN_EXPIRED',
            message: '认证 token 已过期。',
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: refreshedSession,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: updatedUser,
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal('window', window);
    await seedAuthSession(initialSession);
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadAvatar(new File(['avatar'], 'avatar.png', { type: 'image/png' }))).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/auth/avatar',
      '/api/auth/refresh',
      '/api/auth/avatar',
    ]);
    expect(getCurrentAuthSession()).toEqual({
      ...refreshedSession,
      user: updatedUser,
    });
  });

  it('resolves backend-relative asset URLs', () => {
    expect(resolveAssetUrl('/uploads/avatar.png')).toBe('/uploads/avatar.png');
    expect(resolveAssetUrl('https://cdn.example.com/avatar.png')).toBe('https://cdn.example.com/avatar.png');
    expect(resolveAssetUrl('http://evil.example.com/avatar.png')).toBeUndefined();
    expect(resolveAssetUrl('//evil.example.com/avatar.png')).toBeUndefined();
    expect(resolveAssetUrl('/uploads\\avatar.png')).toBeUndefined();
    expect(resolveAssetUrl()).toBeUndefined();
  });
});
