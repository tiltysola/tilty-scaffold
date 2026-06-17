import { Navigate, Outlet } from 'react-router-dom';

import { getStoredSession } from '@/lib/auth';
import { hasPermission, type SystemPermissionKey } from '@tilty/shared/access-control';

interface RequirePermissionProps {
  permission: SystemPermissionKey;
}

const Index = ({ permission }: RequirePermissionProps) => {
  const session = getStoredSession();

  if (!hasPermission(session?.user.permissions, permission)) {
    return <Navigate replace to="/dashboard" />;
  }

  return <Outlet />;
};

export default Index;
