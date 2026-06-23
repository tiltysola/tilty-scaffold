import { type Middleware } from 'koa';

import { isSetupLocked as isSetupLockedByEnv } from '../config/env';
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
  return options.mode === 'locked' || (options.isSetupLocked ?? isSetupLockedByEnv)();
}

function isApiRequest(requestPath: string) {
  return requestPath === '/api' || requestPath.startsWith('/api/');
}

function isHtmlNavigationRequest(ctx: Parameters<Middleware>[0]) {
  const method = ctx.method.toUpperCase();
  const accept = ctx.get('accept').toLowerCase();

  return (
    (method === 'GET' || method === 'HEAD') &&
    (accept.includes('text/html') || accept.includes('application/xhtml+xml'))
  );
}

function isSetupRoutePath(requestPath: string) {
  return (
    requestPath === setupPagePath ||
    requestPath === setupApiPathPrefix ||
    requestPath.startsWith(`${setupApiPathPrefix}/`)
  );
}

function sendRedirect(ctx: Parameters<Middleware>[0], redirectUrl: string) {
  ctx.status = 302;
  ctx.redirect(redirectUrl);
}

function sendSetupRequired(ctx: Parameters<Middleware>[0]) {
  ctx.status = setupRequiredStatus;
  ctx.body = fail(setupRequiredStatus, 'SETUP_REQUIRED', 'Setup is required before the application can be used.');
}

function sendSetupRestartRequired(ctx: Parameters<Middleware>[0]) {
  ctx.status = setupRestartRequiredStatus;
  ctx.body = fail(
    setupRestartRequiredStatus,
    'SETUP_RESTART_REQUIRED',
    'Setup is complete. Restart the backend service before using the application.',
  );
}

function buildFrontendRedirectUrl(ctx: Parameters<Middleware>[0], redirectPath: string, allowedOrigins: string[]) {
  const frontendOrigin =
    resolveAllowedFrontendOrigin(ctx.get('origin'), allowedOrigins) ??
    resolveFrontendOriginFromReferer(ctx, allowedOrigins);

  return frontendOrigin ? `${frontendOrigin}${redirectPath}` : redirectPath;
}

function resolveAllowedFrontendOrigin(requestOrigin: string, allowedOrigins: string[]) {
  const normalizedFrontendOrigin = normalizeHttpOrigin(requestOrigin);

  if (!normalizedFrontendOrigin) {
    return undefined;
  }

  const isFrontendOriginAllowed = allowedOrigins.some(
    (allowedOrigin) => allowedOrigin === '*' || normalizeHttpOrigin(allowedOrigin) === normalizedFrontendOrigin,
  );

  return isFrontendOriginAllowed ? normalizedFrontendOrigin : undefined;
}

function resolveFrontendOriginFromReferer(ctx: Parameters<Middleware>[0], allowedOrigins: string[]) {
  const refererHeader = ctx.get('referer');

  if (!refererHeader) {
    return undefined;
  }

  try {
    return resolveAllowedFrontendOrigin(new URL(refererHeader).origin, allowedOrigins);
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
