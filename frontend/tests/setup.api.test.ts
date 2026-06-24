import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  completeSetup,
  fetchSetupDefaults,
  testCacheConnection,
  testDatabaseConnection,
  testEmailConnection,
  testFileStorageConnection,
  testLoggingConnection,
  testSmsConnection,
  testSsoConnection,
  validateSetupEnvironment,
} from '../src/lib/setup';
import { createApiSuccessResponse } from './support/api';

describe('setup API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls setup defaults endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);

      expect(url).toBe('/api/setup/defaults');

      return createApiSuccessResponse({
        environment: { NODE_ENV: 'development' },
        environmentFileLoaded: false,
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSetupDefaults()).resolves.toMatchObject({
      environment: { NODE_ENV: 'development' },
      environmentFileLoaded: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('posts setup completion payloads', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      createApiSuccessResponse({
        administratorCreated: true,
        completed: true,
        restartRequired: true,
      }),
    );
    const payload = {
      administrator: {
        username: 'root_user',
        displayName: 'Root User',
        email: 'root@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      },
      environment: {
        NODE_ENV: 'development',
      },
    };

    vi.stubGlobal('fetch', fetchMock);

    await expect(completeSetup(payload)).resolves.toEqual({
      administratorCreated: true,
      completed: true,
      restartRequired: true,
    });

    const [url, completeInit] = fetchMock.mock.calls[0]!;

    expect(String(url)).toBe('/api/setup/complete');
    expect(completeInit?.method).toBe('POST');
    expect(completeInit?.body).toBe(JSON.stringify(payload));
  });

  it('posts setup connectivity tests', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const data = getConnectivityTestResponse(url);

      return createApiSuccessResponse(data);
    });
    const environment = {
      CACHE_STORE: 'redis',
      DATABASE_DIALECT: 'sqlite',
    };

    vi.stubGlobal('fetch', fetchMock);

    await expect(testDatabaseConnection(environment)).resolves.toEqual({ connected: true, hasExistingUsers: false });
    await expect(testCacheConnection(environment)).resolves.toEqual({ connected: true, store: 'redis' });
    await expect(testFileStorageConnection(environment)).resolves.toEqual({ connected: true, driver: 'oss' });
    await expect(testLoggingConnection(environment)).resolves.toEqual({ connected: true, target: 'sls' });
    await expect(testEmailConnection(environment)).resolves.toEqual({ connected: true, service: 'smtp' });
    await expect(testSmsConnection(environment)).resolves.toEqual({
      connected: true,
      service: 'aliyun',
      profileCountryCodes: ['+86', '+852'],
    });
    await expect(testSsoConnection(environment)).resolves.toEqual({
      connected: true,
      enabled: true,
      providerIds: ['corporate'],
    });
    await expect(validateSetupEnvironment(environment, 'runtime')).resolves.toEqual({ valid: true });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/setup/test/database',
      '/api/setup/test/cache',
      '/api/setup/test/file-storage',
      '/api/setup/test/logging',
      '/api/setup/test/email',
      '/api/setup/test/sms',
      '/api/setup/test/sso',
      '/api/setup/validate/environment',
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

  if (url.endsWith('/api/setup/test/sms')) {
    return { connected: true, service: 'aliyun', profileCountryCodes: ['+86', '+852'] };
  }

  if (url.endsWith('/api/setup/test/sso')) {
    return { connected: true, enabled: true, providerIds: ['corporate'] };
  }

  if (url.endsWith('/api/setup/validate/environment')) {
    return { valid: true };
  }

  return { connected: true, hasExistingUsers: false };
}
