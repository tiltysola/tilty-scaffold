import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router-dom';

import {
  ArrowRightIcon,
  BookOpenIcon,
  ChevronDownIcon,
  DatabaseIcon,
  FileCodeIcon,
  KeyRoundIcon,
  LogOutIcon,
  type LucideIcon,
  NetworkIcon,
  Settings2Icon,
  ShieldCheckIcon,
  TerminalIcon,
  UserCircleIcon,
  UsersRoundIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import { getUserHandle, getUserInitials, logout, resolveAssetUrl } from '@/lib/auth';
import { routePath } from '@/router';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { Separator } from '@/shadcn/components/ui/separator';

import { SiteIconAttribution } from '@/components/SiteIconAttribution';
import { ThemeModeToggle } from '@/components/ThemeModeToggle';

type MessageId =
  | 'home.badge'
  | 'home.capability.access.description'
  | 'home.capability.access.title'
  | 'home.capability.api.description'
  | 'home.capability.api.title'
  | 'home.capability.auth.description'
  | 'home.capability.auth.title'
  | 'home.capability.settings.description'
  | 'home.capability.settings.title'
  | 'home.hero.description'
  | 'home.hero.primary'
  | 'home.hero.primary.authenticated'
  | 'home.hero.secondary'
  | 'home.hero.tertiary'
  | 'home.meta.api'
  | 'home.meta.auth'
  | 'home.meta.rbac'
  | 'home.nav.docs'
  | 'home.nav.login'
  | 'home.nav.register'
  | 'home.section.capabilities.description'
  | 'home.section.capabilities.heading'
  | 'home.section.capabilities.title'
  | 'home.section.workflow.description'
  | 'home.section.workflow.heading'
  | 'home.section.workflow.title'
  | 'home.workflow.bootstrap.description'
  | 'home.workflow.bootstrap.title'
  | 'home.workflow.operate.description'
  | 'home.workflow.operate.title'
  | 'home.workflow.secure.description'
  | 'home.workflow.secure.title';

interface CapabilityItem {
  descriptionId: MessageId;
  icon: LucideIcon;
  titleId: MessageId;
}

interface WorkflowItem {
  descriptionId: MessageId;
  icon: LucideIcon;
  titleId: MessageId;
}

const capabilities: CapabilityItem[] = [
  {
    descriptionId: 'home.capability.auth.description',
    icon: KeyRoundIcon,
    titleId: 'home.capability.auth.title',
  },
  {
    descriptionId: 'home.capability.access.description',
    icon: UsersRoundIcon,
    titleId: 'home.capability.access.title',
  },
  {
    descriptionId: 'home.capability.settings.description',
    icon: Settings2Icon,
    titleId: 'home.capability.settings.title',
  },
  {
    descriptionId: 'home.capability.api.description',
    icon: FileCodeIcon,
    titleId: 'home.capability.api.title',
  },
];

const workflow: WorkflowItem[] = [
  {
    descriptionId: 'home.workflow.bootstrap.description',
    icon: DatabaseIcon,
    titleId: 'home.workflow.bootstrap.title',
  },
  {
    descriptionId: 'home.workflow.secure.description',
    icon: ShieldCheckIcon,
    titleId: 'home.workflow.secure.title',
  },
  {
    descriptionId: 'home.workflow.operate.description',
    icon: NetworkIcon,
    titleId: 'home.workflow.operate.title',
  },
];

const Index = () => {
  const intl = useIntl();
  const auth = useAuth();
  const isAuthenticated = auth.status === 'authenticated' && Boolean(auth.session);

  return (
    <main className="min-h-svh bg-background text-foreground">
      <section className="relative isolate min-h-[82svh] overflow-hidden bg-background text-foreground">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[url('/images/home-hero-light.webp')] bg-cover bg-center dark:bg-[url('/images/home-hero.webp')]"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-r from-background via-background/85 to-background/15 dark:from-background dark:via-background/80 dark:to-background/20" />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-background/80 via-transparent to-background/40 dark:from-background/70 dark:via-transparent dark:to-background/30" />

        <header className="absolute inset-x-0 top-0 z-20">
          <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <Link className="text-sm font-semibold text-foreground" to={routePath('home')}>
              {intl.formatMessage({ id: 'app.name' })}
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeModeToggle />
              <Button asChild className="hidden sm:inline-flex" size="default" variant="ghost">
                <a href="/api/docs">{intl.formatMessage({ id: 'home.nav.docs' })}</a>
              </Button>
              <HomeSessionAction />
            </div>
          </nav>
        </header>

        <div className="mx-auto flex min-h-[82svh] max-w-7xl items-center px-4 pb-12 pt-24 sm:px-6 sm:pb-16 lg:px-8">
          <div className="max-w-2xl">
            <Badge variant="secondary">{intl.formatMessage({ id: 'home.badge' })}</Badge>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-normal text-foreground sm:text-5xl lg:text-6xl">
              {intl.formatMessage({ id: 'app.name' })}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground dark:text-foreground/80 sm:text-lg">
              {intl.formatMessage({ id: 'home.hero.description' })}
            </p>
            <HeroActions isAuthenticated={isAuthenticated} isRestoring={auth.status === 'restoring'} />
            <div className="mt-8 flex flex-wrap gap-2 text-xs text-muted-foreground dark:text-foreground/75">
              <span>{intl.formatMessage({ id: 'home.meta.auth' })}</span>
              <span aria-hidden="true">/</span>
              <span>{intl.formatMessage({ id: 'home.meta.rbac' })}</span>
              <span aria-hidden="true">/</span>
              <span>{intl.formatMessage({ id: 'home.meta.api' })}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b bg-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8 lg:py-20">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-muted-foreground">
              {intl.formatMessage({ id: 'home.section.capabilities.title' })}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">
              {intl.formatMessage({ id: 'home.section.capabilities.heading' })}
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {intl.formatMessage({ id: 'home.section.capabilities.description' })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {capabilities.map((item) => {
              const Icon = item.icon;

              return (
                <article className="rounded-lg border bg-card p-5 text-card-foreground" key={item.titleId}>
                  <Icon className="size-5 text-muted-foreground" />
                  <h3 className="mt-4 text-base font-semibold tracking-normal">
                    {intl.formatMessage({ id: item.titleId })}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {intl.formatMessage({ id: item.descriptionId })}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-muted-foreground">
              {intl.formatMessage({ id: 'home.section.workflow.title' })}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal">
              {intl.formatMessage({ id: 'home.section.workflow.heading' })}
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {intl.formatMessage({ id: 'home.section.workflow.description' })}
            </p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {workflow.map((item, index) => {
              const Icon = item.icon;

              return (
                <article className="flex gap-4" key={item.titleId}>
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                    <Icon className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{String(index + 1).padStart(2, '0')}</p>
                    <h3 className="mt-1 text-base font-semibold tracking-normal">
                      {intl.formatMessage({ id: item.titleId })}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {intl.formatMessage({ id: item.descriptionId })}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
          <Separator />
          <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <TerminalIcon className="size-4" />
              <span>{intl.formatMessage({ id: 'app.name' })}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="hover:text-foreground" to={routePath('login')}>
                {intl.formatMessage({ id: 'home.nav.login' })}
              </Link>
              <Link className="hover:text-foreground" to={routePath('register')}>
                {intl.formatMessage({ id: 'home.nav.register' })}
              </Link>
              <a className="hover:text-foreground" href="/api/docs">
                {intl.formatMessage({ id: 'home.nav.docs' })}
              </a>
            </div>
          </div>
          <SiteIconAttribution className="text-center sm:text-left" />
        </div>
      </footer>
    </main>
  );
};

export default Index;

function HeroActions({ isAuthenticated, isRestoring }: { isAuthenticated: boolean; isRestoring: boolean }) {
  const intl = useIntl();
  const primaryRoute = isAuthenticated ? routePath('dashboard') : routePath('login');
  const primaryMessageId = isAuthenticated ? 'home.hero.primary.authenticated' : 'home.hero.primary';

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      {isRestoring ? (
        <Button disabled size="lg" variant="secondary">
          {intl.formatMessage({ id: 'common.loading' })}
        </Button>
      ) : (
        <Button asChild size="lg" variant="secondary">
          <Link to={primaryRoute}>
            {intl.formatMessage({ id: primaryMessageId })}
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      )}
      {isAuthenticated ? null : (
        <Button asChild className="text-foreground" size="lg" variant="outline">
          <Link to={routePath('register')}>{intl.formatMessage({ id: 'home.hero.secondary' })}</Link>
        </Button>
      )}
      <Button asChild size="lg" variant="ghost">
        <a href="/api/docs">
          <BookOpenIcon data-icon="inline-start" />
          {intl.formatMessage({ id: 'home.hero.tertiary' })}
        </a>
      </Button>
    </div>
  );
}

function HomeSessionAction() {
  const [signingOut, setSigningOut] = useState(false);
  const navigate = useNavigate();
  const intl = useIntl();
  const auth = useAuth();

  if (auth.status === 'restoring') {
    return (
      <Button disabled size="default" variant="secondary">
        {intl.formatMessage({ id: 'common.loading' })}
      </Button>
    );
  }

  if (auth.status === 'authenticated' && auth.session) {
    const displayName = auth.session.user.displayName ?? intl.formatMessage({ id: 'fallback.signed.in.user' });
    const avatarUrl = resolveAssetUrl(auth.session.user.avatarUrl);
    const fallback = getUserInitials(displayName);
    const userHandle = getUserHandle(auth.session.user.username);

    const handleProfile = () => {
      navigate(routePath('profile'));
    };

    const handleSignOut = () => {
      if (signingOut) {
        return;
      }

      setSigningOut(true);
      void logout()
        .then(() => {
          navigate(routePath('login'), { replace: true });
        })
        .catch((error) => {
          toast.error(getApiErrorMessage(error, intl.formatMessage({ id: 'profile.sign.out.failed' })));
          setSigningOut(false);
        });
    };

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 max-w-48 justify-start gap-2 px-1.5 sm:max-w-64" size="default" variant="ghost">
            <Avatar
              className="group-hover/button:after:bg-foreground/10 group-data-[state=open]/button:after:bg-foreground/10"
              size="sm"
            >
              {avatarUrl ? <AvatarImage alt={displayName} src={avatarUrl} /> : null}
              <AvatarFallback>{fallback}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate">{displayName}</span>
            <ChevronDownIcon className="ml-auto" data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56" sideOffset={4}>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar>
                {avatarUrl ? <AvatarImage alt={displayName} src={avatarUrl} /> : null}
                <AvatarFallback>{fallback}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium text-sidebar-accent-foreground">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{userHandle}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleProfile}>
            <UserCircleIcon />
            {intl.formatMessage({ id: 'route.profile' })}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={signingOut} onSelect={handleSignOut}>
            <LogOutIcon />
            {intl.formatMessage({ id: signingOut ? 'profile.signing.out' : 'profile.sign.out' })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button asChild size="default" variant="secondary">
      <Link to={routePath('login')}>{intl.formatMessage({ id: 'home.nav.login' })}</Link>
    </Button>
  );
}
