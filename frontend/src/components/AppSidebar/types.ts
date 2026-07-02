import { type ReactNode } from 'react';

export interface NavItem {
  external?: boolean;
  icon?: ReactNode;
  title: string;
  url: string;
}

export interface NavGroupItem {
  items: NavItem[];
  label: string;
}

export interface SideNavProps {
  groups: NavGroupItem[];
  isActiveItemSubtle?: boolean;
}
