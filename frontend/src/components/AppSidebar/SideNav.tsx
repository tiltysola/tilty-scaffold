import { useLocation } from 'react-router-dom';

import { NavGroup } from './NavGroup';
import { type SideNavProps } from './types';

export { type SideNavProps } from './types';

const Index = ({ groups, isActiveItemSubtle }: SideNavProps) => {
  const { pathname } = useLocation();

  return (
    <>
      {groups.map((group) => (
        <NavGroup
          key={group.label}
          isActiveItemSubtle={isActiveItemSubtle}
          items={group.items}
          label={group.label}
          pathname={pathname}
        />
      ))}
    </>
  );
};

export default Index;
