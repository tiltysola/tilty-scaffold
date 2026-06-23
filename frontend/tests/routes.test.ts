import { describe, expect, it } from 'vitest';

import { SystemPermission } from '@tilty/shared/access-control';

import { getMainNavigationGroups, getMainNavigationItems, getPageTitle, routePath } from '../src/router';

describe('frontend routes', () => {
  it('resolves page titles from configured routes', () => {
    expect(getPageTitle('/')).toBe('Dashboard');
    expect(getPageTitle(routePath('dashboard'))).toBe('Dashboard');
    expect(getPageTitle(routePath('profile'))).toBe('Profile');
    expect(getPageTitle(routePath('users'))).toBe('Users');
    expect(getPageTitle(`${routePath('users')}/`)).toBe('Users');
    expect(getPageTitle('/unknown')).toBe('Dashboard');
  });

  it('filters permissioned main navigation routes', () => {
    expect(getMainNavigationItems().map((route) => route.url)).toEqual([
      routePath('dashboard'),
      '/api/docs',
      routePath('profile'),
    ]);
    expect(getMainNavigationItems([SystemPermission.UserList]).map((route) => route.url)).toEqual([
      routePath('dashboard'),
      '/api/docs',
      routePath('profile'),
      routePath('users'),
    ]);
  });

  it('groups main navigation routes', () => {
    expect(
      getMainNavigationGroups().map((group) => ({
        label: group.label,
        urls: group.items.map((route) => route.url),
      })),
    ).toEqual([
      {
        label: 'Applications',
        urls: [routePath('dashboard'), '/api/docs'],
      },
      {
        label: 'Account',
        urls: [routePath('profile')],
      },
    ]);

    expect(
      getMainNavigationGroups([SystemPermission.UserList]).map((group) => ({
        label: group.label,
        urls: group.items.map((route) => route.url),
      })),
    ).toEqual([
      {
        label: 'Applications',
        urls: [routePath('dashboard'), '/api/docs'],
      },
      {
        label: 'Account',
        urls: [routePath('profile')],
      },
      {
        label: 'Admin',
        urls: [routePath('users')],
      },
    ]);
  });
});
