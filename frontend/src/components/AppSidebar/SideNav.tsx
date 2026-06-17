import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shadcn/components/ui/sidebar';

interface NavItem {
  external?: boolean;
  icon?: ReactNode;
  title: string;
  url: string;
}

export interface SideNavProps {
  main: NavItem[];
  secondary?: NavItem[];
}

const NavGroup = ({
  items,
  label,
  ...props
}: {
  items: NavItem[];
  label: string;
} & ComponentPropsWithoutRef<typeof SidebarGroup>) => {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <a
                  href={item.url}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  target={item.external ? '_blank' : undefined}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

const SideNav = ({ main, secondary }: SideNavProps) => {
  return (
    <>
      <NavGroup items={main} label="Application" />
      {secondary?.length ? <NavGroup items={secondary} label="Support" className="mt-auto" /> : null}
    </>
  );
};

export default SideNav;
