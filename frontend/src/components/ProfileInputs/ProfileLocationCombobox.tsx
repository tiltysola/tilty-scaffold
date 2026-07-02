import { type ComponentPropsWithoutRef, type RefObject, useMemo } from 'react';

import { type ProfileOption } from '@/lib/profile-options';
import {
  Combobox,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput as ShadcnComboboxInput,
  ComboboxItem,
} from '@/shadcn/components/ui/combobox';
import { cn } from '@/shadcn/lib/utils';

import { ProfileComboboxContent } from './ProfileComboboxContent';
import { ProfileComboboxList } from './ProfileComboboxList';
import { getProfileOptionLabel, getProfileOptionValue, isProfileOptionEqualToValue } from './utils';

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'onChange' | 'value'>;

interface ProfileLocationComboboxProps extends InputProps {
  containerRef: RefObject<HTMLDivElement | null>;
  onValueChange: (value: string) => void;
  options: ProfileOption[];
  value: string;
}

export function ProfileLocationCombobox({
  className,
  containerRef,
  onValueChange,
  options,
  value,
  ...inputProps
}: ProfileLocationComboboxProps) {
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value.trim()) ?? null,
    [options, value],
  );

  return (
    <div ref={containerRef}>
      <Combobox
        inputValue={value}
        isItemEqualToValue={isProfileOptionEqualToValue}
        itemToStringLabel={getProfileOptionLabel}
        itemToStringValue={getProfileOptionValue}
        items={options}
        onInputValueChange={(nextValue) => {
          onValueChange(nextValue);
        }}
        onValueChange={(option) => {
          if (option) {
            onValueChange(option.value);
          }
        }}
        value={selectedOption}
      >
        <ShadcnComboboxInput className={cn('w-full', className)} showClear={Boolean(value)} {...inputProps} />
        <ProfileComboboxContent container={containerRef}>
          <ComboboxEmpty>{inputProps.placeholder}</ComboboxEmpty>
          <ProfileComboboxList>
            <ComboboxCollection>
              {(option: ProfileOption) => (
                <ComboboxItem key={option.id ?? option.value} value={option}>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ProfileComboboxList>
        </ProfileComboboxContent>
      </Combobox>
    </div>
  );
}
