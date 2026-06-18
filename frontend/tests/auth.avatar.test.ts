import { afterEach, describe, expect, it, vi } from 'vitest';

import { getStoredSession, resolveAssetUrl, storeSession, uploadAvatar } from '../src/lib/auth';
import { createSession, createTestWindow } from './support/auth';

describe('auth avatar client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uploads avatars and stores the updated user', async () => {
    const window = createTestWindow();
    const storedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...storedSession.user,
      avatarUrl: '/uploads/avatars/user-id/avatar.png',
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
    vi.stubGlobal('fetch', fetchMock);
    storeSession(storedSession);

    await expect(uploadAvatar(new File(['avatar'], 'avatar.png', { type: 'image/png' }))).resolves.toEqual(updatedUser);
    expect(getStoredSession()?.user.avatarUrl).toBe('/uploads/avatars/user-id/avatar.png');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/auth/avatar');
  });

  it('keeps refreshed session metadata when avatar uploads refresh authentication', async () => {
    const window = createTestWindow();
    const initialSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const refreshedSession = createSession(new Date(Date.now() + 120_000).toISOString());
    const updatedUser = {
      ...initialSession.user,
      avatarUrl: '/uploads/avatars/user-id/refreshed.png',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 401,
            error: 'AUTH_TOKEN_EXPIRED',
            message: 'Authentication token has expired.',
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
    vi.stubGlobal('fetch', fetchMock);
    storeSession(initialSession);

    await expect(uploadAvatar(new File(['avatar'], 'avatar.png', { type: 'image/png' }))).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:3000/api/auth/avatar',
      'http://localhost:3000/api/auth/refresh',
      'http://localhost:3000/api/auth/avatar',
    ]);
    expect(getStoredSession()).toEqual({
      ...refreshedSession,
      user: updatedUser,
    });
  });

  it('resolves backend-relative asset URLs', () => {
    expect(resolveAssetUrl('/uploads/avatar.png')).toBe('http://localhost:3000/uploads/avatar.png');
    expect(resolveAssetUrl('https://cdn.example.com/avatar.png')).toBe('https://cdn.example.com/avatar.png');
    expect(resolveAssetUrl('http://localhost:3000/uploads/avatar.png')).toBe(
      'http://localhost:3000/uploads/avatar.png',
    );
    expect(resolveAssetUrl('http://evil.example.com/avatar.png')).toBeUndefined();
    expect(resolveAssetUrl('//evil.example.com/avatar.png')).toBeUndefined();
    expect(resolveAssetUrl('/uploads\\avatar.png')).toBeUndefined();
    expect(resolveAssetUrl()).toBeUndefined();
  });
});
