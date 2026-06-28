import * as React from 'react';

import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';

import { ScrollBar } from '@/shadcn/components/ui/scroll-area';
import { cn } from '@/shadcn/lib/utils';

type HoverScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  children: React.ReactNode;
  orientation?: 'both' | 'horizontal' | 'vertical';
  viewportClassName?: string;
};

export function HoverScrollArea({
  children,
  className,
  orientation = 'horizontal',
  scrollHideDelay = 150,
  type = 'hover',
  viewportClassName,
  ...props
}: HoverScrollAreaProps) {
  const hasHorizontalScrollbar = orientation === 'both' || orientation === 'horizontal';
  const hasVerticalScrollbar = orientation === 'both' || orientation === 'vertical';

  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative overflow-hidden', className)}
      scrollHideDelay={scrollHideDelay}
      type={type}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className={cn(
          'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {hasVerticalScrollbar ? <ScrollBar /> : null}
      {hasHorizontalScrollbar ? <ScrollBar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
