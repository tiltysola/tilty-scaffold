import { type Middleware } from 'koa';

import { hasEnvFile } from '../config/env';
import { fail } from '../core/http';

interface SetupRedirectOptions {
  allowedOrigins: string[];
  isSetupLocked?: () => boolean;
  mode: 'locked' | 'setup';
}

const setupPagePath = '/setup';
const loginPagePath = '/login';
const setupApiPathPrefix = '/api/setup';
const setupRequiredStatus = 503;
const setupRestartRequiredStatus = 503;

export function setupRedirectMiddleware(options: SetupRedirectOptions): Middleware {
  return async (ctx, next) => {
    if (ctx.method.toUpperCase() === 'OPTIONS') {
      await next();
      return;
    }

    if (isSetupLocked(options)) {
      if ((ctx.method === 'GET' || ctx.method === 'HEAD') && ctx.path === setupPagePath) {
        sendRedirect(ctx, buildFrontendRedirectUrl(ctx, loginPagePath, options.allowedOrigins));
        return;
      }

      if (options.mode === 'setup' && isApiRequest(ctx.path) && !isSetupRoutePath(ctx.path)) {
        sendSetupRestartRequired(ctx);
        return;
      }

      await next();
      return;
    }

    if (options.mode === 'setup') {
      if (isSetupRoutePath(ctx.path)) {
        await next();
        return;
      }

      if (isApiRequest(ctx.path)) {
        sendSetupRequired(ctx);
        return;
      }

      if (isHtmlNavigationRequest(ctx)) {
        sendRedirect(ctx, buildFrontendRedirectUrl(ctx, setupPagePath, options.allowedOrigins));
        return;
      }

      await next();
      return;
    }

    await next();
  };
}

function isSetupLocked(options: SetupRedirectOptions) {
  return options.mode === 'locked' || (options.isSetupLocked ?? hasEnvFile)();
}

function isApiRequest(path: string) {
  return path.startsWith('/api/');
}

function isHtmlNavigationRequest(ctx: Parameters<Middleware>[0]) {
  const method = ctx.method.toUpperCase();
  const accept = ctx.get('accept').toLowerCase();

  return (
    (method === 'GET' || method === 'HEAD') &&
    (accept.includes('text/html') || accept.includes('application/xhtml+xml'))
  );
}

function isSetupRoutePath(path: string) {
  return path === setupPagePath || path === setupApiPathPrefix || path.startsWith(`${setupApiPathPrefix}/`);
}

function sendRedirect(ctx: Parameters<Middleware>[0], url: string) {
  ctx.status = 302;
  ctx.redirect(url);
}

function sendSetupRequired(ctx: Parameters<Middleware>[0]) {
  ctx.status = setupRequiredStatus;
  ctx.body = fail(setupRequiredStatus, 'SETUP_REQUIRED', 'Setup is required before this API can be used.');
}

function sendSetupRestartRequired(ctx: Parameters<Middleware>[0]) {
  ctx.status = setupRestartRequiredStatus;
  ctx.body = fail(
    setupRestartRequiredStatus,
    'SETUP_RESTART_REQUIRED',
    'Setup is complete. Restart the backend service before using this API.',
  );
}

function buildFrontendRedirectUrl(ctx: Parameters<Middleware>[0], path: string, allowedOrigins: string[]) {
  const origin =
    resolveAllowedFrontendOrigin(ctx.get('origin'), allowedOrigins) ??
    resolveFrontendOriginFromReferer(ctx, allowedOrigins);

  return origin ? `${origin}${path}` : path;
}

function resolveAllowedFrontendOrigin(requestOrigin: string, allowedOrigins: string[]) {
  const normalizedRequestOrigin = normalizeHttpOrigin(requestOrigin);

  if (normalizedRequestOrigin) {
    const hasAllowedRequestOrigin = allowedOrigins.some(
      (origin) => origin === '*' || normalizeHttpOrigin(origin) === normalizedRequestOrigin,
    );

    if (hasAllowedRequestOrigin) {
      return normalizedRequestOrigin;
    }
  }

  return allowedOrigins.map((origin) => normalizeHttpOrigin(origin)).find((origin) => origin !== undefined);
}

function resolveFrontendOriginFromReferer(ctx: Parameters<Middleware>[0], allowedOrigins: string[]) {
  const referer = ctx.get('referer');

  if (!referer) {
    return undefined;
  }

  try {
    return resolveAllowedFrontendOrigin(new URL(referer).origin, allowedOrigins);
  } catch {
    return undefined;
  }
}

function normalizeHttpOrigin(value: string) {
  try {
    const url = new URL(value);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
}
