import { cn } from '@/shadcn/lib/utils';
import { Combobox as ComboboxPrimitive } from '@base-ui/react';

export function ProfileComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        'max-h-[min(18rem,calc(var(--available-height)_-_2.25rem))] scroll-py-1 overflow-x-hidden overflow-y-auto overscroll-contain p-1 data-empty:p-0',
        className,
      )}
      {...props}
    />
  );
}
