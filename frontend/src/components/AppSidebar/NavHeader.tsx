import { useLocation } from 'react-router-dom';

import { getPageTitle } from '@/router';
import { SidebarTrigger } from '@/shadcn/components/ui/sidebar';

const Index = () => {
  const { pathname } = useLocation();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/50 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <div aria-hidden="true" className="mx-2 h-4 w-px shrink-0 self-center bg-border" />
        <h1 className="text-base font-medium">{title}</h1>
      </div>
    </header>
  );
};

export default Index;
