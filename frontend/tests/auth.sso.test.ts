import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindSsoAccount,
  completeSsoLogin,
  createSsoAccount,
  fetchSsoConfig,
  getSsoCallbackParams,
  getSsoStartUrl,
  getStoredSession,
} from '../src/lib/auth';
import { createSession, createTestWindow } from './support/auth';

describe('auth SSO client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads SSO public configuration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: {
              enabled: true,
            },
          }),
          { status: 200 },
        );
      }),
    );

    await expect(fetchSsoConfig()).resolves.toEqual({
      enabled: true,
    });
  });

  it('builds SSO start URLs with the redirect path', () => {
    expect(getSsoStartUrl('/reports')).toBe('http://localhost:3000/api/auth/sso/start?redirect=%2Freports');
  });

  it('reads SSO callback tokens from URL fragments', () => {
    const params = getSsoCallbackParams('#sso_token=fragment-token&redirect=%2Fnew');

    expect(params.get('sso_token')).toBe('fragment-token');
    expect(params.get('redirect')).toBe('/new');
  });

  it('exchanges SSO handoff tokens and stores the returned session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: session,
          }),
          { status: 200 },
        );
      }),
    );

    await expect(completeSsoLogin('handoff-token')).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });

  it('creates SSO accounts and stores the returned session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init?: RequestInit) => {
        expect(init?.body).toBe(
          JSON.stringify({
            confirmPassword: 'password123',
            password: 'password123',
            token: 'bind-token',
            username: 'SSO User',
          }),
        );

        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: session,
          }),
          { status: 201 },
        );
      }),
    );

    await expect(
      createSsoAccount({
        confirmPassword: 'password123',
        password: 'password123',
        token: 'bind-token',
        username: 'SSO User',
      }),
    ).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });

  it('binds SSO accounts and stores the returned session', async () => {
    const window = createTestWindow();
    const session = createSession(new Date(Date.now() + 60_000).toISOString());

    vi.stubGlobal('window', window);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init?: RequestInit) => {
        expect(init?.body).toBe(
          JSON.stringify({
            email: 'user@example.com',
            password: 'password123',
            token: 'bind-token',
          }),
        );

        return new Response(
          JSON.stringify({
            code: 200,
            error: null,
            data: session,
          }),
          { status: 200 },
        );
      }),
    );

    await expect(
      bindSsoAccount({
        email: 'user@example.com',
        password: 'password123',
        token: 'bind-token',
      }),
    ).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });
});
