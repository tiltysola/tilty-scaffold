import { afterEach, describe, expect, it, vi } from 'vitest';

import { authStore, fetchCurrentUser, getUserHandle, getUserInitials } from '../src/lib/auth';
import {
  authSessionStorageKey,
  clearAuthSession,
  createSession,
  createStorageBlockedTestWindow,
  createStorageWriteBlockedTestWindow,
  createTestWindow,
  getCurrentAuthSession,
  seedAuthSession,
} from './support/auth';

describe('auth session storage', () => {
  afterEach(() => {
    clearAuthSession();
    vi.unstubAllGlobals();
  });

  function stubFailedRefresh() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 401,
            error: 'AUTH_REFRESH_TOKEN_INVALID',
            message: 'Refresh token is invalid or expired.',
          }),
          { status: 401 },
        );
      }),
    );
  }

  it('formats username handles for account displays', () => {
    expect(getUserHandle('test_user')).toBe('@test_user');
    expect(getUserHandle('  test_user  ')).toBe('@test_user');
    expect(getUserHandle()).toBe('');
  });

  it('formats user initials for avatars', () => {
    expect(getUserInitials('Test User')).toBe('TU');
    expect(getUserInitials('  Solo  ')).toBe('S');
    expect(getUserInitials()).toBe('U');
  });

  it('stores and reads a valid session', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);

    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    await seedAuthSession(session);

    expect(getCurrentAuthSession()).toEqual(session);
    expect(JSON.parse(window.localStorage.getItem(authSessionStorageKey) ?? '{}')).toEqual({
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    });
    expect(authStore.getSnapshot()).toMatchObject({
      session,
      status: 'authenticated',
    });
  });

  it('preserves authenticated state across HMR-style module reloads', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);

    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    await seedAuthSession(session);
    vi.resetModules();

    const { authStore: reloadedAuthStore } = await import('../src/lib/auth');

    expect(reloadedAuthStore.getSnapshot()).toMatchObject({
      session,
      status: 'authenticated',
    });
  });

  it('restores persisted session metadata without storing user details', () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const persistedSession = {
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    };

    window.localStorage.setItem(authSessionStorageKey, JSON.stringify(persistedSession));

    expect(window.localStorage.getItem(authSessionStorageKey)).toBe(JSON.stringify(persistedSession));
    expect(getCurrentAuthSession()).toBeNull();
    expect(authStore.getSnapshot().session).toBeNull();
  });

  it('treats unavailable browser storage as an anonymous session', async () => {
    vi.stubGlobal('window', createStorageBlockedTestWindow());
    stubFailedRefresh();

    await expect(authStore.restore()).resolves.toBeNull();
    expect(authStore.getSnapshot()).toMatchObject({
      session: null,
      status: 'anonymous',
    });
  });

  it('keeps the in-memory session when browser storage rejects writes', async () => {
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...session.user,
      displayName: 'Updated User',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: session,
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

    vi.stubGlobal('window', createStorageWriteBlockedTestWindow());
    vi.stubGlobal('fetch', fetchMock);

    await authStore.refresh();

    expect(getCurrentAuthSession()).toEqual(session);
    await expect(fetchCurrentUser()).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/auth/refresh', '/api/auth/me']);
    expect(getCurrentAuthSession()).toEqual(session);
  });

  it('clears persisted sessions with unexpected user fields', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    stubFailedRefresh();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    window.localStorage.setItem(
      authSessionStorageKey,
      JSON.stringify({
        accessTokenExpiresAt: session.accessTokenExpiresAt,
        refreshTokenExpiresAt: session.refreshTokenExpiresAt,
        user: session.user,
      }),
    );

    await expect(authStore.restore()).resolves.toBeNull();
    expect(window.localStorage.getItem(authSessionStorageKey)).toBeNull();
  });

  it('clears invalid sessions', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    stubFailedRefresh();
    window.localStorage.setItem(authSessionStorageKey, '{invalid');

    await expect(authStore.restore()).resolves.toBeNull();
    expect(window.localStorage.getItem(authSessionStorageKey)).toBeNull();
  });

  it('clears expired sessions', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    stubFailedRefresh();

    const expiredSession = createSession(new Date(Date.now() - 60_000).toISOString());
    window.localStorage.setItem(
      authSessionStorageKey,
      JSON.stringify({
        accessTokenExpiresAt: expiredSession.accessTokenExpiresAt,
        refreshTokenExpiresAt: expiredSession.refreshTokenExpiresAt,
      }),
    );

    await expect(authStore.restore()).resolves.toBeNull();
    expect(window.localStorage.getItem(authSessionStorageKey)).toBeNull();
  });

  it.each(['accessTokenExpiresAt', 'refreshTokenExpiresAt'] as const)(
    'clears sessions with invalid %s dates',
    async (field) => {
      const window = createTestWindow();
      vi.stubGlobal('window', window);
      stubFailedRefresh();
      const session = {
        ...createSession(new Date(Date.now() + 60_000).toISOString()),
        [field]: 'not-a-date',
      };

      window.localStorage.setItem(authSessionStorageKey, JSON.stringify(session));

      await expect(authStore.restore()).resolves.toBeNull();
      expect(window.localStorage.getItem(authSessionStorageKey)).toBeNull();
    },
  );

  it('removes stored sessions', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);

    await seedAuthSession(createSession(new Date(Date.now() + 60_000).toISOString()));
    authStore.clear();

    expect(getCurrentAuthSession()).toBeNull();
  });

  it('clears stored sessions when current user auth fails', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    await seedAuthSession(createSession(new Date(Date.now() + 60_000).toISOString()));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 401,
            error: 'AUTH_INVALID_TOKEN',
            message: 'Authentication token is invalid.',
          }),
          { status: 401 },
        );
      }),
    );

    await expect(fetchCurrentUser()).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });
    expect(getCurrentAuthSession()).toBeNull();
  });

  it('refreshes the session and retries current user requests when the access token is missing', async () => {
    const window = createTestWindow();
    const refreshedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...refreshedSession.user,
      displayName: 'Updated User',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 401,
            error: 'AUTH_REQUIRED',
            message: 'Authentication is required.',
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
    await seedAuthSession(createSession(new Date(Date.now() + 60_000).toISOString()));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCurrentUser()).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/auth/me', '/api/auth/refresh', '/api/auth/me']);
    expect(getCurrentAuthSession()).toEqual(refreshedSession);
  });

  it('refreshes expired access metadata before validating stored sessions', async () => {
    const window = createTestWindow();
    const expiredAccessSession = {
      ...createSession(new Date(Date.now() + 60_000).toISOString()),
      accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    const refreshedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: refreshedSession,
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem(
      authSessionStorageKey,
      JSON.stringify({
        accessTokenExpiresAt: expiredAccessSession.accessTokenExpiresAt,
        refreshTokenExpiresAt: expiredAccessSession.refreshTokenExpiresAt,
      }),
    );

    await expect(authStore.restore()).resolves.toEqual(refreshedSession);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/auth/refresh']);
    expect(getCurrentAuthSession()).toEqual(refreshedSession);
  });

  it('refreshes expired access tokens before authenticated requests', async () => {
    const window = createTestWindow();
    const storedSession = {
      ...createSession(new Date(Date.now() + 60_000).toISOString()),
      accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    const refreshedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...refreshedSession.user,
      displayName: 'Updated User',
    };
    const fetchMock = vi
      .fn()
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
    await seedAuthSession(storedSession);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCurrentUser()).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/auth/refresh', '/api/auth/me']);
    expect(getCurrentAuthSession()).toEqual(refreshedSession);
  });

  it('validates stored sessions and refreshes the stored user', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    await seedAuthSession(createSession(new Date(Date.now() + 60_000).toISOString()));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: {
              ...createSession(new Date(Date.now() + 60_000).toISOString()).user,
              displayName: 'Updated User',
            },
          }),
          { status: 200 },
        );
      }),
    );

    const session = await authStore.restore();

    expect(session?.user.displayName).toBe('Updated User');
    expect(getCurrentAuthSession()?.user.displayName).toBe('Updated User');
  });

  it('restores sessions from refresh cookies when local metadata is missing', async () => {
    const window = createTestWindow();
    const refreshedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: refreshedSession,
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);

    await expect(authStore.restore()).resolves.toEqual(refreshedSession);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/auth/refresh']);
    expect(getCurrentAuthSession()).toEqual(refreshedSession);
  });

  it('restores sessions from refresh cookies when local metadata is expired', async () => {
    const window = createTestWindow();
    const expiredSession = createSession(new Date(Date.now() - 60_000).toISOString());
    const refreshedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: refreshedSession,
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.setItem(
      authSessionStorageKey,
      JSON.stringify({
        accessTokenExpiresAt: expiredSession.accessTokenExpiresAt,
        refreshTokenExpiresAt: expiredSession.refreshTokenExpiresAt,
      }),
    );

    await expect(authStore.restore()).resolves.toEqual(refreshedSession);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/auth/refresh']);
    expect(getCurrentAuthSession()).toEqual(refreshedSession);
  });

  it('clears stored sessions when validation cannot reach the API', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    const storedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    await seedAuthSession(storedSession);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(authStore.restore()).resolves.toBeNull();
    expect(getCurrentAuthSession()).toBeNull();
  });
});
