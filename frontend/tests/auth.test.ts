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
  getSsoStartUrl,
  getStoredSession,
  register,
  resetPassword,
  sendPasswordResetEmailVerification,
  sendRegistrationEmailVerification,
  storeSession,
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

    await expect(fetchCurrentUser('access-token')).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });
    expect(getStoredSession()).toBeNull();
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
              id: 'user-id',
              username: 'Updated User',
              email: 'user@example.com',
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

  it('keeps stored sessions when validation cannot reach the API', async () => {
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

    await expect(validateStoredSession()).resolves.toEqual(storedSession);
    expect(getStoredSession()).toEqual(storedSession);
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

  it('requests registration email verification codes', async () => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(JSON.stringify({
        email: 'user@example.com',
      }));

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

    await expect(sendRegistrationEmailVerification({
      email: 'user@example.com',
    })).resolves.toEqual({
      cooldownSeconds: 60,
      expiresInSeconds: 600,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/auth/register/email-verification');
  });

  it('requests password reset email verification codes', async () => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(JSON.stringify({
        email: 'user@example.com',
      }));

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

    await expect(sendPasswordResetEmailVerification({
      email: 'user@example.com',
    })).resolves.toEqual({
      cooldownSeconds: 60,
      expiresInSeconds: 600,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/auth/password-reset/email-verification');
  });

  it('registers accounts and stores the returned session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init?: RequestInit) => {
        expect(init?.body).toBe(JSON.stringify({
          email: 'user@example.com',
          emailVerificationCode: '123456',
          password: 'password123',
          confirmPassword: 'password123',
          username: 'Test User',
        }));

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

    await expect(register({
      email: 'user@example.com',
      emailVerificationCode: '123456',
      password: 'password123',
      confirmPassword: 'password123',
      username: 'Test User',
    })).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });

  it('builds SSO start URLs with the redirect path', () => {
    expect(getSsoStartUrl('/reports')).toBe(
      'http://localhost:3000/api/auth/sso/start?redirect=%2Freports',
    );
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
        expect(init?.body).toBe(JSON.stringify({
          confirmPassword: 'password123',
          password: 'password123',
          token: 'bind-token',
          username: 'SSO User',
        }));

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

    await expect(createSsoAccount({
      confirmPassword: 'password123',
      password: 'password123',
      token: 'bind-token',
      username: 'SSO User',
    })).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });

  it('resets passwords', async () => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(JSON.stringify({
        email: 'user@example.com',
        emailVerificationCode: '123456',
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      }));

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

    await expect(resetPassword({
      email: 'user@example.com',
      emailVerificationCode: '123456',
      password: 'newpassword123',
      confirmPassword: 'newpassword123',
    })).resolves.toEqual({
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
        expect(init?.body).toBe(JSON.stringify({
          email: 'user@example.com',
          password: 'password123',
          token: 'bind-token',
        }));

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

    await expect(bindSsoAccount({
      email: 'user@example.com',
      password: 'password123',
      token: 'bind-token',
    })).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });
});

function createSession(expiresAt: string): AuthSession {
  return {
    accessToken: 'access-token',
    expiresAt,
    tokenType: 'Bearer',
    user: {
      id: 'user-id',
      username: 'Test User',
      email: 'user@example.com',
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
