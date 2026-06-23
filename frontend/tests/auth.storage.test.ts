import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authSessionStorageKey,
  clearStoredSession,
  fetchCurrentUser,
  getStoredSession,
  getUserHandle,
  getUserInitials,
  storeSession,
  validateStoredSession,
} from '../src/lib/auth';
import { createSession, createTestWindow } from './support/auth';

describe('auth session storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats username handles for account displays', () => {
    expect(getUserHandle('test_user')).toBe('@test_user');
    expect(getUserHandle('  test_user  ')).toBe('@test_user');
    expect(getUserHandle()).toBe('@user');
  });

  it('formats user initials for avatars', () => {
    expect(getUserInitials('Test User')).toBe('TU');
    expect(getUserInitials('  Solo  ')).toBe('S');
    expect(getUserInitials()).toBe('U');
  });

  it('stores and reads a valid session', () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);

    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    storeSession(session);

    expect(getStoredSession()).toEqual(session);
  });

  it('clears invalid sessions', () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    window.localStorage.setItem(authSessionStorageKey, '{invalid');

    expect(getStoredSession()).toBeNull();
    expect(window.localStorage.getItem(authSessionStorageKey)).toBeNull();
  });

  it('clears expired sessions', () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);

    storeSession(createSession(new Date(Date.now() - 60_000).toISOString()));

    expect(getStoredSession()).toBeNull();
    expect(window.localStorage.getItem(authSessionStorageKey)).toBeNull();
  });

  it.each(['accessTokenExpiresAt', 'refreshTokenExpiresAt'] as const)(
    'clears sessions with invalid %s dates',
    (field) => {
      const window = createTestWindow();
      vi.stubGlobal('window', window);
      const session = {
        ...createSession(new Date(Date.now() + 60_000).toISOString()),
        [field]: 'not-a-date',
      };

      window.localStorage.setItem(authSessionStorageKey, JSON.stringify(session));

      expect(getStoredSession()).toBeNull();
      expect(window.localStorage.getItem(authSessionStorageKey)).toBeNull();
    },
  );

  it('removes stored sessions', () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);

    storeSession(createSession(new Date(Date.now() + 60_000).toISOString()));
    clearStoredSession();

    expect(getStoredSession()).toBeNull();
  });

  it('clears stored sessions when current user auth fails', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    storeSession(createSession(new Date(Date.now() + 60_000).toISOString()));
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
    expect(getStoredSession()).toBeNull();
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
    vi.stubGlobal('fetch', fetchMock);
    storeSession(createSession(new Date(Date.now() + 60_000).toISOString()));

    await expect(fetchCurrentUser()).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/auth/me', '/api/auth/refresh', '/api/auth/me']);
    expect(getStoredSession()).toEqual(refreshedSession);
  });

  it('validates stored sessions and refreshes the stored user', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    storeSession(createSession(new Date(Date.now() + 60_000).toISOString()));
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

    const session = await validateStoredSession();

    expect(session?.user.displayName).toBe('Updated User');
    expect(getStoredSession()?.user.displayName).toBe('Updated User');
  });

  it('clears stored sessions when validation cannot reach the API', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    const storedSession = createSession(new Date(Date.now() + 60_000).toISOString());
    storeSession(storedSession);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(validateStoredSession()).resolves.toBeNull();
    expect(getStoredSession()).toBeNull();
  });
});
