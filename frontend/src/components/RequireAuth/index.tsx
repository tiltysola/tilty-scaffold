import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import { routePath } from '@/router';
import { Spinner } from '@/shadcn/components/ui/spinner';

const Index = () => {
  const location = useLocation();
  const auth = useAuth();

  if (auth.status === 'restoring') {
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

  if (auth.status === 'anonymous') {
    return <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to={routePath('login')} />;
  }

  return <Outlet />;
};

export default Index;
