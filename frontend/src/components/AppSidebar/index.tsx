import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { BracesIcon, CommandIcon, EllipsisVerticalIcon, LayoutDashboardIcon, LogOutIcon } from 'lucide-react';

import { clearStoredSession, getStoredSession } from '@/lib/auth';
import { appConfig } from '@/lib/config';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from '@/shadcn/components/ui/sidebar';

import NavHeader from './NavHeader';
import SideNav, { type SideNavProps } from './SideNav';

const sidebarStyle = {
  '--header-height': 'calc(var(--spacing) * 12)',
  '--sidebar-width': 'calc(var(--spacing) * 72)',
} as CSSProperties;

const navItems = {
  main: [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: <LayoutDashboardIcon />,
    },
    {
      title: 'API Docs',
      url: `${appConfig.apiBaseUrl}/api/docs`,
      external: true,
      icon: <BracesIcon />,
    },
  ],
} satisfies SideNavProps;

interface AppSidebarProps {
  children: ReactNode;
}

interface SideUserProfile {
  avatar?: string;
  email: string;
  name: string;
}

const SideUser = ({ onSignOut, user }: { onSignOut: () => void; user: SideUserProfile }) => {
  const { isMobile } = useSidebar();
  const fallback = getInitials(user.name);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale after:hidden">
                {user.avatar ? <AvatarImage className="rounded-lg" src={user.avatar} alt={user.name} /> : null}
                <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
              <EllipsisVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg after:hidden">
                  {user.avatar ? <AvatarImage className="rounded-lg" src={user.avatar} alt={user.name} /> : null}
                  <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOutIcon />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const AppSidebar = ({ children }: AppSidebarProps) => {
  const navigate = useNavigate();
  const session = getStoredSession();
  const sidebarUser = {
    email: session?.user.email ?? '',
    name: session?.user.username ?? 'Logged-in User',
  };

  const handleSignOut = () => {
    clearStoredSession();
    navigate('/login', { replace: true });
  };

  return (
    <SidebarProvider style={sidebarStyle}>
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
                <a href="/dashboard">
                  <CommandIcon className="size-5!" />
                  <span className="text-base font-semibold">Tilty Scaffold</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SideNav main={navItems.main} />
        </SidebarContent>
        <SidebarFooter>
          <SideUser onSignOut={handleSignOut} user={sidebarUser} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <NavHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U'
  );
}

export default AppSidebar;
