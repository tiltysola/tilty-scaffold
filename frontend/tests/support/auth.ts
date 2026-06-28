import { vi } from 'vitest';

import { type AuthSession, authStore } from '../../src/lib/auth';
import { createApiSuccessResponse } from './api';

export const authSessionStorageKey = 'tilty-scaffold.auth.session';

export function clearAuthSession() {
  authStore.clear();
}

export function getCurrentAuthSession() {
  return authStore.getSnapshot().session;
}

export async function seedAuthSession(session: AuthSession) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      return createApiSuccessResponse(session);
    }),
  );

  await authStore.refresh();
}

export function createSession(expiresAt: string): AuthSession {
  return {
    accessTokenExpiresAt: expiresAt,
    refreshTokenExpiresAt: expiresAt,
    user: {
      username: 'test_user',
      displayName: 'Test User',
      email: 'user@example.com',
      emailVerified: false,
      phoneVerified: false,
      totpEnabled: false,
      mfaAllowedMethods: [],
      mfaRequiredForSso: true,
      roles: [],
      permissions: [],
    },
  };
}

export function createTestWindow() {
  const values = new Map<string, string>();

  return {
    localStorage: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
      get length() {
        return values.size;
      },
    },
  } as unknown as Window;
}

export function createStorageBlockedTestWindow() {
  return Object.defineProperty({}, 'localStorage', {
    get() {
      throw new Error('Storage is unavailable.');
    },
  }) as Window;
}

export function createStorageWriteBlockedTestWindow() {
  const values = new Map<string, string>();

  return {
    localStorage: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: () => {
        throw new Error('Storage writes are unavailable.');
      },
      get length() {
        return values.size;
      },
    },
  } as unknown as Window;
}
