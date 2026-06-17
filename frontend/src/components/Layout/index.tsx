import { Outlet } from 'react-router-dom';

import AppSidebar from '@/components/AppSidebar';

const Layout = () => {
  return (
    <AppSidebar>
      <Outlet />
    </AppSidebar>
  );
};

export default Layout;
