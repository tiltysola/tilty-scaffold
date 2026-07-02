import { mkdir, unlink, writeFile } from 'fs/promises';
import { dirname, join, posix } from 'path';

import { AppError } from '../core/errors';
import { resolveRuntimePath } from '../core/files';

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

interface OssClient {
  delete(key: string): Promise<unknown>;
  put(
    key: string,
    content: Buffer,
    options: {
      headers?: Record<string, string>;
      mime: string;
    },
  ): Promise<unknown>;
}

interface OssClientConstructor {
  new (config: {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint: string;
    region: string;
    secure: boolean;
    timeout: number;
  }): OssClient;
}

export interface FileStorage {
  delete(key: string): Promise<void>;
  save(input: SaveFileInput): Promise<SavedFile>;
}

class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(private readonly config: Extract<FileStorageConfig, { driver: 'local' }>) {
    this.root = resolveRuntimePath(config.root, 'FILE_LOCAL_ROOT');
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
  private client: OssClient | undefined;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: Extract<FileStorageConfig, { driver: 'oss' }>) {
    this.publicBaseUrl = config.publicBaseUrl ?? createOssPublicBaseUrl(config);
  }

  async save(input: SaveFileInput) {
    const client = await this.getClient();
    const key = normalizeStorageKey(input.key);

    try {
      await client.put(key, input.content, {
        headers: {
          ...(input.cacheControl ? { 'Cache-Control': input.cacheControl } : {}),
        },
        mime: input.contentType,
      });
    } catch {
      throw new AppError('FILE_STORAGE_UPLOAD_FAILED', 'error.FILE_STORAGE_UPLOAD_FAILED', 502);
    }

    return {
      key,
      url: joinPublicUrl(this.publicBaseUrl, key),
    };
  }

  async delete(key: string) {
    const client = await this.getClient();

    try {
      await client.delete(normalizeStorageKey(key));
    } catch {
      throw new AppError('FILE_STORAGE_DELETE_FAILED', 'error.FILE_STORAGE_DELETE_FAILED', 502);
    }
  }

  private async getClient() {
    if (!this.client) {
      const { default: OSS } = (await import('ali-oss')) as { default: OssClientConstructor };
      const config = this.config;

      this.client = new OSS({
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        bucket: config.bucket,
        endpoint: config.endpoint,
        region: config.region,
        secure: true,
        timeout: 30_000,
      });
    }

    return this.client;
  }
}

export function createFileStorage(config: FileStorageConfig): FileStorage {
  if (config.driver === 'oss') {
    return new OssFileStorage(config);
  }

  return new LocalFileStorage(config);
}

function normalizeStorageKey(key: string) {
  const normalized = posix.normalize(key).replace(/^\/+/, '');

  if (!normalized || normalized.startsWith('../') || normalized === '..') {
    throw new AppError('FILE_STORAGE_KEY_INVALID', 'error.FILE_STORAGE_KEY_INVALID', 500);
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
