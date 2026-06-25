import { type CSSProperties, type ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  BracesIcon,
  CommandIcon,
  EllipsisVerticalIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  type LucideIcon,
  UserCircleIcon,
  UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuthenticatedSession } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import { getUserHandle, getUserInitials, logout, resolveAssetUrl } from '@/lib/auth';
import { getMainNavigationGroups, type NavigationIcon, routePath } from '@/router';
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

const navIcons: Record<NavigationIcon, LucideIcon> = {
  apiDocs: BracesIcon,
  dashboard: LayoutDashboardIcon,
  profile: UserCircleIcon,
  users: UsersIcon,
};

interface AppSidebarProps {
  children: ReactNode;
}

interface SidebarUserProfile {
  avatarUrl?: string;
  name: string;
  username: string;
}

const SidebarUser = ({
  onSignOut,
  onProfile,
  signingOut,
  user,
}: {
  onSignOut: () => void;
  onProfile: () => void;
  signingOut: boolean;
  user: SidebarUserProfile;
}) => {
  const { isMobile } = useSidebar();
  const avatarUrl = resolveAssetUrl(user.avatarUrl);
  const fallback = getUserInitials(user.name);
  const userHandle = getUserHandle(user.username);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg after:hidden">
                {avatarUrl ? <AvatarImage className="rounded-lg" src={avatarUrl} alt={user.name} /> : null}
                <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{userHandle}</span>
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
                  {avatarUrl ? <AvatarImage className="rounded-lg" src={avatarUrl} alt={user.name} /> : null}
                  <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium text-sidebar-accent-foreground">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{userHandle}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onProfile}>
              <UserCircleIcon />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem disabled={signingOut} onSelect={onSignOut}>
              <LogOutIcon />
              {signingOut ? 'Signing out' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};

const Index = ({ children }: AppSidebarProps) => {
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const session = useAuthenticatedSession();
  const sidebarUser = {
    avatarUrl: session.user.avatarUrl,
    name: session.user.displayName,
    username: session.user.username,
  };
  const navItems = createNavItems(session.user.permissions);

  const handleSignOut = () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    void logout()
      .then(() => {
        navigate(routePath('login'), { replace: true });
      })
      .catch((error) => {
        toast.error(getApiErrorMessage(error, 'Sign out could not be completed.'));
        setSigningOut(false);
      });
  };

  const handleProfile = () => {
    navigate(routePath('profile'));
  };

  return (
    <SidebarProvider style={sidebarStyle}>
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
                <Link to={routePath('dashboard')}>
                  <CommandIcon className="size-5!" />
                  <span className="text-base font-semibold">Tilty Scaffold</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SideNav groups={navItems.groups} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarUser onSignOut={handleSignOut} onProfile={handleProfile} signingOut={signingOut} user={sidebarUser} />
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

function createNavItems(permissionKeys?: string[]) {
  return {
    groups: getMainNavigationGroups(permissionKeys).map((group) => ({
      items: group.items.map((item) => {
        const Icon = navIcons[item.icon];

        return {
          external: item.external,
          icon: <Icon />,
          title: item.title,
          url: item.url,
        };
      }),
      label: group.label,
    })),
  } satisfies SideNavProps;
}

export default Index;
