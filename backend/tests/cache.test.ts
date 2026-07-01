import { describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore, RedisCacheStore } from '../src/infra/cache';

interface MockRedisClient {
  close: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  isOpen: boolean;
  isReady: boolean;
  on: ReturnType<typeof vi.fn>;
  ping: ReturnType<typeof vi.fn>;
  rejectConnect: (error: unknown) => void;
  resolveConnect: () => void;
  set: ReturnType<typeof vi.fn>;
}

const redisMock = vi.hoisted(() => {
  const clients: MockRedisClient[] = [];

  const assertReady = (client: MockRedisClient) => {
    if (!client.isReady) {
      throw new Error('Redis client is not ready.');
    }
  };

  const createClient = vi.fn(() => {
    let rejectConnect: ((error: unknown) => void) | undefined;
    let resolveConnect: (() => void) | undefined;
    const client = {
      isOpen: false,
      isReady: false,
    } as MockRedisClient;

    Object.assign(client, {
      close: vi.fn(async () => {
        client.isOpen = false;
        client.isReady = false;
      }),
      connect: vi.fn(() => {
        client.isOpen = true;

        return new Promise<MockRedisClient>((resolve, reject) => {
          rejectConnect = (error: unknown) => {
            client.isOpen = false;
            client.isReady = false;
            reject(error);
          };
          resolveConnect = () => {
            client.isReady = true;
            resolve(client);
          };
        });
      }),
      del: vi.fn(async () => {
        assertReady(client);
        return 1;
      }),
      destroy: vi.fn(() => {
        client.isOpen = false;
        client.isReady = false;
      }),
      eval: vi.fn(async () => {
        assertReady(client);
        return 1;
      }),
      get: vi.fn(async () => {
        assertReady(client);
        return null;
      }),
      on: vi.fn(() => client),
      ping: vi.fn(async () => {
        assertReady(client);
        return 'PONG';
      }),
      rejectConnect: (error: unknown) => rejectConnect?.(error),
      resolveConnect: () => resolveConnect?.(),
      set: vi.fn(async () => {
        assertReady(client);
        return 'OK';
      }),
    });

    clients.push(client);
    return client;
  });

  return { clients, createClient };
});

vi.mock('redis', () => ({
  createClient: redisMock.createClient,
}));

describe('cache stores', () => {
  it('stores JSON values with a TTL in memory', async () => {
    const cacheStore = new MemoryCacheStore();

    await cacheStore.set('test:value', { ok: true }, 60_000);

    expect(await cacheStore.get('test:value')).toEqual({ ok: true });

    await cacheStore.delete('test:value');

    expect(await cacheStore.get('test:value')).toBeUndefined();
  });

  it('increments fixed-window counters in memory', async () => {
    const cacheStore = new MemoryCacheStore();

    expect(await cacheStore.increment('test:counter', 60_000)).toMatchObject({
      count: 1,
    });
    expect(await cacheStore.increment('test:counter', 60_000)).toMatchObject({
      count: 2,
    });
  });

  it('updates memory records only when the expected value still matches', async () => {
    const cacheStore = new MemoryCacheStore();

    await cacheStore.set('test:cas', { count: 1 }, 60_000);

    await expect(cacheStore.compareAndSet('test:cas', { count: 1 }, { count: 2 }, 60_000)).resolves.toBe(true);
    await expect(cacheStore.get('test:cas')).resolves.toEqual({ count: 2 });
    await expect(cacheStore.compareAndSet('test:cas', { count: 1 }, { count: 3 }, 60_000)).resolves.toBe(false);
    await expect(cacheStore.get('test:cas')).resolves.toEqual({ count: 2 });
  });

  it('coordinates memory locks by owner token', async () => {
    const cacheStore = new MemoryCacheStore();

    await expect(cacheStore.acquireLock('test:lock', 'owner-1', 60_000)).resolves.toBe(true);
    await expect(cacheStore.acquireLock('test:lock', 'owner-2', 60_000)).resolves.toBe(false);
    await expect(cacheStore.renewLock('test:lock', 'owner-2', 60_000)).resolves.toBe(false);
    await expect(cacheStore.releaseLock('test:lock', 'owner-2')).resolves.toBe(false);
    await expect(cacheStore.releaseLock('test:lock', 'owner-1')).resolves.toBe(true);
    await expect(cacheStore.acquireLock('test:lock', 'owner-2', 60_000)).resolves.toBe(true);
  });

  it('rejects invalid Redis cache configuration', () => {
    expect(getThrownError(() => new RedisCacheStore('redis://localhost:6379', 0))).toMatchObject({
      code: 'CACHE_TTL_INVALID',
      status: 500,
    });
    expect(getThrownError(() => new RedisCacheStore('http://localhost:6379', 1000))).toMatchObject({
      code: 'CACHE_REDIS_URL_INVALID',
      status: 500,
    });
    expect(getThrownError(() => new RedisCacheStore('redis://localhost:6379/not-a-number', 1000))).toMatchObject({
      code: 'CACHE_REDIS_URL_INVALID',
      status: 500,
    });
  });

  it('waits for a pending Redis connection before running concurrent commands', async () => {
    redisMock.clients.length = 0;
    const cacheStore = new RedisCacheStore('redis://localhost:6379/0', 1000);
    const commands = Promise.all([
      cacheStore.get('test:redis:1'),
      cacheStore.get('test:redis:2'),
      cacheStore.get('test:redis:3'),
    ]);
    const client = redisMock.clients[0];

    await Promise.resolve();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.get).not.toHaveBeenCalled();

    client.resolveConnect();

    await expect(commands).resolves.toEqual([undefined, undefined, undefined]);
    expect(client.get).toHaveBeenCalledTimes(3);

    await cacheStore.close();
  });
});

function getThrownError(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return error;
  }

  throw new Error('Expected action to throw.');
}
