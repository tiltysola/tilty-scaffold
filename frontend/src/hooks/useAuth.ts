import { useSyncExternalStore } from 'react';

import { type AuthSession, type AuthSnapshot, authStore } from '@/lib/auth';

export function useAuth(): AuthSnapshot {
  return useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getSnapshot);
}

export function useAuthenticatedSession(): AuthSession {
  const snapshot = useAuth();

  if (snapshot.status !== 'authenticated' || !snapshot.session) {
    throw new Error('Authenticated session is required.');
  }

  return snapshot.session;
}
