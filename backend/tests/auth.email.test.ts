import { describe, expect, it } from 'vitest';

import { MemoryCacheStore } from '../src/infra/cache';
import { type EmailSender, EmailVerificationService } from '../src/modules/auth/auth.email';

describe('email verification service', () => {
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

  it('serializes concurrent email verification sends for the same email', async () => {
    let sentCount = 0;
    const cacheStore = new MemoryCacheStore();
    const sender: EmailSender = {
      send: async () => {
        sentCount += 1;
      },
    };
    const service = new EmailVerificationService({
      cacheStore,
      codeCooldownMs: 60_000,
      codeExpiresInMs: 10 * 60_000,
      sender,
      verificationSecret: 'test-auth-token-secret-minimum-32-characters',
    });
    const results = await Promise.allSettled([
      service.sendRegistrationCode('concurrent@example.com'),
      service.sendRegistrationCode('concurrent@example.com'),
      service.sendRegistrationCode('concurrent@example.com'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(2);
    expect(sentCount).toBe(1);
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
