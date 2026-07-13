import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

import { CalendarIcon } from 'lucide-react';

import { formatDateOnlyDate, getDatePickerLocale } from '@/i18n';
import { Button } from '@/shadcn/components/ui/button';
import { Calendar } from '@/shadcn/components/ui/calendar';
import { Field, FieldLabel } from '@/shadcn/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/shadcn/components/ui/popover';
import { cn } from '@/shadcn/lib/utils';

import { formatDateTimeLocalValue, isBeforeToday, mergeExpirationDate, parseExpirationValue } from '../utils';

export function ApiKeyExpirationField({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  const [open, setOpen] = useState(false);
  const intl = useIntl();
  const selectedDate = useMemo(() => parseExpirationValue(value), [value]);
  const datePickerLocale = useMemo(() => getDatePickerLocale(intl.locale), [intl.locale]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      return;
    }

    onChange(formatDateTimeLocalValue(mergeExpirationDate(date)));
    setOpen(false);
  };

  return (
    <Field>
      <FieldLabel htmlFor="api-key-expires-at">{intl.formatMessage({ id: 'api.keys.expires.at' })}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            className={cn('w-full justify-start font-normal', !selectedDate && 'text-muted-foreground')}
            id="api-key-expires-at"
            type="button"
            variant="outline"
          >
            <CalendarIcon data-icon="inline-start" />
            {selectedDate
              ? formatDateOnlyDate(selectedDate, intl.locale)
              : intl.formatMessage({ id: 'common.not.set' })}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            disabled={(date) => isBeforeToday(date)}
            locale={datePickerLocale}
            mode="single"
            onSelect={handleDateSelect}
            selected={selectedDate ?? undefined}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
