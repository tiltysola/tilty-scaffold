import { type ReactNode } from 'react';

import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/shadcn/components/ui/item';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/components/ui/tooltip';
import { cn } from '@/shadcn/lib/utils';

interface ProfileSectionProps {
  actionDisabled?: boolean;
  actionIcon?: ReactNode;
  actionLabel?: string;
  actionTooltip?: string;
  children: ReactNode;
  description: string;
  onAction?: () => void;
  title: string;
}

interface ProfileItemProps {
  actionDisabled?: boolean;
  actionIcon?: ReactNode;
  actionLabel?: string;
  actionTooltip?: string;
  description: ReactNode;
  icon?: ReactNode;
  media?: ReactNode;
  mediaClassName?: string;
  mediaVariant?: 'default' | 'icon' | 'image';
  onAction?: () => void;
  status?: string;
  statusVariant?: 'destructive' | 'outline' | 'secondary';
  title: string;
}

export function ProfileSection({
  actionDisabled,
  actionIcon,
  actionLabel,
  actionTooltip,
  children,
  description,
  onAction,
  title,
}: ProfileSectionProps) {
  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {onAction && actionLabel ? (
          <ActionButton
            disabled={actionDisabled}
            icon={actionIcon}
            label={actionLabel}
            onClick={onAction}
            tooltip={actionTooltip}
          />
        ) : null}
      </div>
      <ItemGroup className="gap-0! overflow-hidden rounded-lg border bg-card/25 shadow-sm backdrop-blur-md supports-backdrop-filter:bg-card/20 has-data-[size=sm]:gap-0! has-data-[size=xs]:gap-0! [&_[data-slot=item-separator]]:bg-border/25">
        {children}
      </ItemGroup>
    </section>
  );
}

export function ProfileItem({
  actionDisabled,
  actionIcon,
  actionLabel,
  actionTooltip,
  description,
  icon,
  media,
  mediaClassName,
  mediaVariant = media ? 'image' : 'default',
  onAction,
  status,
  statusVariant,
  title,
}: ProfileItemProps) {
  return (
    <Item className="rounded-none px-4 py-4 sm:flex-nowrap sm:justify-between">
      <ItemMedia
        className={cn(
          media
            ? 'overflow-hidden rounded-md bg-muted/25 text-muted-foreground group-has-data-[slot=item-description]/item:self-center group-has-data-[slot=item-description]/item:translate-y-0'
            : 'size-7 rounded-md bg-muted/25 text-muted-foreground group-has-data-[slot=item-description]/item:self-center group-has-data-[slot=item-description]/item:translate-y-0',
          mediaClassName,
        )}
        variant={mediaVariant}
      >
        {media ?? icon}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full">
          <span className="truncate">{title}</span>
          {status ? (
            <Badge className="h-5 px-1.5 text-[0.7rem]" variant={statusVariant}>
              {status}
            </Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription className="truncate text-xs">{description}</ItemDescription>
      </ItemContent>
      {onAction && actionLabel ? (
        <ItemActions className="ml-auto sm:pl-10">
          <ActionButton
            disabled={actionDisabled}
            icon={actionIcon}
            label={actionLabel}
            onClick={onAction}
            tooltip={actionTooltip}
          />
        </ItemActions>
      ) : null}
    </Item>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  onClick,
  tooltip,
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  tooltip?: string;
}) {
  const button = (
    <Button disabled={disabled} onClick={onClick} size="sm" type="button" variant="outline">
      {icon}
      {label}
    </Button>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex" tabIndex={0}>
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
