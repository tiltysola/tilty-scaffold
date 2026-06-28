import { apiRequest } from './api';

export type SetupEnvironment = Record<string, string>;

export interface SetupAdministrator {
  username: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface SetupDefaults {
  environment: SetupEnvironment;
  environmentFileLoaded: boolean;
}

export interface SetupCompleteInput {
  administrator?: SetupAdministrator;
  environment: SetupEnvironment;
}

export type SetupEnvironmentStepId = 'administrator' | 'runtime' | 'scheduler' | 'security';

export async function fetchSetupDefaults() {
  return apiRequest<SetupDefaults>('/api/setup/defaults');
}

export async function validateSetupEnvironment(environment: SetupEnvironment, stepId?: SetupEnvironmentStepId) {
  return apiRequest<{ valid: true }>('/api/setup/validate/environment', {
    body: {
      environment,
      ...(stepId ? { stepId } : {}),
    },
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

export async function testSmsConnection(environment: SetupEnvironment) {
  return apiRequest<{
    connected: true;
    profileCountryCodes?: Array<'+86' | '+852' | '+853'>;
    service: 'aliyun' | 'off';
  }>('/api/setup/test/sms', {
    body: { environment },
    method: 'POST',
  });
}

export async function testSsoConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; enabled: boolean; providerIds?: string[] }>('/api/setup/test/sso', {
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

export function generateSetupSecret() {
  const bytes = new Uint8Array(48);

  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
