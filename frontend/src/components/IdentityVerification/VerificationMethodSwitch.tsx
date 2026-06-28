import { type VerificationMethodName } from '@/lib/auth';
import { Button } from '@/shadcn/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';

interface VerificationMethodSwitchOption {
  method: VerificationMethodName;
  label: string;
}

interface VerificationMethodSwitchProps {
  currentMethod: VerificationMethodName;
  disabled?: boolean;
  methods: VerificationMethodSwitchOption[];
  onChange: (method: VerificationMethodName) => void;
  onOpen?: () => void;
}

const VerificationMethodSwitch = ({
  currentMethod,
  disabled = false,
  methods,
  onChange,
  onOpen,
}: VerificationMethodSwitchProps) => {
  const current = methods.find((method) => method.method === currentMethod);
  const alternatives = methods.filter((method) => method.method !== currentMethod);

  if (methods.length <= 1 || alternatives.length === 0) {
    return null;
  }

  return (
    <span className="flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5 text-right text-xs font-normal text-muted-foreground">
      <span>{getUnavailableLabel(current)}</span>
      <DropdownMenu onOpenChange={(open: boolean) => (open ? onOpen?.() : undefined)}>
        <DropdownMenuTrigger asChild>
          <Button className="h-auto p-0 text-xs font-medium" disabled={disabled} type="button" variant="link">
            Switch method
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {alternatives.map((method) => (
            <DropdownMenuItem key={method.method} onSelect={() => onChange(method.method)}>
              {method.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
};

function getUnavailableLabel(current: VerificationMethodSwitchOption | undefined) {
  if (current?.method === 'totp') {
    return 'App unavailable?';
  }

  return `${current?.label ?? 'This method'} unavailable?`;
}

export default VerificationMethodSwitch;
