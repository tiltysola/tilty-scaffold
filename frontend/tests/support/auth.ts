import { type AuthSession } from '../../src/lib/auth';

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
