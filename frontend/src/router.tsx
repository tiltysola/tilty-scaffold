/* eslint-disable react-refresh/only-export-components -- Route helpers are intentionally exported from the router. */
import { lazy, Suspense } from 'react';
import { useIntl } from 'react-intl';
import { type RouteObject, useRoutes } from 'react-router-dom';

import { Spinner } from '@/shadcn/components/ui/spinner';
import { hasPermission, SystemPermission, type SystemPermissionKey } from '@tilty/shared/access-control';

export type NavigationGroupId = 'admin' | 'applications' | 'profile';
export type NavigationIcon = 'apiDocs' | 'dashboard' | 'profile' | 'security' | 'settings' | 'users';
type RouteId =
  | 'home'
  | 'dashboard'
  | 'profile'
  | 'security'
  | 'systemSettings'
  | 'users'
  | 'setup'
  | 'login'
  | 'register'
  | 'forgotPassword'
  | 'ssoCallback'
  | 'verifySignIn';

interface PageRoute {
  id: RouteId;
  path: string;
  titleMessageId: string;
  element: RouteObject['element'];
  layout: 'app' | 'standalone';
  permission?: SystemPermissionKey;
}

interface NavigationItem {
  external?: boolean;
  group: NavigationGroupId;
  icon: NavigationIcon;
  permission?: SystemPermissionKey;
  titleMessageId: string;
  url: string;
}

export interface NavigationGroup {
  id: NavigationGroupId;
  labelMessageId: string;
  items: NavigationItem[];
}

const Layout = lazy(() => import('@/components/Layout'));
const RequireAuth = lazy(() => import('@/components/RequireAuth'));
const RequirePermission = lazy(() => import('@/components/RequirePermission'));

