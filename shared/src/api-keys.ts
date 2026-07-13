export const apiKeyStatusValues = ['active', 'disabled', 'revoked', 'expired'] as const;
export const apiKeyPrefix = 'ak';
export const apiKeyIdLength = 26;
export const apiKeySecretLength = 43;
export const apiKeyChecksumLength = 4;
export const apiKeyTokenPatternSource = '[A-Za-z0-9]';
export const apiKeyChecksumPatternSource = `[a-f0-9]{${apiKeyChecksumLength}}`;
export const apiKeyIdPatternSource = `${apiKeyTokenPatternSource}{${apiKeyIdLength}}`;
export const apiKeySecretPatternSource = `${apiKeyTokenPatternSource}{${apiKeySecretLength}}`;
export const apiKeyPlainKeyPatternSource = `^${apiKeyPrefix}_${apiKeyIdPatternSource}_${apiKeySecretPatternSource}_${apiKeyChecksumPatternSource}$`;

export type ApiKeyStatus = (typeof apiKeyStatusValues)[number];

export interface ApiKeySummary {
  id: string;
  userId: string;
  name: string;
  description?: string;
  keyPrefix: string;
  keySuffix: string;
  fingerprint: string;
  status: ApiKeyStatus;
  expiresAt?: string;
  lastUsedAt?: string;
  lastUsedIp?: string;
  requestCount: number;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}

export interface ApiKeyReveal extends ApiKeySummary {
  plainKey: string;
}

export interface ApiKeyListResponse {
  keys: ApiKeySummary[];
  limit: number;
}

export interface ApiKeyCreateInput {
  name: string;
  description?: string | undefined;
  expiresAt?: string | undefined;
}

export const apiKeyActiveLimitPerUser = 10;
