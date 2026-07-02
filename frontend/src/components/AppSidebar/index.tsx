import { type CSSProperties, type ReactNode, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router-dom';

import {
  BracesIcon,
  CommandIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  SettingsIcon,
  ShieldIcon,
  UserCircleIcon,
  UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuthenticatedSession } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import { logout, resolveAssetUrl } from '@/lib/auth';
import { getMainNavigationGroups, type NavigationIcon, routePath } from '@/router';
import { ScrollArea } from '@/shadcn/components/ui/scroll-area';
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
} from '@/shadcn/components/ui/sidebar';
import { cn } from '@/shadcn/lib/utils';

import NavHeader from './NavHeader';
import { SidebarUser } from './SidebarUser';
import SideNav, { type SideNavProps } from './SideNav';

interface AppSidebarProps {
  children: ReactNode;
}

const sidebarStyle = {
  '--header-height': 'calc(var(--spacing) * 12)',
  '--sidebar-width': 'calc(var(--spacing) * 72)',
} as CSSProperties;

const navIcons: Record<NavigationIcon, LucideIcon> = {
  apiDocs: BracesIcon,
  dashboard: LayoutDashboardIcon,
  profile: UserCircleIcon,
  security: ShieldIcon,
  settings: SettingsIcon,
  users: UsersIcon,
};

const Index = ({ children }: AppSidebarProps) => {
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const intl = useIntl();
  const session = useAuthenticatedSession();
  const sidebarUser = {
    avatarUrl: session.user.avatarUrl,
    name: session.user.displayName ?? intl.formatMessage({ id: 'fallback.signed.in.user' }),
    username: session.user.username,
  };
  const profileBackgroundUrl = resolveAssetUrl(session.user.profileBackgroundUrl);
  const hasProfileBackground = Boolean(profileBackgroundUrl);
  const navItems = createNavItems(session.user.permissions, intl.formatMessage);

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
        toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'profile.sign.out.failed' })));
        setSigningOut(false);
      });
  };

  const handleProfile = () => {
    navigate(routePath('profile'));
  };

  return (
    <div className="app-shell relative h-svh overflow-hidden bg-sidebar text-foreground">
      {profileBackgroundUrl ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 scale-[1.03] bg-cover bg-center bg-no-repeat opacity-80 blur-[2px]"
            style={{ backgroundImage: `url(${JSON.stringify(profileBackgroundUrl)})` }}
          />
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-sidebar/25 backdrop-blur-md" />
        </>
      ) : null}
      <SidebarProvider className="relative h-svh min-h-0 has-data-[variant=inset]:bg-transparent" style={sidebarStyle}>
        <Sidebar
          className={cn(
            'md:group-data-[collapsible=offcanvas]:invisible md:group-data-[collapsible=offcanvas]:pointer-events-none',
            hasProfileBackground && '[&_[data-slot=sidebar-inner]]:!bg-transparent',
          )}
          collapsible="offcanvas"
          variant="inset"
        >
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to={routePath('dashboard')}>
                    <CommandIcon />
                    <span className="text-base font-semibold">{intl.formatMessage({ id: 'app.name' })}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <SidebarContent>
            <SideNav groups={navItems.groups} isActiveItemSubtle={hasProfileBackground} />
          </SidebarContent>
          <SidebarFooter>
            <SidebarUser
              hasProfileBackground={hasProfileBackground}
              onSignOut={handleSignOut}
              onProfile={handleProfile}
              signingOut={signingOut}
              user={sidebarUser}
            />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset
          className={cn(
            'min-h-0 overflow-hidden md:peer-data-[variant=inset]:transition-[margin] md:peer-data-[variant=inset]:duration-200 md:peer-data-[variant=inset]:ease-linear',
            hasProfileBackground &&
              'bg-background/25 shadow-lg ring-1 ring-border/25 backdrop-blur-xl supports-backdrop-filter:bg-background/20',
          )}
        >
          <NavHeader />
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex min-h-full flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">{children}</div>
            </div>
          </ScrollArea>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
};

function createNavItems(permissionKeys: string[] | undefined, formatMessage: (descriptor: { id: string }) => string) {
  return {
    groups: getMainNavigationGroups(permissionKeys).map((group) => ({
      items: group.items.map((item) => {
        const Icon = navIcons[item.icon];

        return {
          external: item.external,
          icon: <Icon />,
          title: formatMessage({ id: item.titleMessageId }),
          url: item.url,
        };
      }),
      label: formatMessage({ id: group.labelMessageId }),
    })),
  } satisfies SideNavProps;
}

export default Index;
