import { type ComponentPropsWithoutRef } from 'react';
import { Link } from 'react-router-dom';

import { ExternalLinkIcon } from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shadcn/components/ui/sidebar';
import { cn } from '@/shadcn/lib/utils';

import { type NavItem } from './types';

interface NavGroupProps extends ComponentPropsWithoutRef<typeof SidebarGroup> {
  isActiveItemSubtle?: boolean;
  items: NavItem[];
  label: string;
  pathname: string;
}

export function NavGroup({ isActiveItemSubtle, items, label, pathname, ...props }: NavGroupProps) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const isActive = isActiveNavItem(item, pathname);

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  className={getNavItemClassName({ isActive, isActiveItemSubtle })}
                  isActive={!isActiveItemSubtle && isActive}
                >
                  {item.external ? (
                    <a href={item.url} rel="noopener noreferrer" target="_blank">
                      {item.icon}
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <ExternalLinkIcon className="ml-auto size-3.5 text-muted-foreground" />
                    </a>
                  ) : (
                    <Link aria-current={isActive ? 'page' : undefined} to={item.url}>
                      {item.icon}
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function isActiveNavItem(item: NavItem, pathname: string) {
  if (item.external) {
    return false;
  }

  const currentPath = normalizePathname(pathname);
  const itemPath = normalizePathname(item.url);

  return currentPath === itemPath || (currentPath === '/' && itemPath === '/dashboard');
}

function getNavItemClassName({ isActive, isActiveItemSubtle }: { isActive: boolean; isActiveItemSubtle?: boolean }) {
  if (!isActiveItemSubtle) {
    return undefined;
  }

  return cn(
    'hover:bg-sidebar-accent/30 active:bg-sidebar-accent/35',
    isActive && 'bg-sidebar-accent/35 font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent/45',
  );
}

function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}
