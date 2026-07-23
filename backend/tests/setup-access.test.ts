import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupAccessCookieName } from '@tilty/shared/setup';

import { MemoryCacheStore } from '../src/infra/cache';
import { loadSetupToken, removeSetupTokenFile, SetupAccessService } from '../src/modules/setup/setup-access';
import { createTestContext, runMiddleware } from './support/http';

describe('setup access', () => {
  let originalCwd: string;
  let temporaryRoot: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    temporaryRoot = await mkdtemp(join(tmpdir(), 'tilty-setup-access-'));
    process.chdir(temporaryRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(temporaryRoot, { force: true, recursive: true });
  });

  it('creates and reuses a permission-restricted setup token file', async () => {
    const first = await loadSetupToken();
    const second = await loadSetupToken();

    expect(first.token).toHaveLength(43);
    expect(second).toEqual(first);
    await expect(readFile(first.tokenFilePath!, 'utf8')).resolves.toBe(`${first.token}\n`);

    await removeSetupTokenFile(first.tokenFilePath);
    await expect(readFile(first.tokenFilePath!, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('exchanges the setup token for a short-lived HttpOnly access cookie', async () => {
    const cacheStore = new MemoryCacheStore();
    const token = 'setup-token-with-at-least-thirty-two-characters';
    const service = new SetupAccessService(cacheStore, token);
    const unlockContext = createTestContext({ token }, {}, undefined, {
      method: 'POST',
      path: '/api/setup/unlock',
    });

    await runMiddleware(service.unlock, unlockContext);

    expect(unlockContext.body).toMatchObject({
      data: {
        unlocked: true,
      },
    });
    const cookie = JSON.parse(unlockContext.responseHeaders[`set-cookie:${setupAccessCookieName}`]!) as {
      httpOnly: boolean;
      path: string;
      sameSite: string;
      value: string;
    };

    expect(cookie).toMatchObject({
      httpOnly: true,
      path: '/api/setup',
      sameSite: 'strict',
    });

    const accessContext = createTestContext(undefined, {}, undefined, {
      cookies: {
        [setupAccessCookieName]: cookie.value,
      },
      path: '/api/setup/defaults',
    });

    await runMiddleware(service.requireAccess, accessContext);
  });

  it('rejects invalid setup tokens and missing access cookies', async () => {
    const service = new SetupAccessService(new MemoryCacheStore(), 'setup-token-with-at-least-thirty-two-characters');

    await expect(
      runMiddleware(
        service.unlock,
        createTestContext({ token: 'invalid-token-with-at-least-thirty-two-characters' }, {}, undefined, {
          method: 'POST',
        }),
      ),
    ).rejects.toMatchObject({ code: 'SETUP_TOKEN_INVALID', status: 401 });
    await expect(runMiddleware(service.requireAccess, createTestContext())).rejects.toMatchObject({
      code: 'SETUP_ACCESS_REQUIRED',
      status: 401,
    });
  });

  it('rejects insecure requests when remote setup requires HTTPS', async () => {
    const service = new SetupAccessService(new MemoryCacheStore(), 'setup-token-with-at-least-thirty-two-characters', {
      requireSecure: true,
    });

    await expect(
      runMiddleware(
        service.unlock,
        createTestContext({ token: 'setup-token-with-at-least-thirty-two-characters' }, {}, undefined, {
          method: 'POST',
          path: '/api/setup/unlock',
        }),
      ),
    ).rejects.toMatchObject({ code: 'SETUP_HTTPS_REQUIRED', status: 403 });

    await expect(
      runMiddleware(
        service.unlock,
        createTestContext({ token: 'setup-token-with-at-least-thirty-two-characters' }, {}, undefined, {
          method: 'POST',
          path: '/api/setup/unlock',
          secure: true,
        }),
      ),
    ).resolves.toBeDefined();
  });
});
