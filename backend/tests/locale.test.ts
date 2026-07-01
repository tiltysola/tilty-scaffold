import { describe, expect, it } from 'vitest';

import { defaultLocale, localeRequestHeader } from '@tilty/shared/i18n';

import { getRequestLocale, localeMiddleware } from '../src/middleware/locale';
import { createTestContext, runMiddlewares } from './support/http';

describe('locale middleware', () => {
  it('prefers the explicit locale request header', async () => {
    const context = await runMiddlewares(
      [
        localeMiddleware(),
        async (ctx) => {
          ctx.body = { locale: getRequestLocale(ctx) };
        },
      ],
      createTestContext(undefined, {
        'accept-language': 'en-US,en;q=0.9',
        [localeRequestHeader]: 'zh-CN',
      }),
    );

    expect(context.body).toEqual({ locale: 'zh-CN' });
  });

  it('falls back to Accept-Language negotiation and then the default locale', async () => {
    const negotiated = await runMiddlewares(
      [
        localeMiddleware(),
        async (ctx) => {
          ctx.body = { locale: getRequestLocale(ctx) };
        },
      ],
      createTestContext(undefined, {
        'accept-language': 'fr-FR,zh-CN;q=0.8,en-US;q=0.7',
      }),
    );
    const fallback = await runMiddlewares(
      [
        localeMiddleware(),
        async (ctx) => {
          ctx.body = { locale: getRequestLocale(ctx) };
        },
      ],
      createTestContext(),
    );

    expect(negotiated.body).toEqual({ locale: 'zh-CN' });
    expect(fallback.body).toEqual({ locale: defaultLocale });
  });
});
