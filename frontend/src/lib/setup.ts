import {
  type SetupCacheStoreValue,
  type SetupEmailVerificationServiceValue,
  type SetupEnvironmentStepValue,
  type SetupFileStorageDriverValue,
  type SetupLogTargetValue,
  type SetupSmsPhoneCountryCodeValue,
  type SetupSmsVerificationServiceValue,
} from '@tilty/shared/setup';

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

export type SetupEnvironmentStepId = SetupEnvironmentStepValue;

export async function unlockSetup(token: string) {
  return apiRequest<{ expiresInSeconds: number; unlocked: true }>('/api/setup/unlock', {
    body: { token },
    method: 'POST',
  });
}

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
  return apiRequest<{ connected: true; hasExistingAdministrator: boolean; hasExistingUsers: boolean }>(
    '/api/setup/test/database',
    {
      body: { environment },
      method: 'POST',
    },
  );
}

export async function testCacheConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; store: SetupCacheStoreValue }>('/api/setup/test/cache', {
    body: { environment },
    method: 'POST',
  });
}

export async function testFileStorageConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; driver: SetupFileStorageDriverValue }>('/api/setup/test/file-storage', {
    body: { environment },
    method: 'POST',
  });
}

export async function testLoggingConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; target: SetupLogTargetValue }>('/api/setup/test/logging', {
    body: { environment },
    method: 'POST',
  });
}

export async function testEmailConnection(environment: SetupEnvironment) {
  return apiRequest<{ connected: true; service: SetupEmailVerificationServiceValue }>('/api/setup/test/email', {
    body: { environment },
    method: 'POST',
  });
}

export async function testSmsConnection(environment: SetupEnvironment) {
  return apiRequest<{
    connected: true;
    profileCountryCodes?: SetupSmsPhoneCountryCodeValue[];
    service: SetupSmsVerificationServiceValue;
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
