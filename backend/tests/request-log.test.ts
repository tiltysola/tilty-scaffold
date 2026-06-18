import { describe, expect, it, vi } from 'vitest';

import { requestLogMiddleware } from '../src/middleware/request-log';
import { createTestContext, runMiddleware } from './support/http';

describe('request log middleware', () => {
  it('logs requests when enabled', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      const context = createTestContext(undefined, {}, undefined, {
        method: 'GET',
        path: '/api/health',
      });
      context.status = 200;
      context.state.requestId = 'request-123';

      await runMiddleware(requestLogMiddleware(true), context);

      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('INFO'),
        expect.stringContaining('GET /api/health 200'),
      );
    } finally {
      info.mockRestore();
    }
  });
});
