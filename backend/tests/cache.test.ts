import { describe, expect, it } from 'vitest';

import { MemoryCacheStore, RedisCacheStore } from '../src/infra/cache';

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
    expect(() => new RedisCacheStore('redis://localhost:6379', 0)).toThrow('Cache TTL must be a positive integer.');
    expect(() => new RedisCacheStore('http://localhost:6379', 1000)).toThrow(
      'Redis cache URL must use redis:// or rediss://.',
    );
    expect(() => new RedisCacheStore('redis://localhost:6379/not-a-number', 1000)).toThrow(
      'Redis cache URL database must be a non-negative integer.',
    );
  });
});
