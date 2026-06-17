import { describe, expect, it } from 'vitest';

import { MemoryCacheStore, RedisCacheStore } from '../src/infra/cache';
import { EmailSender, EmailVerificationService } from '../src/modules/auth/auth.email';

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

  it('shares email verification records through the configured cache store', async () => {
    let sentCode = '';
    const cacheStore = new MemoryCacheStore();
    const sender: EmailSender = {
      send: async (input) => {
        sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
      },
    };
    const config = {
      cacheStore,
      codeCooldownMs: 60_000,
      codeExpiresInMs: 10 * 60_000,
      sender,
      verificationSecret: 'test-auth-token-secret-minimum-32-characters',
    };
    const senderService = new EmailVerificationService(config);
    const verifierService = new EmailVerificationService(config);

    await senderService.sendRegistrationCode('shared@example.com');
    await expect(verifierService.verifyRegistrationCode('shared@example.com', sentCode)).resolves.toBeUndefined();
    await expect(verifierService.verifyRegistrationCode('shared@example.com', sentCode)).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_INVALID',
    });
  });

  it('retries email verification attempt updates when the cache record changes concurrently', async () => {
    let sentCode = '';
    const cacheStore = new ConflictingCompareAndSetCacheStore();
    const sender: EmailSender = {
      send: async (input) => {
        sentCode = /code is (\d{6})/.exec(input.text)?.[1] ?? '';
      },
    };
    const service = new EmailVerificationService({
      cacheStore,
      codeCooldownMs: 60_000,
      codeExpiresInMs: 10 * 60_000,
      sender,
      verificationSecret: 'test-auth-token-secret-minimum-32-characters',
    });

    await service.sendRegistrationCode('cas@example.com');

    await expect(
      service.verifyRegistrationCode('cas@example.com', sentCode === '000000' ? '000001' : '000000'),
    ).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_INVALID',
    });

    await expect(cacheStore.get('email-verification:registration:cas@example.com')).resolves.toMatchObject({
      attemptsRemaining: 4,
    });
    expect(cacheStore.compareAndSetCalls).toBe(2);
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

class ConflictingCompareAndSetCacheStore extends MemoryCacheStore {
  compareAndSetCalls = 0;

  override async compareAndSet<T>(key: string, expected: T, value: T, ttlMs: number) {
    this.compareAndSetCalls += 1;

    if (this.compareAndSetCalls === 1) {
      return false;
    }

    return await super.compareAndSet(key, expected, value, ttlMs);
  }
}
