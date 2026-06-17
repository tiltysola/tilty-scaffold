const defaultApiBaseUrl = 'http://localhost:3000';

export const appConfig = {
  apiBaseUrl: getApiBaseUrl(),
} as const;

function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl).replace(/\/+$/, '');
}
