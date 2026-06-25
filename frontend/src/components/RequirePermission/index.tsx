import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import { routePath } from '@/router';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { hasPermission, type SystemPermissionKey } from '@tilty/shared/access-control';

interface RequirePermissionProps {
  permission: SystemPermissionKey;
}

const Index = ({ permission }: RequirePermissionProps) => {
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

  const session = auth.session;

  if (!session || !hasPermission(session.user.permissions, permission)) {
    return <Navigate replace to={routePath('dashboard')} />;
  }

  return <Outlet />;
};

export default Index;
