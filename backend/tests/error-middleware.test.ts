import { describe, expect, it } from 'vitest';

import { localeRequestHeader } from '@tilty/shared/i18n';

import { AppError } from '../src/core/errors';
import { errorMiddleware } from '../src/middleware/error';
import { localeMiddleware } from '../src/middleware/locale';
import { createTestContext, runMiddlewares } from './support/http';

describe('error middleware i18n', () => {
  it('localizes AppError response messages from the request locale', async () => {
    const context = await runMiddlewares(
      [
        errorMiddleware(),
        localeMiddleware(),
        async () => {
          throw new AppError('AUTH_REQUIRED', 'error.AUTH_REQUIRED', 401);
        },
      ],
      createTestContext(undefined, {
        [localeRequestHeader]: 'zh-CN',
      }),
    );

    expect(context.status).toBe(401);
    expect(context.body).toMatchObject({
      code: 401,
      error: 'AUTH_REQUIRED',
      message: '需要登录后继续。',
    });
  });

  it('localizes strong-verifier access errors from the request locale', async () => {
    const context = await runMiddlewares(
      [
        errorMiddleware(),
        localeMiddleware(),
        async () => {
          throw new AppError(
            'SYSTEM_SETTINGS_STRONG_VERIFICATION_REQUIRED',
            'error.SYSTEM_SETTINGS_STRONG_VERIFICATION_REQUIRED',
            403,
          );
        },
      ],
      createTestContext(undefined, {
        [localeRequestHeader]: 'zh-CN',
      }),
    );

    expect(context.status).toBe(403);
    expect(context.body).toMatchObject({
      code: 403,
      error: 'SYSTEM_SETTINGS_STRONG_VERIFICATION_REQUIRED',
      message: '访问系统设置前需要配置通行密钥或认证器应用。',
    });
  });

  it('localizes not-found response messages from the request locale', async () => {
    const context = await runMiddlewares(
      [
        errorMiddleware(),
        localeMiddleware(),
        async (ctx) => {
          ctx.status = 404;
        },
      ],
      createTestContext(undefined, {
        [localeRequestHeader]: 'zh-CN',
      }),
    );

    expect(context.status).toBe(404);
    expect(context.body).toMatchObject({
      code: 404,
      error: 'PAGE_NOT_FOUND',
      message: '请求的页面不存在。',
    });
  });
});
