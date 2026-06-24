import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { type Middleware } from 'koa';
import { contentType, lookup } from 'mime-types';
import { extname, resolve } from 'path';

import { isPathInside } from '../core/files';

export interface FrontendFilesConfig {
  root: string;
}

const apiRoutePrefix = '/api';
const uploadedFileRoutePrefix = '/uploads';
export function frontendFilesMiddleware(config: FrontendFilesConfig): Middleware {
  const frontendRootDirectory = resolve(config.root);
  const frontendIndexFilePath = resolve(frontendRootDirectory, 'index.html');

  return async (ctx, next) => {
    const requestMethod = ctx.method.toUpperCase();

    if ((requestMethod !== 'GET' && requestMethod !== 'HEAD') || isBackendRequest(ctx.path)) {
      await next();
      return;
    }

    const requestedFilePath = resolve(frontendRootDirectory, ctx.path.replace(/^\/+/, '') || 'index.html');

    if (!isPathInside(frontendRootDirectory, requestedFilePath)) {
      await next();
      return;
    }

    if (await serveFile(ctx, requestedFilePath)) {
      return;
    }

    if (!isHtmlNavigationRequest(ctx) || !(await serveFile(ctx, frontendIndexFilePath))) {
      await next();
    }
  };
}

async function serveFile(ctx: Parameters<Middleware>[0], filePath: string) {
  const fileMetadata = await stat(filePath).catch(() => null);

  if (!fileMetadata?.isFile()) {
    return false;
  }

  const fileExtension = extname(filePath).slice(1).toLowerCase();

  ctx.set('Cache-Control', fileExtension === 'html' ? 'no-cache' : 'public, max-age=31536000, immutable');
  ctx.set('Cross-Origin-Resource-Policy', 'same-origin');
  ctx.length = fileMetadata.size;
  const mimeType = lookup(filePath) || 'application/octet-stream';
  ctx.type = contentType(mimeType) || mimeType;
  ctx.body = ctx.method.toUpperCase() === 'HEAD' ? undefined : createReadStream(filePath);

  return true;
}

function isHtmlNavigationRequest(ctx: Parameters<Middleware>[0]) {
  const acceptHeader = ctx.get('accept').toLowerCase();

  return acceptHeader.includes('text/html') || acceptHeader.includes('application/xhtml+xml');
}

function isBackendRequest(requestPath: string) {
  return isPathPrefixedBy(requestPath, apiRoutePrefix) || isPathPrefixedBy(requestPath, uploadedFileRoutePrefix);
}

function isPathPrefixedBy(requestPath: string, routePrefix: string) {
  return requestPath === routePrefix || requestPath.startsWith(`${routePrefix}/`);
}
