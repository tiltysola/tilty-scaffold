import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSystemSettings, updateSystemSettings } from '../src/lib/system-settings';
import { createApiSuccessResponse } from './support/api';

describe('system settings API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls system settings endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe('/api/admin/system-settings/');

      return createApiSuccessResponse({
        environment: { NODE_ENV: 'development' },
        environmentFileLoaded: true,
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSystemSettings()).resolves.toEqual({
      environment: { NODE_ENV: 'development' },
      environmentFileLoaded: true,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('puts system settings updates', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      createApiSuccessResponse({
        restartRequired: true,
        updated: true,
      }),
    );
    const environment = {
      NODE_ENV: 'development',
    };

    vi.stubGlobal('fetch', fetchMock);

    await expect(updateSystemSettings(environment)).resolves.toEqual({
      restartRequired: true,
      updated: true,
    });

    const [url, init] = fetchMock.mock.calls[0]!;

    expect(String(url)).toBe('/api/admin/system-settings/');
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(JSON.stringify({ environment }));
  });
});
