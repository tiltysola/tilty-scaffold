import {
  type ApiKeyCreateInput,
  type ApiKeyListResponse,
  type ApiKeyReveal,
  type ApiKeySummary,
} from '@tilty/shared/api-keys';

import { authenticatedApiRequest } from './auth';

export type {
  ApiKeyCreateInput,
  ApiKeyListResponse,
  ApiKeyReveal,
  ApiKeyStatus,
  ApiKeySummary,
} from '@tilty/shared/api-keys';

export function fetchApiKeys() {
  return authenticatedApiRequest<ApiKeyListResponse>('/api/api-keys', {
    method: 'GET',
  });
}

export function createApiKey(input: ApiKeyCreateInput) {
  return authenticatedApiRequest<ApiKeyReveal>('/api/api-keys', {
    body: input,
    method: 'POST',
  });
}

export function disableApiKey(keyId: string) {
  return authenticatedApiRequest<ApiKeySummary>(`/api/api-keys/${keyId}/disable`, {
    method: 'POST',
  });
}

export function enableApiKey(keyId: string) {
  return authenticatedApiRequest<ApiKeySummary>(`/api/api-keys/${keyId}/enable`, {
    method: 'POST',
  });
}

export function revokeApiKey(keyId: string) {
  return authenticatedApiRequest<ApiKeySummary>(`/api/api-keys/${keyId}/revoke`, {
    method: 'POST',
  });
}
