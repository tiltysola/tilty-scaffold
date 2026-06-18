import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchUsers } from '../src/lib/users';

describe('users API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches paginated users with page query parameters', async () => {
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/users/?page=2&pageSize=20');
  });
});
