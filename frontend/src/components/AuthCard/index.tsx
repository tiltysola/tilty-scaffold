import { type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';

import { routePath } from '@/router';
import { cn } from '@/shadcn/lib/utils';

import { SiteIconAttribution } from '@/components/SiteIconAttribution';

export function AuthCard({
  children,
  description,
  footer,
  footerClassName,
  maxWidth = 'sm',
  title,
}: {
  children: ReactNode;
  description: ReactNode;
  footer?: ReactNode;
  footerClassName?: string;
  maxWidth?: '2xl' | 'sm';
  title: ReactNode;
}) {
  const intl = useIntl();

  return (
    <main className="grid h-svh min-h-svh overflow-hidden bg-background text-foreground lg:grid-cols-2">
      <section className="flex min-h-0 min-w-0 flex-col gap-6 overflow-y-auto p-6 md:p-10">
        <div className="flex justify-center md:justify-start">
          <Link className="flex items-center gap-2 font-medium" to={routePath('home')}>
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <img alt="" aria-hidden="true" className="size-5 invert dark:invert-0" src="/images/magic-hat.svg" />
            </span>
            {intl.formatMessage({ id: 'app.name' })}
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-6">
          <div
            className={cn(
              'w-full [&_form]:gap-5 [&_form>.grid]:gap-2.5 [&_[data-slot=button][data-size=default]]:h-9 [&_[data-slot=button][data-size=default]]:rounded-md [&_[data-slot=button][data-size=default]]:px-4 [&_[data-slot=input]]:h-9 [&_[data-slot=input]]:rounded-md [&_[data-slot=input]]:px-3',
              maxWidth === '2xl' ? 'max-w-2xl' : 'max-w-sm',
            )}
          >
            <div className="mb-6 flex flex-col items-center gap-1 text-center">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
              <div className="text-sm text-balance text-muted-foreground">{description}</div>
            </div>
            {children}
            {footer ? <div className={cn('mt-6 flex flex-wrap', footerClassName)}>{footer}</div> : null}
          </div>
        </div>

        <SiteIconAttribution className="text-center md:text-left" />
      </section>

      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-muted lg:block">
        <div className="absolute inset-0 bg-[url('/images/home-hero-light.webp')] bg-cover bg-right dark:bg-[url('/images/home-hero.webp')]" />
        <div className="absolute inset-0 bg-linear-to-t from-black/20 via-transparent to-transparent dark:from-black/40" />
      </aside>
    </main>
  );
}
