import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchUsers, updateUser } from '../src/lib/users';
import { clearAuthSession, createSession, createTestWindow, seedAuthSession } from './support/auth';

describe('users API client', () => {
  afterEach(() => {
    clearAuthSession();
    vi.unstubAllGlobals();
  });

  it('fetches paginated users with page query parameters', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    await seedAuthSession(createSession(new Date(Date.now() + 60_000).toISOString()));
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: {
            pagination: {
              page: 2,
              pageSize: 20,
              total: 42,
              totalPages: 3,
            },
            roles: [],
            users: [],
          },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchUsers({ page: 2, pageSize: 20 })).resolves.toEqual({
      pagination: {
        page: 2,
        pageSize: 20,
        total: 42,
        totalPages: 3,
      },
      roles: [],
      users: [],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/users/?page=2&pageSize=20');
  });

  it('updates a managed user with changed fields and roles', async () => {
    const window = createTestWindow();
    vi.stubGlobal('window', window);
    await seedAuthSession(createSession(new Date(Date.now() + 60_000).toISOString()));
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: {
            id: 'user-id',
            username: 'managed_user',
            displayName: 'Managed User',
            email: 'managed@example.com',
            emailVerified: true,
            phoneNumber: '+8613800138000',
            phoneVerified: true,
            available: true,
            roles: ['USER_LIST'],
            permissions: ['USER_LIST'],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateUser('user-id', {
        displayName: 'Managed User',
        bio: 'Managed profile bio.',
        location: 'Tokyo',
        emailVerified: true,
        phoneVerified: true,
        password: 'newpassword123',
        roleKeys: ['USER_LIST'],
      }),
    ).resolves.toMatchObject({
      id: 'user-id',
      username: 'managed_user',
      roles: ['USER_LIST'],
    });

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(url).toBe('/api/users/user-id');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(
      JSON.stringify({
        displayName: 'Managed User',
        bio: 'Managed profile bio.',
        location: 'Tokyo',
        emailVerified: true,
        phoneVerified: true,
        password: 'newpassword123',
        roleKeys: ['USER_LIST'],
      }),
    );
  });
});
