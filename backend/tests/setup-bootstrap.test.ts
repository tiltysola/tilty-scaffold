import { describe, expect, it } from 'vitest';

import { loadSetupRuntimeEnv } from '../src/setup-bootstrap';

describe('setup bootstrap runtime configuration', () => {
  it('binds setup mode to loopback by default', () => {
    const originalServerHost = process.env.SERVER_HOST;

    delete process.env.SERVER_HOST;

    try {
      expect(loadSetupRuntimeEnv().SERVER_HOST).toBe('127.0.0.1');
    } finally {
      if (originalServerHost === undefined) {
        delete process.env.SERVER_HOST;
      } else {
        process.env.SERVER_HOST = originalServerHost;
      }
    }
  });
});
