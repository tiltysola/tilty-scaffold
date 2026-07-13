import { describe, expect, it } from 'vitest';

import { defaultAuthCookieConfig } from '../src/modules/auth/auth.http';
import { createUsersModule } from '../src/modules/users';
import { type UserProfileOptionsService } from '../src/modules/users/user-profile-options.controller';
import { createTestContext, getTestRoute, runMiddlewares } from './support/http';

interface ProfileOptionsBody {
  data: {
    options: Array<{
      id: string;
      label: string;
      value: string;
      description?: string;
    }>;
  };
}

describe('profile options API', () => {
  const userService = {
    listDistinctProfileGenders: async () => ['Wuzhuang Helicaptor', 'Agender', 'male'],
  } satisfies UserProfileOptionsService;
  const options = {
    authService: {
      authenticate: async () => ({}),
    },
    cookies: defaultAuthCookieConfig,
  };
  const routes = createProfileOptionsRoutes(userService, options);

  it('returns default gender options before custom user gender options', async () => {
    const context = await runProfileOptionsRoute(routes, '/genders');
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options.slice(0, 3)).toEqual([
      {
        id: 'gender:Male',
        label: 'Male',
        value: 'Male',
      },
      {
        id: 'gender:Female',
        label: 'Female',
        value: 'Female',
      },
      {
        id: 'gender:Secret',
        label: 'Secret',
        value: 'Secret',
      },
    ]);
    expect(body.data.options).toHaveLength(5);
    expect(body.data.options).toContainEqual({
      id: 'gender:Wuzhuang%20Helicaptor',
      label: 'Wuzhuang Helicaptor',
      value: 'Wuzhuang Helicaptor',
    });
    expect(body.data.options.filter((option) => option.value.toLowerCase() === 'male')).toHaveLength(1);
  });

  it('filters gender options by query', async () => {
    const context = await runProfileOptionsRoute(routes, '/genders', {
      query: {
        q: 'Wuzhuang',
      },
    });
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options).toEqual([
      {
        id: 'gender:Wuzhuang%20Helicaptor',
        label: 'Wuzhuang Helicaptor',
        value: 'Wuzhuang Helicaptor',
      },
    ]);
  });

  it('requires authentication before returning gender options', async () => {
    await expect(runProfileOptionsRoute(routes, '/genders', { authenticated: false })).rejects.toThrow(
      'Authentication is required.',
    );
  });

  it('limits custom gender options to 30 random values', async () => {
    const limitedRoutes = createProfileOptionsRoutes(
      {
        listDistinctProfileGenders: async () => Array.from({ length: 40 }, (_, index) => `Custom Gender ${index + 1}`),
      },
      options,
    );
    const context = await runProfileOptionsRoute(limitedRoutes, '/genders');
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options).toHaveLength(33);
    expect(body.data.options.slice(0, 3).map((option) => option.value)).toEqual(['Male', 'Female', 'Secret']);
  });

  it('returns matching country options', async () => {
    const context = await runProfileOptionsRoute(routes, '/locations/countries', {
      query: {
        q: 'United States',
      },
    });
    const body = context.body as ProfileOptionsBody;

    expect(body).toMatchObject({
      code: 200,
      error: null,
    });
    expect(body.data.options).toContainEqual({
      id: 'country:233',
      label: 'United States',
      value: 'United States',
      description: 'US',
    });
  });

  it('returns the complete country option list when no query is provided', async () => {
    const context = await runProfileOptionsRoute(routes, '/locations/countries');
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options.length).toBeGreaterThan(200);
  });

  it('returns region options for a country', async () => {
    const context = await runProfileOptionsRoute(routes, '/locations/regions', {
      query: {
        country: 'United States',
        q: 'California',
      },
    });
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options).toContainEqual({
      id: 'region:1416',
      label: 'California',
      value: 'California',
      description: 'CA',
    });
  });

  it('returns city options for a country and region', async () => {
    const context = await runProfileOptionsRoute(routes, '/locations/cities', {
      query: {
        country: 'United States',
        region: 'California',
        q: 'Los Angeles',
      },
    });
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options).toContainEqual({
      id: 'city:120784',
      label: 'Los Angeles',
      value: 'Los Angeles',
      description: 'CA',
    });
  });

  it('returns Beijing district options from the location data source', async () => {
    const context = await runProfileOptionsRoute(routes, '/locations/cities', {
      query: {
        country: 'China',
        region: 'Beijing',
        q: 'Chaoyang',
      },
    });
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options).toContainEqual({
      id: 'city:157077',
      label: 'Chaoyang',
      value: 'Chaoyang',
      description: 'BJ',
    });
  });

  it('returns the complete city option list for a resolved region when no query is provided', async () => {
    const context = await runProfileOptionsRoute(routes, '/locations/cities', {
      query: {
        country: 'United States',
        region: 'California',
      },
    });
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options.length).toBeGreaterThan(50);
  });

  it('returns no city options when the region cannot be resolved', async () => {
    const context = await runProfileOptionsRoute(routes, '/locations/cities', {
      query: {
        country: 'United States',
        region: 'Missing Region',
        q: 'Los Angeles',
      },
    });
    const body = context.body as ProfileOptionsBody;

    expect(body.data.options).toEqual([]);
  });
});

function runProfileOptionsRoute(
  routes: ReturnType<typeof createProfileOptionsRoutes>,
  path: string,
  options: {
    authenticated?: boolean;
    query?: Record<string, string | undefined>;
  } = {},
) {
  return runMiddlewares(
    getTestRoute(routes, 'get', `/profile-options${path}`).handlers,
    createTestContext(undefined, {}, undefined, {
      cookies:
        options.authenticated === false
          ? undefined
          : {
              tilty_scaffold_access_token: 'test-access-token',
            },
      query: options.query,
    }),
  );
}

function createProfileOptionsRoutes(
  userService: UserProfileOptionsService,
  options: {
    authService: { authenticate: () => Promise<unknown> };
    cookies: typeof defaultAuthCookieConfig;
  },
) {
  return createUsersModule(
    userService as Parameters<typeof createUsersModule>[0],
    options.authService as Parameters<typeof createUsersModule>[1],
    {
      cookies: options.cookies,
    },
  ).routes;
}
