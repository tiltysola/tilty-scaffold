import { describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '../src/infra/cache';
import { type AliyunSmsProfileConfig, AliyunSmsSenderPool, SmsVerificationService } from '../src/modules/auth/auth.sms';

const openApiMock = vi.hoisted(() => ({
  doRPCRequest: vi.fn(),
}));

vi.mock('@alicloud/openapi-core', () => ({
  default: class OpenApiClient {
    doRPCRequest = openApiMock.doRPCRequest;
  },
  $OpenApiUtil: {
    Config: class Config {
      constructor(input: Record<string, unknown>) {
        Object.assign(this, input);
      }
    },
    OpenApiRequest: class OpenApiRequest {
      constructor(input: Record<string, unknown>) {
        Object.assign(this, input);
      }
    },
  },
}));

describe('SMS verification service', () => {
  it('sends verification codes through the matching Aliyun SMS profile', async () => {
    openApiMock.doRPCRequest.mockResolvedValue(undefined);
    const profile: AliyunSmsProfileConfig = {
      phoneCountryCode: '+86',
      apiVersion: '2017-05-25',
      operation: 'SendSms',
      regionId: 'cn-hangzhou',
      endpoint: 'dysmsapi.aliyuncs.com',
      accessKeyId: 'test-access-key-id',
      accessKeySecret: 'test-access-key-secret',
      signName: 'Tilty',
      templateCode: 'SMS_100000001',
    };
    const sender = new AliyunSmsSenderPool([profile]);
    const service = new SmsVerificationService({
      cacheStore: new MemoryCacheStore(),
      codeCooldownMs: 60_000,
      codeExpiresInMs: 10 * 60_000,
      phoneCountryCodes: sender.getPhoneCountryCodes(),
      sender,
      verificationSecret: 'test-auth-token-secret-minimum-32-characters',
    });

    await service.sendProfilePhoneVerificationCode('+8613800138000');

    expect(openApiMock.doRPCRequest).toHaveBeenCalledWith(
      'SendSms',
      '2017-05-25',
      'https',
      'POST',
      'AK',
      'json',
      expect.objectContaining({
        query: expect.objectContaining({
          PhoneNumbers: '13800138000',
          SignName: 'Tilty',
          TemplateCode: 'SMS_100000001',
        }),
      }),
      expect.objectContaining({
        connectTimeout: 10_000,
        readTimeout: 10_000,
      }),
    );
    const request = openApiMock.doRPCRequest.mock.calls[0]?.[6] as { query?: { TemplateParam?: string } };
    const templateParam = JSON.parse(request.query?.TemplateParam ?? '{}') as { code?: string };

    expect(templateParam.code).toMatch(/^\d{6}$/);
  });
});
