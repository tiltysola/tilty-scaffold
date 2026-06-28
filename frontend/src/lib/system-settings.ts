import { apiRequest } from './api';
import { type SetupEnvironment } from './setup';

export interface SystemSettings {
  environment: SetupEnvironment;
  environmentFileLoaded: boolean;
}

export async function fetchSystemSettings() {
  return apiRequest<SystemSettings>('/api/system-settings/');
}

export async function updateSystemSettings(environment: SetupEnvironment) {
  return apiRequest<{ restartRequired: true; updated: true }>('/api/system-settings/', {
    body: {
      environment,
    },
    method: 'PUT',
  });
}
