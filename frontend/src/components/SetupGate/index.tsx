import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { fetchSetupStatus, type SetupStatus } from '@/lib/setup';
import { Spinner } from '@/shadcn/components/ui/spinner';

const Index = () => {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let active = true;

    void fetchSetupStatus()
      .then((result) => {
        if (active) {
          setStatus(result);
        }
      })
      .catch(() => {
        if (active) {
          setStatus(null);
        }
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <main
        aria-busy="true"
        className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <Spinner className="size-5" />
          <span>Checking setup status</span>
        </div>
      </main>
    );
  }

  if (status?.required && location.pathname !== '/setup') {
    return <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to="/setup" />;
  }

  if (status?.locked && location.pathname === '/setup') {
    return <Navigate replace to="/login" />;
  }

  return <Outlet />;
};

export default Index;
