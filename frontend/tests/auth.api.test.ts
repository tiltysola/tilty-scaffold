import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAuthConfig,
  getStoredSession,
  logout,
  refreshSession,
  register,
  resetPassword,
  sendPasswordResetEmailVerification,
  sendProfileEmailVerification,
  sendProfilePhoneVerification,
  sendRegistrationEmailVerification,
  storeSession,
  updateCurrentUser,
  verifyProfileEmail,
  verifyProfilePhone,
} from '../src/lib/auth';
import { createApiSuccessResponse } from './support/api';
import { createSession, createTestWindow } from './support/auth';

describe('auth API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads auth public configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return createApiSuccessResponse({
          passwordRecoveryEnabled: true,
          phoneCountryCodes: ['+86'],
          profileEmailVerificationEnabled: true,
          registrationEmailVerificationRequired: true,
        });
      }),
    );

    await expect(fetchAuthConfig()).resolves.toEqual({
      passwordRecoveryEnabled: true,
      phoneCountryCodes: ['+86'],
      profileEmailVerificationEnabled: true,
      registrationEmailVerificationRequired: true,
    });
  });

  it.each([
    {
      request: sendRegistrationEmailVerification,
      url: '/api/auth/register/email-verification',
    },
    {
      request: sendPasswordResetEmailVerification,
      url: '/api/auth/password-reset/email-verification',
    },
  ])('requests email verification codes from $url', async ({ request, url }) => {
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          email: 'user@example.com',
        }),
      );

      return createApiSuccessResponse({
        cooldownSeconds: 60,
        expiresInSeconds: 600,
      });
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

  it('requests profile email verification codes', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBeUndefined();
      expect(init?.method).toBe('POST');

      return createApiSuccessResponse({
        cooldownSeconds: 60,
        expiresInSeconds: 600,
      });
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    storeSession(session);

    await expect(sendProfileEmailVerification()).resolves.toEqual({
      cooldownSeconds: 60,
      expiresInSeconds: 600,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me/email-verification');
  });

  it('requests profile phone verification codes', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          phoneNumber: '+8613800138000',
        }),
      );
      expect(init?.method).toBe('POST');

      return createApiSuccessResponse({
        cooldownSeconds: 60,
        expiresInSeconds: 600,
      });
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    storeSession(session);

    await expect(
      sendProfilePhoneVerification({
        phoneNumber: '+8613800138000',
      }),
    ).resolves.toEqual({
      cooldownSeconds: 60,
      expiresInSeconds: 600,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me/phone-verification');
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
            username: 'test_user',
            displayName: 'Test User',
            email: 'user@example.com',
            emailVerificationCode: '123456',
            password: 'password123',
            confirmPassword: 'password123',
          }),
        );

        return createApiSuccessResponse(session, { status: 201 });
      }),
    );

    await expect(
      register({
        username: 'test_user',
        displayName: 'Test User',
        email: 'user@example.com',
        emailVerificationCode: '123456',
        password: 'password123',
        confirmPassword: 'password123',
      }),
    ).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });

  it('refreshes sessions and stores returned session metadata', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBeUndefined();

      return createApiSuccessResponse(session);
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshSession()).resolves.toEqual(session);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/refresh');
    expect(getStoredSession()).toEqual(session);
  });

  it('updates the current user profile and stores returned user metadata', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...session.user,
      displayName: 'Updated User',
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          displayName: 'Updated User',
          phoneNumber: '+8613800138000',
        }),
      );
      expect(init?.method).toBe('PATCH');

      return createApiSuccessResponse(updatedUser);
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    storeSession(session);

    await expect(
      updateCurrentUser({
        displayName: 'Updated User',
        phoneNumber: '+8613800138000',
      }),
    ).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me');
    expect(getStoredSession()).toEqual({
      ...session,
      user: updatedUser,
    });
  });

  it('verifies the profile email and stores returned user metadata', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...session.user,
      emailVerified: true,
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          emailVerificationCode: '123456',
        }),
      );
      expect(init?.method).toBe('POST');

      return createApiSuccessResponse(updatedUser);
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    storeSession(session);

    await expect(
      verifyProfileEmail({
        emailVerificationCode: '123456',
      }),
    ).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me/email-verification/confirm');
    expect(getStoredSession()).toEqual({
      ...session,
      user: updatedUser,
    });
  });

  it('verifies the profile phone and stores returned user metadata', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...session.user,
      phoneNumber: '+8613800138000',
      phoneVerified: true,
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          phoneNumber: '+8613800138000',
          phoneVerificationCode: '123456',
        }),
      );
      expect(init?.method).toBe('POST');

      return createApiSuccessResponse(updatedUser);
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    storeSession(session);

    await expect(
      verifyProfilePhone({
        phoneNumber: '+8613800138000',
        phoneVerificationCode: '123456',
      }),
    ).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me/phone-verification/confirm');
    expect(getStoredSession()).toEqual({
      ...session,
      user: updatedUser,
    });
  });

  it('signs out through the backend and clears the stored session', async () => {
    const window = createTestWindow();
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return createApiSuccessResponse({
        signedOut: true,
      });
    });

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);
    storeSession(createSession(new Date(Date.now() + 60_000).toISOString()));

    await logout();

    expect(getStoredSession()).toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/logout');
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
      createApiSuccessResponse({
        signedOut: true,
      }),
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

      return createApiSuccessResponse({
        reset: true,
      });
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

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/password-reset');
  });
});
