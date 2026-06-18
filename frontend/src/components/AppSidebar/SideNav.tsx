import { type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

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
                {item.external ? (
                  <a href={item.url} rel="noopener noreferrer" target="_blank">
                    {item.icon}
                    <span>{item.title}</span>
                  </a>
                ) : (
                  <Link to={item.url}>
                    {item.icon}
                    <span>{item.title}</span>
                  </Link>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};

const Index = ({ main, secondary }: SideNavProps) => {
  return (
    <>
      <NavGroup items={main} label="Application" />
      {secondary?.length ? <NavGroup items={secondary} label="Support" className="mt-auto" /> : null}
    </>
  );
};

export default Index;
