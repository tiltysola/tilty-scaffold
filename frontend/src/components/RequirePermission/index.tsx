import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import { routePath } from '@/router';
import { hasPermission, type SystemPermissionKey } from '@tilty/shared/access-control';

import SessionRestoring from '@/components/SessionRestoring';

interface RequirePermissionProps {
  permission: SystemPermissionKey;
}

const Index = ({ permission }: RequirePermissionProps) => {
  const location = useLocation();
  const auth = useAuth();

  if (auth.status === 'restoring') {
    return <SessionRestoring />;
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
