import { describe, expect, it } from 'vitest';

import { SystemPermission } from '@tilty/shared/access-control';

import { getMainNavigationGroups, getMainNavigationItems, getPageTitleMessageId, routePath } from '../src/router';

describe('frontend routes', () => {
  it('resolves page title message identifiers from configured routes', () => {
    expect(getPageTitleMessageId('/')).toBe('route.home');
    expect(getPageTitleMessageId(routePath('home'))).toBe('route.home');
    expect(getPageTitleMessageId(routePath('dashboard'))).toBe('route.dashboard');
    expect(getPageTitleMessageId(routePath('profile'))).toBe('route.profile');
    expect(getPageTitleMessageId(routePath('apiKeys'))).toBe('route.api.keys');
    expect(getPageTitleMessageId(routePath('security'))).toBe('route.security');
    expect(getPageTitleMessageId(routePath('ssoCallback'))).toBe('route.sso.callback');
    expect(getPageTitleMessageId(routePath('systemSettings'))).toBe('route.system.settings');
    expect(getPageTitleMessageId(routePath('verifySignIn'))).toBe('route.verify.sign.in');
    expect(getPageTitleMessageId(routePath('users'))).toBe('route.users');
    expect(getPageTitleMessageId(`${routePath('users')}/`)).toBe('route.users');
    expect(getPageTitleMessageId('/unknown')).toBe('route.dashboard');
  });

  it('filters permissioned main navigation routes', () => {
    expect(getMainNavigationItems().map((route) => route.url)).toEqual([
      routePath('dashboard'),
      '/api/docs',
      routePath('profile'),
      routePath('apiKeys'),
      routePath('security'),
    ]);
    expect(getMainNavigationItems([SystemPermission.UserList]).map((route) => route.url)).toEqual([
      routePath('dashboard'),
      '/api/docs',
      routePath('profile'),
      routePath('apiKeys'),
      routePath('security'),
      routePath('users'),
    ]);
    expect(getMainNavigationItems([SystemPermission.Root]).map((route) => route.url)).toEqual([
      routePath('dashboard'),
      '/api/docs',
      routePath('profile'),
      routePath('apiKeys'),
      routePath('security'),
      routePath('users'),
      routePath('systemSettings'),
    ]);
  });

  it('groups main navigation routes', () => {
    expect(
      getMainNavigationGroups().map((group) => ({
        labelMessageId: group.labelMessageId,
        urls: group.items.map((route) => route.url),
      })),
    ).toEqual([
      {
        labelMessageId: 'nav.group.applications',
        urls: [routePath('dashboard'), '/api/docs'],
      },
      {
        labelMessageId: 'nav.group.profile',
        urls: [routePath('profile'), routePath('apiKeys'), routePath('security')],
      },
    ]);

    expect(
      getMainNavigationGroups([SystemPermission.UserList]).map((group) => ({
        labelMessageId: group.labelMessageId,
        urls: group.items.map((route) => route.url),
      })),
    ).toEqual([
      {
        labelMessageId: 'nav.group.applications',
        urls: [routePath('dashboard'), '/api/docs'],
      },
      {
        labelMessageId: 'nav.group.profile',
        urls: [routePath('profile'), routePath('apiKeys'), routePath('security')],
      },
      {
        labelMessageId: 'nav.group.admin',
        urls: [routePath('users')],
      },
    ]);

    expect(
      getMainNavigationGroups([SystemPermission.Root]).map((group) => ({
        labelMessageId: group.labelMessageId,
        urls: group.items.map((route) => route.url),
      })),
    ).toEqual([
      {
        labelMessageId: 'nav.group.applications',
        urls: [routePath('dashboard'), '/api/docs'],
      },
      {
        labelMessageId: 'nav.group.profile',
        urls: [routePath('profile'), routePath('apiKeys'), routePath('security')],
      },
      {
        labelMessageId: 'nav.group.admin',
        urls: [routePath('users'), routePath('systemSettings')],
      },
    ]);
  });
});
