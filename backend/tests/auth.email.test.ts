import { describe, expect, it } from 'vitest';

import { MemoryCacheStore } from '../src/infra/cache';
import {
  type EmailSender,
  EmailVerificationService,
  type SmtpEmailSenderConfig,
  SmtpEmailSenderPool,
} from '../src/modules/auth/auth.email';

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

  it('sends through the selected SMTP profile for each delivery', async () => {
    const configs: SmtpEmailSenderConfig[] = [
      {
        from: 'Tilty <primary@example.com>',
        host: 'smtp-primary.example.com',
        port: 465,
        secure: true,
        startTls: false,
        timeoutMs: 5_000,
      },
      {
        from: 'Tilty <secondary@example.com>',
        host: 'smtp-secondary.example.com',
        port: 587,
        secure: false,
        startTls: true,
        timeoutMs: 5_000,
      },
    ];
    const selectedHosts: string[] = [];
    const selectedIndexes = [1, 0];
    const sender = new SmtpEmailSenderPool(configs, {
      createSender: (config) => ({
        send: async () => {
          selectedHosts.push(config.host);
        },
      }),
      selectProfileIndex: () => selectedIndexes.shift() ?? 0,
    });

    await sender.send({ subject: 'Test', text: 'First', to: 'first@example.com' });
    await sender.send({ subject: 'Test', text: 'Second', to: 'second@example.com' });

    expect(selectedHosts).toEqual(['smtp-secondary.example.com', 'smtp-primary.example.com']);
  });

  it('formats verification emails with the requested locale', async () => {
    let sentSubject = '';
    let sentText = '';
    const cacheStore = new MemoryCacheStore();
    const sender: EmailSender = {
      send: async (input) => {
        sentSubject = input.subject;
        sentText = input.text;
      },
    };
    const service = new EmailVerificationService({
      cacheStore,
      codeCooldownMs: 60_000,
      codeExpiresInMs: 10 * 60_000,
      sender,
      verificationSecret: 'test-auth-token-secret-minimum-32-characters',
    });

    await service.sendRegistrationCode('localized@example.com', 'zh-CN');

    expect(sentSubject).toBe('注册验证码');
    expect(sentText).toContain('注册验证码为');
    expect(sentText).toContain('验证码将在 10 分钟 后过期。');

    await service.sendProfileEmailVerificationCode('profile-localized@example.com', 'zh-CN');

    expect(sentSubject).toBe('个人邮箱验证码');
    expect(sentText).toContain('个人邮箱验证码为');

    await service.sendMfaCode('mfa-localized@example.com', 'zh-CN');

    expect(sentSubject).toBe('安全验证码');
    expect(sentText).toContain('安全验证码为');
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
