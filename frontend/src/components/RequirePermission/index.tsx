import { Navigate, Outlet } from 'react-router-dom';

import { getStoredSession } from '@/lib/auth';
import { routePath } from '@/router';
import { hasPermission, type SystemPermissionKey } from '@tilty/shared/access-control';

interface RequirePermissionProps {
  permission: SystemPermissionKey;
}

const Index = ({ permission }: RequirePermissionProps) => {
  const session = getStoredSession();

  if (!hasPermission(session?.user.permissions, permission)) {
    return <Navigate replace to={routePath('dashboard')} />;
  }

  return <Outlet />;
};

export default Index;
