import { useIntl } from 'react-intl';

import { EllipsisVerticalIcon, LogOutIcon, UserCircleIcon } from 'lucide-react';

import { getUserHandle, getUserInitials, resolveAssetUrl } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/shadcn/components/ui/sidebar';
import { cn } from '@/shadcn/lib/utils';

interface SidebarUserProfile {
  avatarUrl?: string;
  name: string;
  username: string;
}

interface SidebarUserProps {
  hasProfileBackground: boolean;
  onProfile: () => void;
  onSignOut: () => void;
  signingOut: boolean;
  user: SidebarUserProfile;
}

export function SidebarUser({ hasProfileBackground, onSignOut, onProfile, signingOut, user }: SidebarUserProps) {
  const intl = useIntl();
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
              className={cn(
                'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
                hasProfileBackground &&
                  'hover:bg-sidebar-accent/40 active:bg-sidebar-accent/40 data-[state=open]:!bg-sidebar-accent/40 data-[state=open]:hover:!bg-sidebar-accent/40',
              )}
            >
              <Avatar>
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={user.name} /> : null}
                <AvatarFallback>{fallback}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{userHandle}</span>
              </div>
              <EllipsisVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? 'bottom' : 'right'} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar>
                  {avatarUrl ? <AvatarImage src={avatarUrl} alt={user.name} /> : null}
                  <AvatarFallback>{fallback}</AvatarFallback>
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
              {intl.formatMessage({ id: 'route.profile' })}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={signingOut} onSelect={onSignOut}>
              <LogOutIcon />
              {intl.formatMessage({ id: signingOut ? 'profile.signing.out' : 'profile.sign.out' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
