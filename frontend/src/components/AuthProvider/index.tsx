import { type ReactNode, useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { authStore, getAccessTokenRefreshDelayMs } from '@/lib/auth';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const snapshot = useAuth();

  useEffect(() => {
    if (snapshot.status !== 'restoring') {
      return;
    }

    void authStore.restore();
  }, [snapshot.status]);

  useEffect(() => {
    if (snapshot.status !== 'authenticated' || !snapshot.session) {
      return;
    }

    const refreshTimeoutId = window.setTimeout(() => {
      void authStore.refresh().catch(() => undefined);
    }, getAccessTokenRefreshDelayMs(snapshot.session));

    return () => {
      window.clearTimeout(refreshTimeoutId);
    };
  }, [snapshot.session, snapshot.status]);

  return children;
}
