import { type ReactNode } from 'react';

import { Button } from '@/shadcn/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/components/ui/tooltip';

interface ActionButtonProps {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  tooltip?: string;
}

export function ActionButton({ disabled, icon, label, onClick, tooltip }: ActionButtonProps) {
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
