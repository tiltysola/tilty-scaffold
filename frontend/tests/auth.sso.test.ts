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
              loginEnabled: true,
              providers: [
                {
                  id: 'corporate',
                  name: 'Corporate SSO',
                  protocol: 'oidc',
                  loginEnabled: true,
                  bindingEnabled: true,
                },
              ],
            },
          }),
          { status: 200 },
        );
      }),
    );

    await expect(fetchSsoConfig()).resolves.toEqual({
      enabled: true,
      loginEnabled: true,
      providers: [
        {
          id: 'corporate',
          name: 'Corporate SSO',
          protocol: 'oidc',
          loginEnabled: true,
          bindingEnabled: true,
        },
      ],
    });
  });

  it('builds SSO start URLs with the redirect path', () => {
    expect(getSsoStartUrl('/reports')).toBe('/api/auth/sso/start?redirect=%2Freports');
    expect(getSsoStartUrl('/reports', 'corporate')).toBe(
      '/api/auth/sso/start?redirect=%2Freports&providerId=corporate',
    );
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
            username: 'sso_user',
            displayName: 'Provider User',
            password: 'password123',
            confirmPassword: 'password123',
            token: 'bind-token',
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
        username: 'sso_user',
        displayName: 'Provider User',
        password: 'password123',
        confirmPassword: 'password123',
        token: 'bind-token',
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
            identifier: 'user@example.com',
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
        identifier: 'user@example.com',
        password: 'password123',
        token: 'bind-token',
      }),
    ).resolves.toEqual(session);
    expect(getStoredSession()).toEqual(session);
  });
});
