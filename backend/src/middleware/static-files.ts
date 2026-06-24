import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { type Middleware } from 'koa';
import { contentType, lookup } from 'mime-types';
import { resolve } from 'path';

import { AppError } from '../core/errors';
import { isPathInside, resolveApplicationPath } from '../core/files';

export interface StaticFilesConfig {
  root: string;
  urlPrefix: string;
}

export function staticFilesMiddleware(config: StaticFilesConfig): Middleware {
  const root = resolveApplicationPath(config.root, 'FILE_LOCAL_ROOT');
  const urlPrefix = normalizeUrlPrefix(config.urlPrefix);

  return async (ctx, next) => {
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      await next();
      return;
    }

    if (!ctx.path.startsWith(`${urlPrefix}/`)) {
      await next();
      return;
    }

    const relativePath = decodePathSegment(ctx.path.slice(urlPrefix.length + 1));
    const filePath = resolve(root, relativePath);

    if (!isPathInside(root, filePath)) {
      throw new AppError('FILE_NOT_FOUND', 'The file was not found.', 404);
    }

    let fileStat;

    try {
      fileStat = await stat(filePath);
    } catch {
      throw new AppError('FILE_NOT_FOUND', 'The file was not found.', 404);
    }

    if (!fileStat.isFile()) {
      throw new AppError('FILE_NOT_FOUND', 'The file was not found.', 404);
    }

    ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
    ctx.set('Cross-Origin-Resource-Policy', 'same-site');
    ctx.length = fileStat.size;
    const mimeType = lookup(filePath) || 'application/octet-stream';
    ctx.type = contentType(mimeType) || mimeType;
    ctx.body = ctx.method === 'HEAD' ? undefined : createReadStream(filePath);
  };
}

function decodePathSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new AppError('FILE_PATH_INVALID', 'The file path is invalid.', 400);
  }
}

function normalizeUrlPrefix(value: string) {
  const prefix = value.replace(/\/+$/, '') || '/';

  if (!prefix.startsWith('/')) {
    throw new Error('FILE_LOCAL_URL_PREFIX must start with /.');
  }

  return prefix;
}
