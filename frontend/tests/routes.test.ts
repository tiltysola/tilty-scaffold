import { describe, expect, it } from 'vitest';

import { SystemPermission } from '@tilty/shared/access-control';

import { getMainNavigationGroups, getMainNavigationItems, getPageTitle, routePath } from '../src/router';

describe('frontend routes', () => {
  it('resolves page titles from configured routes', () => {
    expect(getPageTitle('/')).toBe('Dashboard');
    expect(getPageTitle(routePath('dashboard'))).toBe('Dashboard');
    expect(getPageTitle(routePath('profile'))).toBe('Profile');
    expect(getPageTitle(routePath('security'))).toBe('Security');
    expect(getPageTitle(routePath('ssoCallback'))).toBe('SSO callback');
    expect(getPageTitle(routePath('systemSettings'))).toBe('System Settings');
    expect(getPageTitle(routePath('verifySignIn'))).toBe('Verify sign-in');
    expect(getPageTitle(routePath('users'))).toBe('Users');
    expect(getPageTitle(`${routePath('users')}/`)).toBe('Users');
    expect(getPageTitle('/unknown')).toBe('Dashboard');
  });

  it('filters permissioned main navigation routes', () => {
    expect(getMainNavigationItems().map((route) => route.url)).toEqual([
      routePath('dashboard'),
      '/api/docs',
      routePath('profile'),
      routePath('security'),
    ]);
    expect(getMainNavigationItems([SystemPermission.UserList]).map((route) => route.url)).toEqual([
      routePath('dashboard'),
      '/api/docs',
      routePath('profile'),
      routePath('security'),
      routePath('users'),
    ]);
    expect(getMainNavigationItems([SystemPermission.Root]).map((route) => route.url)).toEqual([
      routePath('dashboard'),
      '/api/docs',
      routePath('profile'),
      routePath('security'),
      routePath('users'),
      routePath('systemSettings'),
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
        urls: [routePath('profile'), routePath('security')],
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
        urls: [routePath('profile'), routePath('security')],
      },
      {
        label: 'Admin',
        urls: [routePath('users')],
      },
    ]);

    expect(
      getMainNavigationGroups([SystemPermission.Root]).map((group) => ({
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
        urls: [routePath('profile'), routePath('security')],
      },
      {
        label: 'Admin',
        urls: [routePath('users'), routePath('systemSettings')],
      },
    ]);
  });
});