const HomePage = lazy(() => import('@/pages/Home'));
const DashboardPage = lazy(() => import('@/pages/Dashboard'));
const ProfilePage = lazy(() => import('@/pages/Profile'));
const SecurityPage = lazy(() => import('@/pages/Security'));
const SystemSettingsPage = lazy(() => import('@/pages/SystemSettings'));
const UsersPage = lazy(() => import('@/pages/Users'));
const SetupPage = lazy(() => import('@/pages/Setup'));
const LoginPage = lazy(() => import('@/pages/Login'));
const RegisterPage = lazy(() => import('@/pages/Register'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPassword'));
const SsoCallbackPage = lazy(() => import('@/pages/SsoCallback'));
const VerifySignInPage = lazy(() => import('@/pages/VerifySignIn'));
const NotFoundPage = lazy(() => import('@/pages/NotFound'));

const pageRoutes: PageRoute[] = [
  {
    id: 'home',
    path: '/',
    titleMessageId: 'route.home',
    element: <HomePage />,
    layout: 'standalone',
  },
  {
    id: 'dashboard',
    path: '/dashboard',
    titleMessageId: 'route.dashboard',
    element: <DashboardPage />,
    layout: 'app',
  },
  {
    id: 'profile',
    path: '/profile',
    titleMessageId: 'route.profile',
    element: <ProfilePage />,
    layout: 'app',
  },
  {
    id: 'security',
    path: '/security',
    titleMessageId: 'route.security',
    element: <SecurityPage />,
    layout: 'app',
  },
  {
    id: 'users',
    path: '/users',
    titleMessageId: 'route.users',
    element: <UsersPage />,
    layout: 'app',
    permission: SystemPermission.UserList,
  },
  {
    id: 'systemSettings',
    path: '/settings',
    titleMessageId: 'route.system.settings',
    element: <SystemSettingsPage />,
    layout: 'app',
    permission: SystemPermission.Root,
  },
  {
    id: 'setup',
    path: '/setup',
    titleMessageId: 'route.setup',
    element: <SetupPage />,
    layout: 'standalone',
  },
  {
    id: 'login',
    path: '/login',
    titleMessageId: 'route.login',
    element: <LoginPage />,
    layout: 'standalone',
  },
  {
    id: 'register',
    path: '/register',
    titleMessageId: 'route.account.registration',
    element: <RegisterPage />,
    layout: 'standalone',
  },
  {
    id: 'forgotPassword',
    path: '/forgot-password',
    titleMessageId: 'route.password.recovery',
    element: <ForgotPasswordPage />,
    layout: 'standalone',
  },
  {
    id: 'ssoCallback',
    path: '/sso/callback',
    titleMessageId: 'route.sso.callback',
    element: <SsoCallbackPage />,
    layout: 'standalone',
  },
  {
    id: 'verifySignIn',
    path: '/verify-sign-in',
    titleMessageId: 'route.verify.sign.in',
    element: <VerifySignInPage />,
    layout: 'standalone',
  },
];

const defaultRouteId: RouteId = 'dashboard';

const navigationGroups: Array<Pick<NavigationGroup, 'id' | 'labelMessageId'>> = [
  {
    id: 'applications',
    labelMessageId: 'nav.group.applications',
  },
  {
    id: 'profile',
    labelMessageId: 'nav.group.profile',
  },
  {
    id: 'admin',
    labelMessageId: 'nav.group.admin',
  },
];

const navigationItems: NavigationItem[] = [
  createNavigationRouteItem('dashboard', 'applications', 'dashboard'),
  {
    external: true,
    group: 'applications',
    icon: 'apiDocs',
    titleMessageId: 'nav.api.docs',
    url: '/api/docs',
  },
  createNavigationRouteItem('profile', 'profile', 'profile'),
  createNavigationRouteItem('security', 'profile', 'security'),
  createNavigationRouteItem('users', 'admin', 'users', SystemPermission.UserList),
  createNavigationRouteItem('systemSettings', 'admin', 'settings', SystemPermission.Root),
];

const appRouteObjects: RouteObject[] = [
  ...pageRoutes
    .filter((route) => route.layout === 'standalone')
    .map(
      (route): RouteObject => ({
        path: route.path,
        element: route.element,
      }),
    ),
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          ...pageRoutes
            .filter((route) => route.layout === 'app')
            .map((route): RouteObject => {
              if (route.permission) {
                return {
                  path: route.path,
                  element: <RequirePermission permission={route.permission} />,
                  children: [
                    {
                      index: true,
                      element: route.element,
                    },
                  ],
                };
              }

              return {
                path: route.path,
                element: route.element,
              };
            }),
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
];

const Index = () => {
  const routes = useRoutes(appRouteObjects);

  return <Suspense fallback={<RouteFallback />}>{routes}</Suspense>;
};

export function routePath(id: RouteId) {
  return getPageRoute(id).path;
}

export function getPageTitleMessageId(pathname: string) {
  return getPageRouteByPath(pathname).titleMessageId;
}

function getPageRouteByPath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname === '/') {
    return getPageRoute('home');
  }

  return (
    pageRoutes.find((route) => normalizePathname(route.path) === normalizedPathname) ?? getPageRoute(defaultRouteId)
  );
}

export function getMainNavigationItems(permissionKeys?: string[]): NavigationItem[] {
  return navigationItems.filter((item) => !item.permission || hasPermission(permissionKeys, item.permission));
}

export function getMainNavigationGroups(permissionKeys?: string[]): NavigationGroup[] {
  const items = getMainNavigationItems(permissionKeys);

  return navigationGroups
    .map((group) => ({
      id: group.id,
      labelMessageId: group.labelMessageId,
      items: items.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
}

function RouteFallback() {
  const intl = useIntl();

  return (
    <main
      aria-busy="true"
      className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-5" />
        <span>{intl.formatMessage({ id: 'common.loading' })}</span>
      </div>
    </main>
  );
}

function getPageRoute(id: RouteId) {
  const route = pageRoutes.find((item) => item.id === id);

  if (!route) {
    throw new Error(`Route is not configured: ${id}`);
  }

  return route;
}

function createNavigationRouteItem(
  id: RouteId,
  group: NavigationGroupId,
  icon: NavigationIcon,
  permission?: SystemPermissionKey,
): NavigationItem {
  const route = getPageRoute(id);

  return {
    group,
    icon,
    ...(permission ? { permission } : {}),
    titleMessageId: route.titleMessageId,
    url: route.path,
  };
}

function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

export default Index;
