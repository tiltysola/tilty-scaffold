const defaultApiBaseUrl = 'http://localhost:3000';
const defaultAuthSessionStorageKey = 'tilty-scaffold.auth.session';

export const appConfig = {
  authSessionStorageKey: import.meta.env.VITE_AUTH_SESSION_STORAGE_KEY || defaultAuthSessionStorageKey,
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl),
} as const;

export function normalizeApiBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, '');

  try {
    const url = new URL(normalized);

    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error('Invalid API base URL');
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute http(s) URL without credentials, query, or fragment.');
  }
}
