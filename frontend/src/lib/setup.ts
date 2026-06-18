import { apiRequest } from './api';

export type SetupEnvironment = Record<string, string>;

export interface SetupAdministrator {
  confirmPassword: string;
  email: string;
  password: string;
  username: string;
}

export interface SetupCompleteInput {
  administrator?: SetupAdministrator;
  environment: SetupEnvironment;
}

export async function fetchSetupDefaults() {
  return apiRequest<{ environment: SetupEnvironment }>('/api/setup/defaults');
}

export async function validateSetup(input: SetupCompleteInput) {
  return apiRequest<{ valid: true }>('/api/setup/validate', {
    body: input,
    method: 'POST',
  });
}

export async function validateSetupEnvironment(environment: SetupEnvironment) {
  return apiRequest<{ valid: true }>('/api/setup/validate/environment', {
    body: { environment },
    method: 'POST',
  });
}

export async function testDatabaseConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; hasExistingUsers: boolean }>('/api/setup/test/database', {
    body: { environment },
    method: 'POST',
  });
}

export async function testCacheConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; store: 'memory' | 'redis' }>('/api/setup/test/cache', {
    body: { environment },
    method: 'POST',
  });
}

export async function testFileStorageConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; driver: 'local' | 'oss' }>('/api/setup/test/file-storage', {
    body: { environment },
    method: 'POST',
  });
}

export async function testLoggingConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; target: 'console' | 'local' | 'sls' }>('/api/setup/test/logging', {
    body: { environment },
    method: 'POST',
  });
}

export async function testEmailConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; service: 'off' | 'smtp' }>('/api/setup/test/email', {
    body: { environment },
    method: 'POST',
  });
}

export async function testSsoConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; enabled: boolean }>('/api/setup/test/sso', {
    body: { environment },
    method: 'POST',
  });
}

export async function completeSetup(input: SetupCompleteInput) {
  return apiRequest<{ administratorCreated: boolean; completed: true; restartRequired: true }>('/api/setup/complete', {
    body: input,
    method: 'POST',
  });
}
