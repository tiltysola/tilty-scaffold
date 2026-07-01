import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authStore,
  changePassword,
  createVerificationChallenge,
  fetchAuthConfig,
  logout,
  register,
  resetPassword,
  sendPasswordResetEmailVerification,
  sendProfileEmailVerification,
  sendProfilePhoneVerification,
  sendRegistrationEmailVerification,
  updateCurrentUser,
  updateMfaSettings,
  verifyProfileEmail,
  verifyProfilePhone,
} from '../src/lib/auth';
import { createApiSuccessResponse } from './support/api';
import {
  clearAuthSession,
  createSession,
  createTestWindow,
  getCurrentAuthSession,
  seedAuthSession,
} from './support/auth';

describe('auth API client', () => {
  afterEach(() => {
    clearAuthSession();
    vi.unstubAllGlobals();
  });

  it('loads auth public configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return createApiSuccessResponse({
          fileUploadMaxBytes: 2 * 1024 * 1024,
          passwordRecoveryEnabled: true,
          phoneCountryCodes: ['+86'],
          profileEmailVerificationEnabled: true,
          registrationEmailVerificationRequired: true,
        });
      }),
    );

    await expect(fetchAuthConfig()).resolves.toEqual({
      fileUploadMaxBytes: 2 * 1024 * 1024,
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
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

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
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

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
    expect(getCurrentAuthSession()).toEqual(session);
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

    await expect(authStore.refresh()).resolves.toEqual(session);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/refresh');
    expect(getCurrentAuthSession()).toEqual(session);
  });

  it('shares concurrent refresh session requests', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    let resolveRefresh: (response: Response) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    vi.stubGlobal('window', window);
    vi.stubGlobal('fetch', fetchMock);

    expect(authStore.getSnapshot().isRefreshing).toBe(false);
    const firstRefresh = authStore.refresh();
    const secondRefresh = authStore.refresh();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authStore.getSnapshot().isRefreshing).toBe(true);
    resolveRefresh(createApiSuccessResponse(session));
    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([session, session]);
    expect(authStore.getSnapshot().isRefreshing).toBe(false);
    expect(getCurrentAuthSession()).toEqual(session);
  });

  it('updates the current user profile and stores returned user metadata', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const updatedUser = {
      ...session.user,
      displayName: 'Updated User',
      gender: 'Custom',
      birthday: '2008-05-23',
      bio: 'Frontend is waking up.',
      location: 'Chaoyang, Beijing',
      websiteUrl: 'https://www.tiltysola.com/',
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          displayName: 'Updated User',
          gender: 'Custom',
          birthday: '2008-05-23',
          bio: 'Frontend is waking up.',
          location: 'Chaoyang, Beijing',
          websiteUrl: 'https://www.tiltysola.com/',
          phoneNumber: '+8613800138000',
        }),
      );
      expect(init?.method).toBe('PATCH');

      return createApiSuccessResponse(updatedUser);
    });

    vi.stubGlobal('window', window);
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateCurrentUser({
        displayName: 'Updated User',
        gender: 'Custom',
        birthday: '2008-05-23',
        bio: 'Frontend is waking up.',
        location: 'Chaoyang, Beijing',
        websiteUrl: 'https://www.tiltysola.com/',
        phoneNumber: '+8613800138000',
      }),
    ).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me');
    expect(getCurrentAuthSession()).toEqual({
      ...session,
      user: updatedUser,
    });
  });

  it('changes passwords with the authenticated session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          currentPassword: 'password123',
          password: 'newpassword123',
          confirmPassword: 'newpassword123',
        }),
      );
      expect(init?.method).toBe('PATCH');

      return createApiSuccessResponse({
        changed: true,
      });
    });

    vi.stubGlobal('window', window);
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      changePassword({
        currentPassword: 'password123',
        password: 'newpassword123',
        confirmPassword: 'newpassword123',
      }),
    ).resolves.toEqual({
      changed: true,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me/password');
    expect(getCurrentAuthSession()).toEqual(session);
  });

  it('creates password change verification challenges', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const challenge = {
      requiresVerification: true,
      verificationToken: '11111111-1111-4111-8111-111111111111',
      purpose: 'change_password',
      defaultMethod: 'email',
      methods: [
        {
          method: 'email',
          maskedTarget: '***@example.com',
        },
      ],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      remainingAttempts: 5,
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          purpose: 'change_password',
        }),
      );
      expect(init?.method).toBe('POST');

      return createApiSuccessResponse(challenge);
    });

    vi.stubGlobal('window', window);
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

    await expect(createVerificationChallenge('change_password')).resolves.toEqual(challenge);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/verification/challenges');
  });

  it('updates MFA settings with the two-step verification switch', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const settings = {
      availableMethods: ['sms', 'email'],
      defaultMethod: 'sms',
      effectiveMethods: ['sms', 'email'],
      mfaRequiredForSso: true,
      passkeyCount: 0,
      twoStepCanDisable: true,
      twoStepCanEnable: true,
      twoStepEnabled: true,
    };
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      expect(init?.body).toBe(
        JSON.stringify({
          enabled: true,
        }),
      );
      expect(init?.method).toBe('PATCH');

      return createApiSuccessResponse(settings);
    });

    vi.stubGlobal('window', window);
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateMfaSettings({ enabled: true })).resolves.toEqual(settings);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/mfa');
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
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      verifyProfileEmail({
        emailVerificationCode: '123456',
      }),
    ).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me/email-verification/confirm');
    expect(getCurrentAuthSession()).toEqual({
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
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      verifyProfilePhone({
        phoneNumber: '+8613800138000',
        phoneVerificationCode: '123456',
      }),
    ).resolves.toEqual(updatedUser);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/me/phone-verification/confirm');
    expect(getCurrentAuthSession()).toEqual({
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
    await seedAuthSession(createSession(new Date(Date.now() + 60_000).toISOString()));
    vi.stubGlobal('fetch', fetchMock);

    await logout();

    expect(getCurrentAuthSession()).toBeNull();
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
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

    const logoutPromise = logout();

    expect(getCurrentAuthSession()).toEqual(session);
    resolveLogout?.(
      createApiSuccessResponse({
        signedOut: true,
      }),
    );
    await logoutPromise;
    expect(getCurrentAuthSession()).toBeNull();
  });

  it('keeps stored sessions when logout requests fail', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    await seedAuthSession(session);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(logout()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
    expect(getCurrentAuthSession()).toEqual(session);
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
