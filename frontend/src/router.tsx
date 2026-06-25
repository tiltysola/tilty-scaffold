/* eslint-disable react-refresh/only-export-components -- Route helpers are intentionally exported from the router. */
import { lazy, Suspense } from 'react';
import { type RouteObject, useRoutes } from 'react-router-dom';

import { Spinner } from '@/shadcn/components/ui/spinner';
import { hasPermission, SystemPermission, type SystemPermissionKey } from '@tilty/shared/access-control';

const DashboardPage = lazy(() => import('@/pages/Dashboard'));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPassword'));
const Layout = lazy(() => import('@/components/Layout'));
const LoginPage = lazy(() => import('@/pages/Login'));
const NotFoundPage = lazy(() => import('@/pages/NotFound'));
const RegisterPage = lazy(() => import('@/pages/Register'));
const RequireAuth = lazy(() => import('@/components/RequireAuth'));
const RequirePermission = lazy(() => import('@/components/RequirePermission'));
const SetupPage = lazy(() => import('@/pages/Setup'));
const SsoCallbackPage = lazy(() => import('@/pages/SsoCallback'));
const ProfilePage = lazy(() => import('@/pages/Profile'));
const UsersPage = lazy(() => import('@/pages/Users'));

export type NavigationGroupId = 'admin' | 'applications' | 'profile';
export type NavigationIcon = 'apiDocs' | 'dashboard' | 'profile' | 'users';
type RouteId = 'dashboard' | 'forgotPassword' | 'login' | 'profile' | 'register' | 'setup' | 'ssoCallback' | 'users';

interface PageRoute {
  id: RouteId;
  path: string;
  title: string;
  element: RouteObject['element'];
  layout: 'app' | 'standalone';
  permission?: SystemPermissionKey;
}

const pageRoutes: PageRoute[] = [
  {
    id: 'dashboard',
    path: '/dashboard',
    title: 'Dashboard',
    element: <DashboardPage />,
    layout: 'app',
  },
  {
    id: 'users',
    path: '/users',
    title: 'Users',
    element: <UsersPage />,
    layout: 'app',
    permission: SystemPermission.UserList,
  },
  {
    id: 'profile',
    path: '/profile',
    title: 'Profile',
    element: <ProfilePage />,
    layout: 'app',
  },
  {
    id: 'setup',
    path: '/setup',
    title: 'Setup',
    element: <SetupPage />,
    layout: 'standalone',
  },
  {
    id: 'login',
    path: '/login',
    title: 'Log in',
    element: <LoginPage />,
    layout: 'standalone',
  },
  {
    id: 'forgotPassword',
    path: '/forgot-password',
    title: 'Password recovery',
    element: <ForgotPasswordPage />,
    layout: 'standalone',
  },
  {
    id: 'register',
    path: '/register',
    title: 'Account registration',
    element: <RegisterPage />,
    layout: 'standalone',
  },
  {
    id: 'ssoCallback',
    path: '/sso/callback',
    title: 'SSO callback',
    element: <SsoCallbackPage />,
    layout: 'standalone',
  },
];

interface NavigationItem {
  external?: boolean;
  group: NavigationGroupId;
  icon: NavigationIcon;
  permission?: SystemPermissionKey;
  title: string;
  url: string;
}

export interface NavigationGroup {
  id: NavigationGroupId;
  label: string;
  items: NavigationItem[];
}

const defaultRouteId: RouteId = 'dashboard';

const navigationGroups: Array<Pick<NavigationGroup, 'id' | 'label'>> = [
  {
    id: 'applications',
    label: 'Applications',
  },
  {
    id: 'profile',
    label: 'Account',
  },
  {
    id: 'admin',
    label: 'Admin',
  },
];

const navigationItems: NavigationItem[] = [
  createNavigationRouteItem('dashboard', 'applications', 'dashboard'),
  {
    external: true,
    group: 'applications',
    icon: 'apiDocs',
    title: 'API docs',
    url: '/api/docs',
  },
  createNavigationRouteItem('profile', 'profile', 'profile'),
  createNavigationRouteItem('users', 'admin', 'users', SystemPermission.UserList),
];

const appRouteObjects: RouteObject[] = [
  ...pageRoutes
    .filter((route) => route.layout === 'standalone')
    .map(
      (route): RouteObject => ({
        element: route.element,
        path: route.path,
      }),
    ),
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            element: getPageRoute(defaultRouteId).element,
            index: true,
          },
          ...pageRoutes
            .filter((route) => route.layout === 'app')
            .map((route): RouteObject => {
              if (route.permission) {
                return {
                  element: <RequirePermission permission={route.permission} />,
                  path: route.path,
                  children: [
                    {
                      element: route.element,
                      index: true,
                    },
                  ],
                };
              }

              return {
                element: route.element,
                path: route.path,
              };
            }),
        ],
      },
    ],
  },
  {
    element: <NotFoundPage />,
    path: '*',
  },
];

export function routePath(id: RouteId) {
  return getPageRoute(id).path;
}

export function getPageTitle(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname === '/') {
    return getPageRoute(defaultRouteId).title;
  }

  return (
    pageRoutes.find((route) => normalizePathname(route.path) === normalizedPathname)?.title ??
    getPageRoute(defaultRouteId).title
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
      label: group.label,
      items: items.filter((item) => item.group === group.id),
    }))
    .filter((group) => group.items.length > 0);
}

const Index = () => {
  const routes = useRoutes(appRouteObjects);

  return <Suspense fallback={<RouteFallback />}>{routes}</Suspense>;
};

function RouteFallback() {
  return (
    <main
      aria-busy="true"
      className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Spinner className="size-5" />
        <span>Loading</span>
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
    title: route.title,
    url: route.path,
  };
}

function normalizePathname(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/';
}

export default Index;
