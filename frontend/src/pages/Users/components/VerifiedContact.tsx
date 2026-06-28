import { CheckIcon, XIcon } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/components/ui/tooltip';

export function VerifiedContact({
  label,
  placeholder = false,
  value,
  verified,
}: {
  label: string;
  placeholder?: boolean;
  value: string;
  verified: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`min-w-0 truncate text-sm ${placeholder ? 'text-muted-foreground/70' : ''}`}>{value}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full ${
              verified ? 'bg-primary/10 text-primary' : 'bg-muted/25 text-muted-foreground'
            }`}
            tabIndex={0}
          >
            {verified ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
            <span className="sr-only">{`${label} ${verified ? 'verified' : 'unverified'}`}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{`${label} ${verified ? 'verified' : 'unverified'}`}</TooltipContent>
      </Tooltip>
    </div>
  );
}
