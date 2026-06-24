import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { closeServer, listen } from '../src/core/server';

describe('createApp', () => {
  it('returns CORS headers on setup-required API responses in setup mode', async () => {
    const originalCwd = process.cwd();
    const tempDir = await mkdtemp(join(tmpdir(), 'tilty-app-'));
    const app = createApp([], {
      corsOrigins: ['http://localhost:8011'],
      requestLogEnabled: false,
      setupRedirect: {
        mode: 'setup',
      },
      trustProxy: false,
    });
    const server = createServer(app.callback());
    let listening = false;

    process.chdir(tempDir);

    try {
      const port = await listenOnRandomPort(server);
      listening = true;

      const response = await fetch(`http://127.0.0.1:${port}/api/auth/sso/config`, {
        headers: {
          origin: 'http://localhost:8011',
        },
      });

      expect(response.status).toBe(503);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8011');
      expect(await response.json()).toMatchObject({
        code: 503,
        error: 'SETUP_REQUIRED',
      });
    } finally {
      process.chdir(originalCwd);

      if (listening) {
        await closeServer(server);
      }

      await rm(tempDir, {
        force: true,
        recursive: true,
      });
    }
  });
});

async function listenOnRandomPort(server: Server) {
  await listen(server, 0, '127.0.0.1');

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Test server address is unavailable.');
  }

  return address.port;
}
