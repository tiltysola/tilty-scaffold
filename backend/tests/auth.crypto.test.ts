import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessToken,
  createRefreshToken,
  createSsoBindToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifySsoBindToken,
} from '../src/modules/auth/auth.crypto';

const authTokenSecret = 'test-auth-token-secret-minimum-32-characters';
const payload = {
  sub: 'user-id',
  email: 'user@example.com',
  username: 'Test User',
};

describe('auth token crypto', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates and verifies access tokens', async () => {
    const token = await createAccessToken(payload, authTokenSecret, 900);
    const verified = await verifyAccessToken(token.accessToken, authTokenSecret);

    expect(token.accessToken.split('.')).toHaveLength(3);
    expect(Date.parse(token.expiresAt)).not.toBeNaN();
    expect(verified).toMatchObject({
      ...payload,
      type: 'access',
    });
  });

  it('rejects invalid access tokens', async () => {
    await expect(verifyAccessToken('not-a-token', authTokenSecret)).rejects.toMatchObject({
      code: 'AUTH_INVALID_TOKEN',
      status: 401,
    });
  });

  it('rejects expired access tokens', async () => {
    const now = new Date('2026-06-17T00:00:00.000Z');

    vi.useFakeTimers({ now });

    const token = await createAccessToken(payload, authTokenSecret, 900);

    vi.setSystemTime(new Date(now.getTime() + 901 * 1000));

    await expect(verifyAccessToken(token.accessToken, authTokenSecret)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
      status: 401,
    });
  });

  it('creates and verifies refresh tokens', async () => {
    const token = await createRefreshToken(
      {
        jti: 'refresh-token-id',
        sub: payload.sub,
      },
      authTokenSecret,
      30 * 24 * 60 * 60,
    );
    const verified = await verifyRefreshToken(token.refreshToken, authTokenSecret);

    expect(token.refreshToken.split('.')).toHaveLength(3);
    expect(Date.parse(token.expiresAt)).not.toBeNaN();
    expect(verified).toMatchObject({
      jti: 'refresh-token-id',
      sub: payload.sub,
      type: 'refresh',
    });
  });

  it('creates and verifies SSO bind tokens', async () => {
    const token = await createSsoBindToken(
      {
        email: 'sso@example.com',
        redirectPath: '/dashboard',
        ssoSubject: 'provider-user@passport.mahoutsukai.cn',
        username: 'SSO User',
      },
      authTokenSecret,
    );
    const verified = await verifySsoBindToken(token.token, authTokenSecret);

    expect(token.token.split('.')).toHaveLength(3);
    expect(Date.parse(token.expiresAt)).not.toBeNaN();
    expect(verified).toMatchObject({
      email: 'sso@example.com',
      jti: token.tokenId,
      redirectPath: '/dashboard',
      ssoSubject: 'provider-user@passport.mahoutsukai.cn',
      type: 'sso_bind',
      username: 'SSO User',
    });
  });
});
