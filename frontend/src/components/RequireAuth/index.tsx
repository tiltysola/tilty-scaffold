import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import { routePath } from '@/router';

import SessionRestoring from '@/components/SessionRestoring';

const Index = () => {
  const location = useLocation();
  const auth = useAuth();

  if (auth.status === 'restoring') {
    return <SessionRestoring />;
  }

  if (auth.status === 'anonymous') {
    return <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to={routePath('login')} />;
  }

  return <Outlet />;
};

export default Index;
