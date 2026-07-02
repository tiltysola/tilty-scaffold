import { type VerificationCodeDelivery } from '@/lib/verification';

export function VerificationCodeDeliveryDescription({ delivery }: { delivery: VerificationCodeDelivery }) {
  return (
    <>
      {delivery.message} <strong className="font-semibold text-foreground">{delivery.target}</strong>.
    </>
  );
}
