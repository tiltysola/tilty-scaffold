import { afterEach, describe, expect, it, vi } from 'vitest';

import { type RegistrationResponseJSON } from '@simplewebauthn/browser';

const startRegistrationMock = vi.hoisted(() => vi.fn());

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: startRegistrationMock,
}));

import { completePasskeyRegistration, type PasskeyRegistrationOptionsResult } from '../src/lib/auth';
import { createApiSuccessResponse } from './support/api';
import { clearAuthSession, createSession, createTestWindow, seedAuthSession } from './support/auth';

describe('auth passkey client', () => {
  afterEach(() => {
    clearAuthSession();
    startRegistrationMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('completes passkey registration from prepared options', async () => {
    const events: string[] = [];
    const registrationResult: PasskeyRegistrationOptionsResult = {
      registrationToken: '00000000-0000-4000-8000-000000000000',
      options: {
        challenge: 'challenge',
        pubKeyCredParams: [
          {
            alg: -7,
            type: 'public-key',
          },
        ],
        rp: {
          name: 'Tilty',
        },
        user: {
          id: 'user-id',
          name: 'user@example.com',
          displayName: 'Test User',
        },
      },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const registrationResponse: RegistrationResponseJSON = {
      id: 'credential-id',
      rawId: 'credential-id',
      response: {
        clientDataJSON: 'client-data',
        attestationObject: 'attestation-object',
      },
      clientExtensionResults: {},
      type: 'public-key',
    };
    const passkey = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Passkey 1',
      deviceType: 'singleDevice',
      backedUp: false,
      transports: [],
      createdAt: new Date().toISOString(),
    };
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());
    const fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      events.push('fetch');
      expect(_url).toBe('/api/auth/passkeys');
      expect(init?.body).toBe(
        JSON.stringify({
          name: 'Passkey 1',
          registrationToken: registrationResult.registrationToken,
          response: registrationResponse,
        }),
      );

      return createApiSuccessResponse(passkey);
    });

    startRegistrationMock.mockImplementation(async () => {
      events.push('startRegistration');

      return registrationResponse;
    });

    vi.stubGlobal('window', window);
    await seedAuthSession(session);
    vi.stubGlobal('fetch', fetchMock);

    await expect(completePasskeyRegistration('Passkey 1', registrationResult)).resolves.toEqual(passkey);
    expect(startRegistrationMock).toHaveBeenCalledWith({ optionsJSON: registrationResult.options });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['startRegistration', 'fetch']);
  });
});
