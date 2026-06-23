import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getStoredSession, validateStoredSession } from '@/lib/auth';
import { routePath } from '@/router';
import { Spinner } from '@/shadcn/components/ui/spinner';

const Index = () => {
  const [authState, setAuthState] = useState<{
    isChecking: boolean;
    session: ReturnType<typeof getStoredSession>;
  }>(() => {
    const session = getStoredSession();

    return {
      isChecking: Boolean(session),
      session,
    };
  });
  const shouldValidateSessionRef = useRef(authState.isChecking);
  const location = useLocation();

  useEffect(() => {
    if (!shouldValidateSessionRef.current) {
      return;
    }

    let active = true;
    const completeChecking = (session: Awaited<ReturnType<typeof validateStoredSession>>) => {
      if (!active) {
        return;
      }

      setAuthState({
        isChecking: false,
        session,
      });
    };

    void validateStoredSession()
      .then(completeChecking)
      .catch(() => {
        completeChecking(null);
      });

    return () => {
      active = false;
    };
  }, []);

  if (authState.isChecking) {
    return (
      <main
        aria-busy="true"
        className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Spinner className="size-5" />
          <span>Restoring session</span>
        </div>
      </main>
    );
  }

  if (!authState.session) {
    return <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to={routePath('login')} />;
  }

  return <Outlet />;
};

export default Index;
