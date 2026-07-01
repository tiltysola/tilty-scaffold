import { type ReactNode } from 'react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { cn } from '@/shadcn/lib/utils';

type AppEmptyStateTone = 'default' | 'destructive';

interface AppEmptyStateProps {
  actions?: ReactNode;
  actionsClassName?: string;
  className?: string;
  description: ReactNode;
  icon?: ReactNode;
  iconClassName?: string;
  title: ReactNode;
  tone?: AppEmptyStateTone;
}

function getIconClassName(tone: AppEmptyStateTone, iconClassName?: string) {
  return cn(tone === 'destructive' ? 'bg-destructive/10 text-destructive' : undefined, iconClassName);
}

export function AppEmptyState({
  actions,
  actionsClassName,
  className,
  description,
  icon,
  iconClassName,
  title,
  tone = 'default',
}: AppEmptyStateProps) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        {icon ? (
          <EmptyMedia className={getIconClassName(tone, iconClassName)} variant="icon">
            {icon}
          </EmptyMedia>
        ) : null}
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {actions ? <EmptyContent className={actionsClassName}>{actions}</EmptyContent> : null}
    </Empty>
  );
}
