import { createClient } from 'redis';

import { AppError } from '../core/errors';

type CacheConfig =
  | {
      store: 'memory';
    }
  | {
      store: 'redis';
      timeoutMs: number;
      url: string;
    };

interface CacheIncrementResult {
  count: number;
  expiresInMs: number;
}

export interface CacheStore {
  check(): Promise<void>;
  close(): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  compareAndSet<T>(key: string, expected: T, value: T, ttlMs: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  increment(key: string, windowMs: number): Promise<CacheIncrementResult>;
  acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean>;
  renewLock(key: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLock(key: string, owner: string): Promise<boolean>;
}

interface MemoryCacheRecord {
  expiresAt: number;
  value: string;
}

type RedisClient = ReturnType<typeof createClient>;

const defaultRedisRequestTimeoutMs = 10_000;
const redisCachePrefix = 'tilty-scaffold:cache:';
const redisCompareAndSetScript = [
  "if redis.call('GET', KEYS[1]) ~= ARGV[1] then",
  '  return 0',
  'end',
  "redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])",
  'return 1',
].join('\n');
const redisAcquireLockScript = [
  "local didSet = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])",
  'if didSet then',
  '  return 1',
  'end',
  'return 0',
].join('\n');
const redisRenewLockScript = [
  "if redis.call('GET', KEYS[1]) ~= ARGV[1] then",
  '  return 0',
  'end',
  "redis.call('PEXPIRE', KEYS[1], ARGV[2])",
  'return 1',
].join('\n');
const redisReleaseLockScript = [
  "if redis.call('GET', KEYS[1]) ~= ARGV[1] then",
  '  return 0',
  'end',
  "redis.call('DEL', KEYS[1])",
  'return 1',
].join('\n');
const redisRateLimitScript = [
  "local count = redis.call('INCR', KEYS[1])",
  'if count == 1 then',
  "  redis.call('PEXPIRE', KEYS[1], ARGV[1])",
  'end',
  "local ttl = redis.call('PTTL', KEYS[1])",
  'return { count, ttl }',
].join('\n');

export function createCacheStore(config: CacheConfig): CacheStore {
  if (config.store === 'redis') {
    return new RedisCacheStore(config.url, config.timeoutMs);
  }

  return new MemoryCacheStore();
}

export class MemoryCacheStore implements CacheStore {
  private readonly records = new Map<string, MemoryCacheRecord>();

  async check() {
    return undefined;
  }

  async close() {
    this.records.clear();
  }

  async get<T>(key: string) {
    const record = this.records.get(key);

    if (!record) {
      return undefined;
    }

    if (record.expiresAt <= Date.now()) {
      this.records.delete(key);
      return undefined;
    }

    return JSON.parse(record.value) as T;
  }

  async set<T>(key: string, value: T, ttlMs: number) {
    validateTtl(ttlMs);
    this.records.set(key, {
      expiresAt: Date.now() + ttlMs,
      value: JSON.stringify(value),
    });
  }

  async compareAndSet<T>(key: string, expected: T, value: T, ttlMs: number) {
    validateTtl(ttlMs);

    const record = this.records.get(key);
    const now = Date.now();

    if (!record || record.expiresAt <= now) {
      this.records.delete(key);
      return false;
    }

    if (record.value !== JSON.stringify(expected)) {
      return false;
    }

    this.records.set(key, {
      expiresAt: now + ttlMs,
      value: JSON.stringify(value),
    });

    return true;
  }

  async delete(key: string) {
    this.records.delete(key);
  }

  async increment(key: string, windowMs: number) {
    validateTtl(windowMs);

    const now = Date.now();
    const existing = this.records.get(key);

    if (!existing || existing.expiresAt <= now) {
      this.records.set(key, {
        expiresAt: now + windowMs,
        value: '1',
      });

      return {
        count: 1,
        expiresInMs: windowMs,
      };
    }

    const currentCount = Number(existing.value);
    const count = Number.isSafeInteger(currentCount) && currentCount > 0 ? currentCount + 1 : 1;

    existing.value = String(count);

    return {
      count,
      expiresInMs: Math.max(existing.expiresAt - now, 0),
    };
  }

  async acquireLock(key: string, owner: string, ttlMs: number) {
    validateTtl(ttlMs);

    const record = this.records.get(key);
    const now = Date.now();

    if (record && record.expiresAt > now) {
      return false;
    }

    this.records.set(key, {
      expiresAt: now + ttlMs,
      value: JSON.stringify(owner),
    });

    return true;
  }

  async renewLock(key: string, owner: string, ttlMs: number) {
    validateTtl(ttlMs);

    const record = this.records.get(key);
    const now = Date.now();

    if (!record || record.expiresAt <= now) {
      this.records.delete(key);
      return false;
    }

    if (record.value !== JSON.stringify(owner)) {
      return false;
    }

    record.expiresAt = now + ttlMs;
    return true;
  }

  async releaseLock(key: string, owner: string) {
    const record = this.records.get(key);

    if (!record || record.expiresAt <= Date.now()) {
      this.records.delete(key);
      return false;
    }

    if (record.value !== JSON.stringify(owner)) {
      return false;
    }

    this.records.delete(key);
    return true;
  }
}

export class RedisCacheStore implements CacheStore {
  private readonly client: RedisClient;
  private connectPromise: Promise<RedisClient> | undefined;

  constructor(
    url: string,
    private readonly timeoutMs = defaultRedisRequestTimeoutMs,
  ) {
    validateTtl(timeoutMs);
    validateRedisUrl(url);

    this.client = createClient({
      url,
      commandsQueueMaxLength: 1000,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: timeoutMs,
        reconnectStrategy: false,
        socketTimeout: timeoutMs,
      },
    });
    this.client.on('error', () => undefined);
  }

  async check() {
    await this.command(() => this.client.ping());
  }

  async close() {
    this.connectPromise = undefined;

    if (!this.client.isOpen) {
      return;
    }

    try {
      await this.client.close();
    } catch {
      this.client.destroy();
    }
  }

  async get<T>(key: string) {
    const value = await this.command(() => this.client.get(this.cacheKey(key)));

    if (value === null) {
      return undefined;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      throw new AppError('CACHE_RESPONSE_INVALID', 'Cache backend returned an invalid response.', 502);
    }
  }

  async set<T>(key: string, value: T, ttlMs: number) {
    validateTtl(ttlMs);

    await this.command(() =>
      this.client.set(this.cacheKey(key), JSON.stringify(value), {
        expiration: {
          type: 'PX',
          value: ttlMs,
        },
      }),
    );
  }

  async compareAndSet<T>(key: string, expected: T, value: T, ttlMs: number) {
    validateTtl(ttlMs);

    const result = await this.command(() =>
      this.client.eval(redisCompareAndSetScript, {
        keys: [this.cacheKey(key)],
        arguments: [JSON.stringify(expected), JSON.stringify(value), String(ttlMs)],
      }),
    );

    return parseBooleanResponse(result);
  }

  async delete(key: string) {
    await this.command(() => this.client.del(this.cacheKey(key)));
  }

  async increment(key: string, windowMs: number) {
    validateTtl(windowMs);

    const result = await this.command(() =>
      this.client.eval(redisRateLimitScript, {
        keys: [this.cacheKey(key)],
        arguments: [String(windowMs)],
      }),
    );

    if (!Array.isArray(result)) {
      throw new AppError('CACHE_RESPONSE_INVALID', 'Cache backend returned an invalid response.', 502);
    }

    const [rawCount, rawExpiresInMs] = result;
    const count = Number(rawCount);
    const expiresInMs = Number(rawExpiresInMs);

    if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(expiresInMs)) {
      throw new AppError('CACHE_RESPONSE_INVALID', 'Cache backend returned an invalid response.', 502);
    }

    return {
      count,
      expiresInMs: Math.max(expiresInMs, 0),
    };
  }

