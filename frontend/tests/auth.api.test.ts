import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAuthConfig,
  getStoredSession,
  logout,
  refreshSession,
  register,
  resetPassword,
  sendPasswordResetEmailVerification,
  sendRegistrationEmailVerification,
  storeSession,
} from '../src/lib/auth';
import { createSession, createTestWindow } from './support/auth';

describe('auth API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    const fetchMock = vi.fn<typeof fetch>(async () => {
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
    const fetchMock = vi.fn<typeof fetch>(
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
});
