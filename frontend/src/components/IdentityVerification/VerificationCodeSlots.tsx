import { type RenderProps } from 'input-otp';

import { VerificationCodeSlot } from './VerificationCodeSlot';

export function VerificationCodeSlots({ slots }: { slots: RenderProps['slots'] }) {
  return (
    <div className="flex w-full items-center rounded-lg has-aria-invalid:border-destructive has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40">
      {slots.map((slot, index) => (
        <VerificationCodeSlot key={index} slot={slot} />
      ))}
    </div>
  );
}
