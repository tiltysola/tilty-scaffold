import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthSession,
  bindSsoAccount,
  clearStoredSession,
  completeSsoLogin,
  createSsoAccount,
  fetchAuthConfig,
  fetchCurrentUser,
  fetchSsoConfig,
  getSsoCallbackParams,
  getSsoStartUrl,
  getStoredSession,
  logout,
  refreshSession,
  register,
  resetPassword,
  resolveAssetUrl,
  sendPasswordResetEmailVerification,
  sendRegistrationEmailVerification,
  storeSession,
  uploadAvatar,
  validateStoredSession,
} from '../src/lib/auth';

const sessionStorageKey = 'tilty-scaffold.auth.session';

describe('auth storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    window.localStorage.setItem(sessionStorageKey, '{invalid');

    expect(getStoredSession()).toBeNull();
    expect(window.localStorage.getItem(sessionStorageKey)).toBeNull();
  });

  it('clears expired sessions', () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);

    storeSession(createSession(new Date(Date.now() - 60_000).toISOString()));

    expect(getStoredSession()).toBeNull();
    expect(window.localStorage.getItem(sessionStorageKey)).toBeNull();
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

      window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));

      expect(getStoredSession()).toBeNull();
      expect(window.localStorage.getItem(sessionStorageKey)).toBeNull();
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
      username: 'Updated User',
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
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:3000/api/auth/me',
      'http://localhost:3000/api/auth/refresh',
      'http://localhost:3000/api/auth/me',
    ]);
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
              username: 'Updated User',
            },
          }),
          { status: 200 },
        );
      }),
    );

    const session = await validateStoredSession();

    expect(session?.user.username).toBe('Updated User');
    expect(getStoredSession()?.user.username).toBe('Updated User');
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

  it('loads SSO public configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: {
              enabled: true,
            },
          }),
          { status: 200 },
        );
      }),
    );

    await expect(fetchSsoConfig()).resolves.toEqual({
      enabled: true,
    });
  });

  it('loads auth public configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: {
              passwordRecoveryEnabled: true,
              registrationEmailVerificationRequired: true,
            },
          }),
          { status: 200 },
        );
      }),
    );

    await expect(fetchAuthConfig()).resolves.toEqual({
      passwordRecoveryEnabled: true,
      registrationEmailVerificationRequired: true,
    });
  });

  it.each([
    {
      request: sendRegistrationEmailVerification,
      url: 'http://localhost:3000/api/auth/register/email-verification',
    },
    {
      request: sendPasswordResetEmailVerification,
      url: 'http://localhost:3000/api/auth/password-reset/email-verification',
    },
  ])('requests email verification codes from $url', async ({ request, url }) => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          email: 'user@example.com',
        }),
      );

      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: {
            cooldownSeconds: 60,
            expiresInSeconds: 600,
          },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      request({
        email: 'user@example.com',
      }),
    ).resolves.toEqual({
      cooldownSeconds: 60,
      expiresInSeconds: 600,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(url);
  });

  it('registers accounts and stores the returned session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init?: RequestInit) => {
        expect(init?.body).toBe(
          JSON.stringify({
            email: 'user@example.com',
            emailVerificationCode: '123456',
            password: 'password123',
            confirmPassword: 'password123',
            username: 'Test User',
          }),
        );

        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: session,
          }),
          { status: 201 },
        );
      }),
    );

    await expect(
      register({
        email: 'user@example.com',
        emailVerificationCode: '123456',
        password: 'password123',
        confirmPassword: 'password123',
        username: 'Test User',
      }),
    ).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });

  it('refreshes sessions and stores returned session metadata', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBeUndefined();

      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: session,
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshSession()).resolves.toEqual(session);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/auth/refresh');
    expect(getStoredSession()).toEqual(session);
  });

  it('signs out through the backend and clears the stored session', async () => {
    const window = createTestWindow();
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: {
            signedOut: true,
          },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    storeSession(createSession(new Date(Date.now() + 60_000).toISOString()));

    await logout();

    expect(getStoredSession()).toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/auth/logout');
  });

  it('keeps stored sessions until logout requests complete', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    let resolveLogout: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveLogout = resolve;
        }),
    );

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    storeSession(session);

    const logoutPromise = logout();

    expect(getStoredSession()).toEqual(session);
    resolveLogout?.(
      new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: {
            signedOut: true,
          },
        }),
        { status: 200 },
      ),
    );
    await logoutPromise;
    expect(getStoredSession()).toBeNull();
  });

  it('keeps stored sessions when logout requests fail', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    storeSession(session);

    await expect(logout()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
    expect(getStoredSession()).toEqual(session);
  });

  it('builds SSO start URLs with the redirect path', () => {
    expect(getSsoStartUrl('/reports')).toBe('http://localhost:3000/api/auth/sso/start?redirect=%2Freports');
  });

  it('reads SSO callback tokens from URL fragments before query parameters', () => {
    const params = getSsoCallbackParams(
      '?sso_token=query-token&redirect=%2Fold',
      '#sso_token=fragment-token&redirect=%2Fnew',
    );

    expect(params.get('sso_token')).toBe('fragment-token');
    expect(params.get('redirect')).toBe('/new');
  });

  it('keeps backward compatibility with SSO callback query parameters', () => {
    const params = getSsoCallbackParams('?sso_bind_token=query-bind-token&redirect=%2Fold', '');

    expect(params.get('sso_bind_token')).toBe('query-bind-token');
    expect(params.get('redirect')).toBe('/old');
  });

  it('exchanges SSO handoff tokens and stores the returned session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: session,
          }),
          { status: 200 },
        );
      }),
    );

    await expect(completeSsoLogin('handoff-token')).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });

  it('creates SSO accounts and stores the returned session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init?: RequestInit) => {
        expect(init?.body).toBe(
          JSON.stringify({
            confirmPassword: 'password123',
            password: 'password123',
            token: 'bind-token',
            username: 'SSO User',
          }),
        );

        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: session,
          }),
          { status: 201 },
        );
      }),
    );

    await expect(
      createSsoAccount({
        confirmPassword: 'password123',
        password: 'password123',
        token: 'bind-token',
        username: 'SSO User',
      }),
    ).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });

  it('resets passwords', async () => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          email: 'user@example.com',
          emailVerificationCode: '123456',
          password: 'newpassword123',
          confirmPassword: 'newpassword123',
        }),
      );

      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: {
            reset: true,
          },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      resetPassword({
        email: 'user@example.com',
        emailVerificationCode: '123456',
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      }),
    ).resolves.toEqual({
      reset: true,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/auth/password-reset');
  });

  it('binds SSO accounts and stores the returned session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init?: RequestInit) => {
        expect(init?.body).toBe(
          JSON.stringify({
            email: 'user@example.com',
            password: 'password123',
            token: 'bind-token',
          }),
        );

        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: session,
          }),
          { status: 200 },
        );
      }),
    );

    await expect(
      bindSsoAccount({
        email: 'user@example.com',
        password: 'password123',
        token: 'bind-token',
      }),
    ).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });
});

function createSession(expiresAt: string): AuthSession {
  return {
    accessTokenExpiresAt: expiresAt,
    refreshTokenExpiresAt: expiresAt,
    user: {
      id: 'user-id',
      username: 'Test User',
      email: 'user@example.com',
      roles: [],
      permissions: [],
    },
  };
}

function createTestWindow() {
  const values = new Map<string, string>();

  return {
    localStorage: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
      get length() {
        return values.size;
      },
    },
  } as Window;
}
