import { type ComponentPropsWithoutRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import { Input } from '@/shadcn/components/ui/input';
import { Label } from '@/shadcn/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/components/ui/tooltip';

export interface SelectControlOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export function ConfigurationTextInput({
  disabled,
  id,
  label,
  onChange,
  placeholder,
  type = 'text',
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: 'password' | 'text';
  value: string;
}) {
  const inputProps = {
    autoComplete: type === 'password' ? 'new-password' : 'off',
    disabled,
    id,
    onChange: (event) => onChange?.(event.target.value),
    placeholder,
    readOnly: !onChange,
    value,
  } satisfies ComponentPropsWithoutRef<typeof Input>;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {type === 'password' ? <PasswordInput {...inputProps} /> : <Input {...inputProps} type={type} />}
    </div>
  );
}

export function PasswordInput({ className, disabled, ...props }: ComponentPropsWithoutRef<typeof Input>) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const intl = useIntl();
  const toggleLabel = intl.formatMessage({
    id: passwordVisible ? 'common.hide.password' : 'common.show.password',
  });
  const ToggleIcon = passwordVisible ? EyeOffIcon : EyeIcon;

  return (
    <div className="relative">
      <Input
        className={className ? `${className} pr-9` : 'pr-9'}
        disabled={disabled}
        type={passwordVisible ? 'text' : 'password'}
        {...props}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={toggleLabel}
            aria-pressed={passwordVisible}
            className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground hover:text-foreground active:not-aria-[haspopup]:-translate-y-1/2"
            disabled={disabled}
            onClick={() => setPasswordVisible((current) => !current)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ToggleIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{toggleLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function SelectControl({
  'aria-describedby': ariaDescribedBy,
  disabled,
  id,
  label,
  onValueChange,
  options,
  value,
}: {
  'aria-describedby'?: string;
  disabled: boolean;
  id: string;
  label?: string;
  onValueChange: (value: string) => void;
  options: SelectControlOption[];
  value: string;
}) {
  const control = (
    <Select disabled={disabled} onValueChange={onValueChange} value={value}>
      <SelectTrigger aria-describedby={ariaDescribedBy} className="w-full" id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem disabled={option.disabled} key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  if (!label) {
    return control;
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {control}
    </div>
  );
}
