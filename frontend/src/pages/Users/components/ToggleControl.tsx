import { useId } from 'react';

import { Label } from '@/shadcn/components/ui/label';
import { Switch } from '@/shadcn/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/components/ui/tooltip';

export function ToggleControl({
  checked,
  disabled,
  label,
  onCheckedChange,
  showLabel = true,
  tooltip,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  showLabel?: boolean;
  tooltip?: string;
}) {
  const id = useId();
  const control = (
    <div className="flex items-center gap-2 text-sm">
      <Switch checked={checked} disabled={disabled} id={id} onCheckedChange={onCheckedChange} />
      <Label className={showLabel ? 'font-normal' : 'sr-only'} htmlFor={id}>
        {label}
      </Label>
    </div>
  );

  if (!tooltip) {
    return control;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex w-fit">{control}</div>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
