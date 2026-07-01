import { type Context, type Middleware } from 'koa';

import { defaultLocale, localeRequestHeader, negotiateLocaleHeader, normalizeLocale } from '@tilty/shared/i18n';

export function localeMiddleware(): Middleware {
  return async (ctx, next) => {
    ctx.state.locale = resolveRequestLocale(ctx);

    await next();
  };
}

export function getRequestLocale(ctx: Context) {
  return typeof ctx.state.locale === 'string' ? (normalizeLocale(ctx.state.locale) ?? defaultLocale) : defaultLocale;
}

function resolveRequestLocale(ctx: Context) {
  return normalizeLocale(ctx.get(localeRequestHeader)) ?? negotiateLocaleHeader(ctx.get('accept-language'));
}
