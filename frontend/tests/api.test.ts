import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiRequest, getApiErrorMessage } from '../src/lib/api';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends JSON requests and returns response data', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: { ok: true },
        }),
        { status: 200 },
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const data = await apiRequest<{ ok: boolean }>('/api/auth/login', {
      body: { email: 'user@example.com', password: 'password123' },
      method: 'POST',
    });

    expect(data).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Headers;

    expect(url).toBe('http://localhost:3000/api/auth/login');
    expect(init?.body).toBe(JSON.stringify({ email: 'user@example.com', password: 'password123' }));
    expect(init?.credentials).toBe('include');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('sends FormData requests without JSON content headers', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          code: 200,
          error: null,
          data: { ok: true },
        }),
        { status: 200 },
      );
    });
    const form = new FormData();

    form.append('avatar', new Blob(['avatar'], { type: 'image/png' }), 'avatar.png');
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest<{ ok: boolean }>('/api/auth/avatar', {
      body: form,
      method: 'POST',
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Headers;

    expect(init?.body).toBe(form);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('throws ApiError for API failure payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 401,
            error: 'AUTH_REQUIRED',
            message: 'Authentication is required.',
          }),
          { status: 401 },
        );
      }),
    );

    await expect(apiRequest('/api/auth/me')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  });

  it('throws ApiError for network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(apiRequest('/api/health')).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/api/health')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });

  it('returns normalized API error messages', () => {
    expect(getApiErrorMessage(new ApiError(400, 'FIELD_VALIDATE_ERROR', 'Invalid.'), 'Fallback.')).toBe('Invalid.');
    expect(getApiErrorMessage(new Error('plain'), 'Fallback.')).toBe('Fallback.');
  });
});
