import { type ChangeEvent, type CSSProperties, type ReactNode, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import {
  BracesIcon,
  CommandIcon,
  EllipsisVerticalIcon,
  ImageUpIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  UsersIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { getApiErrorMessage } from '@/lib/api';
import { type AuthUser, getStoredSession, logout, resolveAssetUrl, uploadAvatar } from '@/lib/auth';
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
import { hasPermission, SystemPermission } from '@tilty/shared/access-control';

import NavHeader from './NavHeader';
import SideNav, { type SideNavProps } from './SideNav';

const sidebarStyle = {
  '--header-height': 'calc(var(--spacing) * 12)',
  '--sidebar-width': 'calc(var(--spacing) * 72)',
} as CSSProperties;

interface AppSidebarProps {
  children: ReactNode;
}

interface SidebarUserProfile {
  avatarUrl?: string;
  email: string;
  name: string;
}

const SidebarUser = ({
  onAvatarChange,
  onSignOut,
  signingOut,
  user,
}: {
  onAvatarChange: (user: AuthUser) => void;
  onSignOut: () => void;
  signingOut: boolean;
  user: SidebarUserProfile;
}) => {
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isMobile } = useSidebar();
  const avatarUrl = resolveAssetUrl(user.avatarUrl);
  const fallback = getInitials(user.name);

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = '';

    if (!file) {
      return;
    }

    setUploadingAvatar(true);

    try {
      const updatedUser = await uploadAvatar(file);

      onAvatarChange(updatedUser);
      toast.success('Avatar updated.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Avatar upload failed.'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleAvatarSelect}
        />
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
                  {avatarUrl ? <AvatarImage className="rounded-lg" src={avatarUrl} alt={user.name} /> : null}
                  <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={uploadingAvatar}
              onSelect={(event: Event) => {
                event.preventDefault();
                fileInputRef.current?.click();
              }}
            >
              <ImageUpIcon />
              {uploadingAvatar ? 'Uploading' : 'Upload avatar'}
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
  const [session, setSession] = useState(() => getStoredSession());
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const sidebarUser = {
    avatarUrl: session?.user.avatarUrl,
    email: session?.user.email ?? '',
    name: session?.user.username ?? 'Signed-in user',
  };
  const navItems = createNavItems(session?.user.permissions);

  const handleSignOut = () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    void logout()
      .then(() => {
        navigate('/login', { replace: true });
      })
      .catch((error) => {
        toast.error(getApiErrorMessage(error, 'Sign out failed.'));
        setSigningOut(false);
      });
  };

  const handleAvatarChange = (user: AuthUser) => {
    setSession((currentSession) => (currentSession ? { ...currentSession, user } : currentSession));
  };

  return (
    <SidebarProvider style={sidebarStyle}>
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
                <Link to="/dashboard">
                  <CommandIcon className="size-5!" />
                  <span className="text-base font-semibold">Tilty Scaffold</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SideNav main={navItems.main} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarUser
            onAvatarChange={handleAvatarChange}
            onSignOut={handleSignOut}
            signingOut={signingOut}
            user={sidebarUser}
          />
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

export default Index;

function createNavItems(permissionKeys?: string[]) {
  return {
    main: [
      {
        title: 'Dashboard',
        url: '/dashboard',
        icon: <LayoutDashboardIcon />,
      },
      ...(hasPermission(permissionKeys, SystemPermission.UserList)
        ? [
            {
              title: 'Users',
              url: '/users',
              icon: <UsersIcon />,
            },
          ]
        : []),
      {
        title: 'API docs',
        url: `${appConfig.apiBaseUrl}/api/docs`,
        external: true,
        icon: <BracesIcon />,
      },
    ],
  } satisfies SideNavProps;
}