  async acquireLock(key: string, owner: string, ttlMs: number) {
    validateTtl(ttlMs);

    const result = await this.command(() =>
      this.client.eval(redisAcquireLockScript, {
        keys: [this.cacheKey(key)],
        arguments: [JSON.stringify(owner), String(ttlMs)],
      }),
    );

    return parseBooleanResponse(result);
  }

  async renewLock(key: string, owner: string, ttlMs: number) {
    validateTtl(ttlMs);

    const result = await this.command(() =>
      this.client.eval(redisRenewLockScript, {
        keys: [this.cacheKey(key)],
        arguments: [JSON.stringify(owner), String(ttlMs)],
      }),
    );

    return parseBooleanResponse(result);
  }

  async releaseLock(key: string, owner: string) {
    const result = await this.command(() =>
      this.client.eval(redisReleaseLockScript, {
        keys: [this.cacheKey(key)],
        arguments: [JSON.stringify(owner)],
      }),
    );

    return parseBooleanResponse(result);
  }

  private cacheKey(key: string) {
    return `${redisCachePrefix}${key}`;
  }

  private async command<T>(operation: () => Promise<T>) {
    try {
      await this.ensureConnected();
      return await withTimeout(operation(), this.timeoutMs);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError('CACHE_UNAVAILABLE', 'Cache backend could not be reached.', 502);
    }
  }

  private async ensureConnected() {
    if (this.client.isOpen) {
      return;
    }

    this.connectPromise ??= this.client.connect();

    try {
      await withTimeout(this.connectPromise, this.timeoutMs);
    } finally {
      this.connectPromise = undefined;
    }
  }
}

function validateRedisUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new AppError('CACHE_REDIS_URL_INVALID', 'Redis cache URL must use redis:// or rediss://.', 500);
  }

  if (!url.pathname || url.pathname === '/') {
    return;
  }

  const database = Number(url.pathname.slice(1));

  if (!Number.isInteger(database) || database < 0) {
    throw new AppError('CACHE_REDIS_URL_INVALID', 'Redis cache URL database must be a non-negative integer.', 500);
  }
}

function parseBooleanResponse(result: unknown) {
  if (result !== 0 && result !== 1) {
    throw new AppError('CACHE_RESPONSE_INVALID', 'Cache backend returned an invalid response.', 502);
  }

  return result === 1;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new AppError('CACHE_TIMEOUT', 'Cache backend request timed out.', 502));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function validateTtl(ttlMs: number) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new AppError('CACHE_TTL_INVALID', 'Cache TTL must be a positive integer.', 500);
  }
}
