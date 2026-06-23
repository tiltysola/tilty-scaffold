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

interface NavGroupItem {
  items: NavItem[];
  label: string;
}

export interface SideNavProps {
  groups: NavGroupItem[];
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

const Index = ({ groups }: SideNavProps) => {
  return (
    <>
      {groups.map((group) => (
        <NavGroup key={group.label} items={group.items} label={group.label} />
      ))}
    </>
  );
};

export default Index;
