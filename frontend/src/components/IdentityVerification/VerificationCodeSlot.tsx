import { type RenderProps } from 'input-otp';

import { cn } from '@/shadcn/lib/utils';

export function VerificationCodeSlot({ slot }: { slot: RenderProps['slots'][number] }) {
  return (
    <div
      className={cn(
        'relative flex h-11 flex-1 items-center justify-center border-y border-r border-input text-base transition-all outline-none first:rounded-l-lg first:border-l last:rounded-r-lg aria-invalid:border-destructive dark:bg-input/30',
        slot.isActive &&
          'z-10 border-ring ring-3 ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
      )}
      data-active={slot.isActive}
      data-slot="verification-code-slot"
    >
      {slot.char}
      {slot.hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      ) : null}
    </div>
  );
}
