import { Outlet } from 'react-router-dom';

import AppSidebar from '@/components/AppSidebar';

const Index = () => {
  return (
    <AppSidebar>
      <Outlet />
    </AppSidebar>
  );
};

export default Index;
