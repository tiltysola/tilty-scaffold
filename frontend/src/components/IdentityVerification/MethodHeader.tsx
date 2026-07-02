import { Label } from '@/shadcn/components/ui/label';

import { type LocalizedVerificationMethod } from './types';
import VerificationMethodSwitch from './VerificationMethodSwitch';

interface MethodHeaderProps {
  currentMethod: LocalizedVerificationMethod['method'];
  disabled: boolean;
  htmlFor?: string;
  label: string;
  methods: LocalizedVerificationMethod[];
  onChange: (method: LocalizedVerificationMethod['method']) => void;
  onSwitchOpen: () => void;
}

export function MethodHeader({
  currentMethod,
  disabled,
  htmlFor,
  label,
  methods,
  onChange,
  onSwitchOpen,
}: MethodHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Label htmlFor={htmlFor}>{label}</Label>
      <VerificationMethodSwitch
        currentMethod={currentMethod}
        disabled={disabled}
        methods={methods}
        onChange={onChange}
        onOpen={onSwitchOpen}
      />
    </div>
  );
}
