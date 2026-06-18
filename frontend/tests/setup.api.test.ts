import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  completeSetup,
  fetchSetupDefaults,
  fetchSetupStatus,
  testCacheConnection,
  testDatabaseConnection,
  testEmailConnection,
  testFileStorageConnection,
  testLoggingConnection,
  testSsoConnection,
  validateSetup,
  validateSetupEnvironment,
} from '../src/lib/setup';

describe('setup API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls setup status and defaults endpoints', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const data = url.endsWith('/api/setup/status')
        ? { envFilePath: '/app/backend/.env', locked: false, required: true }
        : { environment: { NODE_ENV: 'development' } };

      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data,
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSetupStatus()).resolves.toMatchObject({ required: true });
    await expect(fetchSetupDefaults()).resolves.toMatchObject({ environment: { NODE_ENV: 'development' } });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:3000/api/setup/status',
      'http://localhost:3000/api/setup/defaults',
    ]);
  });

  it('posts setup validation and completion payloads', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const data = url.endsWith('/api/setup/validate') ? { valid: true } : { completed: true, restartRequired: true };

      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data,
        }),
        { status: 200 },
      );
    });
    const payload = {
      administrator: {
        confirmPassword: 'password123',
        email: 'root@example.com',
        password: 'password123',
        username: 'Root User',
      },
      environment: {
        NODE_ENV: 'development',
      },
    };

    vi.stubGlobal('fetch', fetchMock);

    await expect(validateSetup(payload)).resolves.toEqual({ valid: true });
    await expect(completeSetup(payload)).resolves.toEqual({ completed: true, restartRequired: true });

    const [, validateInit] = fetchMock.mock.calls[0]!;
    const [, completeInit] = fetchMock.mock.calls[1]!;

    expect(validateInit?.method).toBe('POST');
    expect(validateInit?.body).toBe(JSON.stringify(payload));
    expect(completeInit?.method).toBe('POST');
    expect(completeInit?.body).toBe(JSON.stringify(payload));
  });

  it('posts setup connectivity tests', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const data = getConnectivityTestResponse(url);

      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data,
        }),
        { status: 200 },
      );
    });
    const environment = {
      CACHE_STORE: 'redis',
      DATABASE_DIALECT: 'sqlite',
    };

    vi.stubGlobal('fetch', fetchMock);

    await expect(testDatabaseConnection(environment)).resolves.toEqual({ connected: true });
    await expect(testCacheConnection(environment)).resolves.toEqual({ connected: true, store: 'redis' });
    await expect(testFileStorageConnection(environment)).resolves.toEqual({ connected: true, driver: 'oss' });
    await expect(testLoggingConnection(environment)).resolves.toEqual({ connected: true, target: 'sls' });
    await expect(testEmailConnection(environment)).resolves.toEqual({ connected: true, service: 'smtp' });
    await expect(testSsoConnection(environment)).resolves.toEqual({ connected: true, enabled: true });
    await expect(validateSetupEnvironment(environment)).resolves.toEqual({ valid: true });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:3000/api/setup/test/database',
      'http://localhost:3000/api/setup/test/cache',
      'http://localhost:3000/api/setup/test/file-storage',
      'http://localhost:3000/api/setup/test/logging',
      'http://localhost:3000/api/setup/test/email',
      'http://localhost:3000/api/setup/test/sso',
      'http://localhost:3000/api/setup/validate/environment',
    ]);
  });
});

function getConnectivityTestResponse(url: string) {
  if (url.endsWith('/api/setup/test/cache')) {
    return { connected: true, store: 'redis' };
  }

  if (url.endsWith('/api/setup/test/file-storage')) {
    return { connected: true, driver: 'oss' };
  }

  if (url.endsWith('/api/setup/test/logging')) {
    return { connected: true, target: 'sls' };
  }

  if (url.endsWith('/api/setup/test/email')) {
    return { connected: true, service: 'smtp' };
  }

  if (url.endsWith('/api/setup/test/sso')) {
    return { connected: true, enabled: true };
  }

  if (url.endsWith('/api/setup/validate/environment')) {
    return { valid: true };
  }

  return { connected: true };
}
