import { type ReactNode } from 'react';

import { ItemGroup } from '@/shadcn/components/ui/item';

export function SecuritySection({
  actions,
  children,
  description,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-base font-medium tracking-normal">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <ItemGroup className="gap-0! overflow-hidden rounded-lg border bg-card/25 shadow-sm backdrop-blur-md supports-backdrop-filter:bg-card/20 has-data-[size=sm]:gap-0! has-data-[size=xs]:gap-0! [&_[data-slot=item-separator]]:bg-border/25">
        {children}
      </ItemGroup>
    </section>
  );
}
