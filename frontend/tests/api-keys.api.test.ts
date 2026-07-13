import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiKeyActiveLimitPerUser, apiKeyPrefix } from '@tilty/shared/api-keys';

import { createApiKey, disableApiKey, enableApiKey, fetchApiKeys, revokeApiKey } from '../src/lib/api-keys';
import { createApiSuccessResponse } from './support/api';
import { clearAuthSession, createSession, createTestWindow, seedAuthSession } from './support/auth';

describe('api keys API client', () => {
  afterEach(() => {
    clearAuthSession();
    vi.unstubAllGlobals();
  });

  it('fetches API Keys for the current user', async () => {
    const fetchMock = await setupAuthenticatedFetch({
      keys: [],
      limit: apiKeyActiveLimitPerUser,
    });

    await expect(fetchApiKeys()).resolves.toEqual({
      keys: [],
      limit: apiKeyActiveLimitPerUser,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/api-keys');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('creates an API Key', async () => {
    const fetchMock = await setupAuthenticatedFetch({
      id: 'key-id',
      userId: 'user-id',
      name: 'CLI key',
      keyPrefix: `${apiKeyPrefix}_key-id`,
      keySuffix: 'abcd',
      fingerprint: 'fingerprint',
      status: 'active',
      requestCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      plainKey: `${apiKeyPrefix}_abcdefghijklmnopqrstuvwxyz_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ_abcd`,
    });

    await expect(
      createApiKey({
        name: 'CLI key',
        description: 'Automation',
        expiresAt: '2026-12-31T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      id: 'key-id',
      plainKey: expect.stringContaining(`${apiKeyPrefix}_`),
    });

    const [, init] = fetchMock.mock.calls[0]!;

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/api-keys');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(
      JSON.stringify({
        name: 'CLI key',
        description: 'Automation',
        expiresAt: '2026-12-31T00:00:00.000Z',
      }),
    );
  });

  it.each([
    ['disable', disableApiKey, '/api/api-keys/key-id/disable'],
    ['enable', enableApiKey, '/api/api-keys/key-id/enable'],
    ['revoke', revokeApiKey, '/api/api-keys/key-id/revoke'],
  ] as const)('%s an API Key', async (_actionName, action, expectedPath) => {
    const fetchMock = await setupAuthenticatedFetch({
      id: 'key-id',
      userId: 'user-id',
      name: 'CLI key',
      keyPrefix: `${apiKeyPrefix}_key-id`,
      keySuffix: 'abcd',
      fingerprint: 'fingerprint',
      status: 'active',
      requestCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(action('key-id')).resolves.toMatchObject({
      id: 'key-id',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(expectedPath);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});

async function setupAuthenticatedFetch(responseData: unknown) {
  const window = createTestWindow();
  const fetchMock = vi.fn<typeof fetch>(async () => createApiSuccessResponse(responseData));

  vi.stubGlobal('window', window);
  await seedAuthSession(createSession(new Date(Date.now() + 60_000).toISOString()));
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}
