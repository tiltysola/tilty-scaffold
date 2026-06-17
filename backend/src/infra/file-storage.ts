import OSS from 'ali-oss';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, posix } from 'path';

import { AppError } from '../core/errors';
import { resolveApplicationPath } from '../core/files';

type FileStorageConfig =
  | {
      driver: 'local';
      publicBaseUrl: string;
      root: string;
    }
  | {
      accessKeyId: string;
      accessKeySecret: string;
      bucket: string;
      driver: 'oss';
      endpoint: string;
      publicBaseUrl?: string;
      region: string;
    };

export interface SaveFileInput {
  cacheControl?: string;
  content: Buffer;
  contentType: string;
  key: string;
}

interface SavedFile {
  key: string;
  url: string;
}

export interface FileStorage {
  delete(key: string): Promise<void>;
  save(input: SaveFileInput): Promise<SavedFile>;
}

export function createFileStorage(config: FileStorageConfig): FileStorage {
  if (config.driver === 'oss') {
    return new OssFileStorage(config);
  }

  return new LocalFileStorage(config);
}

class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(private readonly config: Extract<FileStorageConfig, { driver: 'local' }>) {
    this.root = resolveApplicationPath(config.root, 'FILE_LOCAL_ROOT');
  }

  async save(input: SaveFileInput) {
    const key = normalizeStorageKey(input.key);
    const filePath = join(this.root, key);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.content, { flag: 'wx' });

    return {
      key,
      url: joinPublicUrl(this.config.publicBaseUrl, key),
    };
  }

  async delete(key: string) {
    const filePath = join(this.root, normalizeStorageKey(key));

    try {
      await unlink(filePath);
    } catch (error) {
      if (!error || typeof error !== 'object' || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

class OssFileStorage implements FileStorage {
  private readonly client: OSS;
  private readonly publicBaseUrl: string;

  constructor(config: Extract<FileStorageConfig, { driver: 'oss' }>) {
    this.client = new OSS({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      endpoint: config.endpoint,
      region: config.region,
      secure: true,
      timeout: 30_000,
    });
    this.publicBaseUrl = config.publicBaseUrl ?? createOssPublicBaseUrl(config);
  }

  async save(input: SaveFileInput) {
    const key = normalizeStorageKey(input.key);

    try {
      await this.client.put(key, input.content, {
        headers: {
          ...(input.cacheControl ? { 'Cache-Control': input.cacheControl } : {}),
        },
        mime: input.contentType,
      });
    } catch {
      throw new AppError('FILE_STORAGE_UPLOAD_FAILED', 'The file could not be uploaded.', 502);
    }

    return {
      key,
      url: joinPublicUrl(this.publicBaseUrl, key),
    };
  }

  async delete(key: string) {
    try {
      await this.client.delete(normalizeStorageKey(key));
    } catch {
      throw new AppError('FILE_STORAGE_DELETE_FAILED', 'The file could not be deleted.', 502);
    }
  }
}

function normalizeStorageKey(key: string) {
  const normalized = posix.normalize(key).replace(/^\/+/, '');

  if (!normalized || normalized.startsWith('../') || normalized === '..') {
    throw new AppError('FILE_STORAGE_KEY_INVALID', 'The file storage key is invalid.', 500);
  }

  return normalized;
}

function joinPublicUrl(baseUrl: string, key: string) {
  return `${baseUrl.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function createOssPublicBaseUrl(config: Extract<FileStorageConfig, { driver: 'oss' }>) {
  const endpoint = config.endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '');

  return `https://${config.bucket}.${endpoint}`;
}
