import { mkdir, mkdtemp, readFile, rm } from 'fs/promises';
import { join } from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { configureLogger, flushLogger, logger } from '../src/core/logger';

describe('logger', () => {
  afterEach(async () => {
    configureLogger({ targets: ['console'] });
    await flushLogger();
  });

  it('writes local JSON lines when the local target is enabled', async () => {
    const baseDirectory = join(process.cwd(), 'logs');
    await mkdir(baseDirectory, { recursive: true });

    const directory = await mkdtemp(join(baseDirectory, 'test-'));
    const filePath = join(directory, 'backend.log');

    try {
      configureLogger({ localPath: filePath, targets: ['local'] });

      logger.info('local log', { requestId: 'request-123' });
      await flushLogger();

      const content = await readFile(filePath, 'utf8');
      const line = content.trim().split('\n')[0];

      expect(JSON.parse(line)).toMatchObject({
        level: 'info',
        message: 'local log',
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('rejects local log paths outside the application directory', () => {
    expect(() => configureLogger({ localPath: '../backend.log', targets: ['local'] })).toThrow(
      'LOG_LOCAL_PATH must resolve inside the application directory.',
    );
  });
});
