import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteProfileBackground,
  deleteProfileBanner,
  resolveAssetUrl,
  uploadAvatar,
  uploadProfileBackground,
  uploadProfileBanner,
} from '../src/lib/auth';
import {
  clearAuthSession,
  createSession,
  createTestWindow,
  getCurrentAuthSession,
  seedAuthSession,
} from './support/auth';

describe('auth image client', () => {
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/me/avatar');
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
      '/api/users/me/avatar',
      '/api/auth/refresh',
      '/api/users/me/avatar',
    ]);
    expect(getCurrentAuthSession()).toEqual({
      ...refreshedSession,
      user: updatedUser,
    });
  });

  it('uploads profile banners and stores the updated user', async () => {
    const window = createTestWindow();
    const storedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...storedSession.user,
      profileBannerUrl: '/uploads/profile-banners/banner.png',
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);
      expect((init?.body as FormData).has('profileBanner')).toBe(true);

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

    await expect(uploadProfileBanner(new File(['banner'], 'banner.png', { type: 'image/png' }))).resolves.toEqual(
      updatedUser,
    );
    expect(getCurrentAuthSession()?.user.profileBannerUrl).toBe('/uploads/profile-banners/banner.png');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/me/profile-banner');
  });

  it('deletes profile banners and stores the updated user', async () => {
    const window = createTestWindow();
    const storedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const sessionWithBanner = {
      ...storedSession,
      user: {
        ...storedSession.user,
        profileBannerUrl: '/uploads/profile-banners/banner.png',
      },
    };
    const updatedUser = storedSession.user;
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.method).toBe('DELETE');

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
    await seedAuthSession(sessionWithBanner);
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteProfileBanner()).resolves.toEqual(updatedUser);
    expect(getCurrentAuthSession()?.user.profileBannerUrl).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/me/profile-banner');
  });

  it('uploads profile backgrounds and stores the updated user', async () => {
    const window = createTestWindow();
    const storedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...storedSession.user,
      profileBackgroundUrl: '/uploads/profile-backgrounds/background.png',
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);
      expect((init?.body as FormData).has('profileBackground')).toBe(true);

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

    await expect(
      uploadProfileBackground(new File(['background'], 'background.png', { type: 'image/png' })),
    ).resolves.toEqual(updatedUser);
    expect(getCurrentAuthSession()?.user.profileBackgroundUrl).toBe('/uploads/profile-backgrounds/background.png');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/me/profile-background');
  });

  it('deletes profile backgrounds and stores the updated user', async () => {
    const window = createTestWindow();
    const storedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const sessionWithBackground = {
      ...storedSession,
      user: {
        ...storedSession.user,
        profileBackgroundUrl: '/uploads/profile-backgrounds/background.png',
      },
    };
    const updatedUser = storedSession.user;
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.method).toBe('DELETE');

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
    await seedAuthSession(sessionWithBackground);
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteProfileBackground()).resolves.toEqual(updatedUser);
    expect(getCurrentAuthSession()?.user.profileBackgroundUrl).toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/me/profile-background');
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
