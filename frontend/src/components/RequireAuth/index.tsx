import type { TransitionEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { getStoredSession, validateStoredSession } from '@/lib/auth';
import { Spinner } from '@/shadcn/components/ui/spinner';

type CheckingPhase = 'hidden' | 'visible' | 'exiting';

const RequireAuth = () => {
  const location = useLocation();
  const [authState, setAuthState] = useState<{
    checkingPhase: CheckingPhase;
    session: ReturnType<typeof getStoredSession>;
  }>(() => {
    const session = getStoredSession();
    const checkingPhase: CheckingPhase = session ? 'visible' : 'hidden';

    return {
      checkingPhase,
      session,
    };
  });
  const shouldValidateSessionRef = useRef(authState.checkingPhase === 'visible');

  useEffect(() => {
    if (!shouldValidateSessionRef.current) {
      return;
    }

    let active = true;
    const completeChecking = (session: Awaited<ReturnType<typeof validateStoredSession>>) => {
      if (!active) {
        return;
      }

      setAuthState((current) => ({
        ...current,
        checkingPhase: 'exiting',
        session,
      }));
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

  const handleCheckingTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || authState.checkingPhase !== 'exiting') {
      return;
    }

    setAuthState((current) => ({
      ...current,
      checkingPhase: 'hidden',
    }));
  };

  if (authState.checkingPhase !== 'hidden') {
    return (
      <main
        aria-busy="true"
        className={[
          'flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground',
          'transition-opacity duration-200 ease-out',
          authState.checkingPhase === 'visible' ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
        onTransitionEnd={handleCheckingTransitionEnd}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Spinner className="size-5" />
          <span>Restoring session...</span>
        </div>
      </main>
    );
  }

  if (!authState.session) {
    return <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to="/login" />;
  }

  return <Outlet />;
};

export default RequireAuth;
