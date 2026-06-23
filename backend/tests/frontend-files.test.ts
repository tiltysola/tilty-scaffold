import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { frontendFilesMiddleware } from '../src/middleware/frontend-files';
import { createTestContext, runMiddleware, runMiddlewares } from './support/http';

describe('frontend files middleware', () => {
  it('serves frontend assets with immutable cache headers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tilty-frontend-files-'));

    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'assets', 'app.js'), 'console.log("ok");', 'utf8');

    try {
      const context = await runMiddleware(
        frontendFilesMiddleware({ root }),
        createTestContext(undefined, {}, undefined, {
          path: '/assets/app.js',
        }),
      );

      expect(context.responseHeaders['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(context.responseHeaders['cross-origin-resource-policy']).toBe('same-origin');
      expect(context.type).toBe('application/javascript; charset=utf-8');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('serves index html for browser navigation routes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tilty-frontend-files-'));

    await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');

    try {
      const context = await runMiddleware(
        frontendFilesMiddleware({ root }),
        createTestContext(
          undefined,
          {
            accept: 'text/html',
          },
          undefined,
          {
            path: '/dashboard',
          },
        ),
      );

      expect(context.responseHeaders['cache-control']).toBe('no-cache');
      expect(context.type).toBe('text/html; charset=utf-8');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('passes API requests through', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tilty-frontend-files-'));

    await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');

    try {
      const context = await runMiddlewares(
        [
          frontendFilesMiddleware({ root }),
          async (ctx) => {
            ctx.status = 204;
          },
        ],
        createTestContext(
          undefined,
          {
            accept: 'text/html',
          },
          undefined,
          {
            path: '/api/health',
          },
        ),
      );

      expect(context.status).toBe(204);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('passes uploaded file requests through', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tilty-frontend-files-'));

    await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');

    try {
      const context = await runMiddlewares(
        [
          frontendFilesMiddleware({ root }),
          async (ctx) => {
            ctx.status = 204;
          },
        ],
        createTestContext(
          undefined,
          {
            accept: 'image/png',
          },
          undefined,
          {
            path: '/uploads/avatars/user.png',
          },
        ),
      );

      expect(context.status).toBe(204);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('passes paths outside the frontend root through', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tilty-frontend-files-'));

    await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8');

    try {
      const context = await runMiddlewares(
        [
          frontendFilesMiddleware({ root }),
          async (ctx) => {
            ctx.status = 204;
          },
        ],
        createTestContext(
          undefined,
          {
            accept: 'text/html',
          },
          undefined,
          {
            path: '/../private',
          },
        ),
      );

      expect(context.status).toBe(204);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
