import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { staticFilesMiddleware } from '../src/middleware/static-files';
import { createTestContext, runMiddleware } from './support/http';

describe('static file middleware', () => {
  it('serves upload files with cache and same-site resource policy headers', async () => {
    const root = `./data/static-files-test-${Date.now()}`;
    const fileName = 'avatar.png';

    await mkdir(root, { recursive: true });
    await writeFile(join(root, fileName), Buffer.from('89504e470d0a1a0a', 'hex'));

    try {
      const middleware = staticFilesMiddleware({
        root,
        urlPrefix: '/uploads',
      });
      const context = await runMiddleware(
        middleware,
        createTestContext(undefined, {}, undefined, {
          method: 'GET',
          path: `/uploads/${fileName}`,
        }),
      );

      expect(context.responseHeaders['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(context.responseHeaders['cross-origin-resource-policy']).toBe('same-site');
      expect(context.type).toBe('image/png');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('rejects malformed encoded file paths as client errors', async () => {
    const middleware = staticFilesMiddleware({
      root: './data/uploads',
      urlPrefix: '/uploads',
    });

    await expect(
      runMiddleware(
        middleware,
        createTestContext(undefined, {}, undefined, {
          method: 'GET',
          path: '/uploads/%E0%A4%A',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'FILE_PATH_INVALID',
      status: 400,
    });
  });

  it('rejects paths that resolve outside the configured root', async () => {
    const middleware = staticFilesMiddleware({
      root: './data/uploads',
      urlPrefix: '/uploads',
    });

    await expect(
      runMiddleware(
        middleware,
        createTestContext(undefined, {}, undefined, {
          method: 'GET',
          path: '/uploads/../secret.png',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      status: 404,
    });
  });
});
