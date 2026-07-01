import { type ReactNode } from 'react';
import { useIntl } from 'react-intl';

import { CheckIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shadcn/components/ui/sheet';

import { AppSheetBody } from '@/components/AppDialog';

import { ConfigurationTextInput, SelectControl } from './FormControls';
import { toMessagePathPart } from './utils';

export interface SetupProfileTextField<Key extends string> {
  key: Key;
  type?: 'password' | 'text';
}

interface SetupProfileSheetProps {
  children: ReactNode;
  description: ReactNode;
  title: ReactNode;
}

export function SetupProfileSheet({ children, description, title }: SetupProfileSheetProps) {
  const intl = useIntl();

  return (
    <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
      <SheetHeader className="border-b pr-12">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <AppSheetBody contentClassName="grid gap-6 px-4 py-1 pb-4">{children}</AppSheetBody>
      <SheetFooter className="border-t">
        <SheetClose asChild>
          <Button type="button">
            <CheckIcon />
            {intl.formatMessage({ id: 'common.done' })}
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}

export function SetupProfileSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-3">
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function SetupProfileTextFields<Key extends string>({
  disabled,
  fields,
  idPrefix,
  messagePrefix,
  onFieldChange,
  values,
}: {
  disabled: boolean;
  fields: Array<SetupProfileTextField<Key>>;
  idPrefix: string;
  messagePrefix: string;
  onFieldChange: (field: Key, value: string) => void;
  values: Partial<Record<Key, unknown>>;
}) {
  const intl = useIntl();

  return fields.map((field) => (
    <ConfigurationTextInput
      disabled={disabled}
      id={`${idPrefix}-${field.key}`}
      key={field.key}
      label={intl.formatMessage({ id: `${messagePrefix}.${toMessagePathPart(field.key)}.label` })}
      onChange={(fieldValue) => onFieldChange(field.key, fieldValue)}
      placeholder={intl.formatMessage({ id: `${messagePrefix}.${toMessagePathPart(field.key)}.placeholder` })}
      type={field.type}
      value={String(values[field.key] ?? '')}
    />
  ));
}

export function SetupProfileBooleanSelect({
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
}) {
  const intl = useIntl();

  return (
    <SelectControl
      disabled={disabled}
      id={id}
      label={label}
      onValueChange={(fieldValue) => onChange(fieldValue === 'true')}
      options={[
        { label: intl.formatMessage({ id: 'common.enabled' }), value: 'true' },
        { label: intl.formatMessage({ id: 'common.disabled' }), value: 'false' },
      ]}
      value={String(value)}
    />
  );
}
