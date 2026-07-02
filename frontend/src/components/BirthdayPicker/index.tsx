import { useMemo, useState } from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import { useIntl } from 'react-intl';

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';

import { formatDateOnlyDate, getDatePickerLocale, getMonthOptions } from '@/i18n';
import { Button } from '@/shadcn/components/ui/button';
import { InputGroupButton } from '@/shadcn/components/ui/input-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/shadcn/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/components/ui/select';
import { cn } from '@/shadcn/lib/utils';

import {
  birthdayStartMonth,
  buildBirthdayYearOptions,
  clampBirthdayMonth,
  defaultBirthdayMonth,
  formatBirthdayDateOnly,
  getBirthdayMonthOffset,
  parseBirthdayDateOnly,
} from './utils';

interface BirthdayPickerProps {
  disabled?: boolean;
  id: string;
  name: string;
  onChange: (value: string) => void;
  value: string;
}

interface InteractOutsideEvent {
  target: EventTarget | null;
  preventDefault: () => void;
}

const defaultClassNames = getDefaultClassNames();

export default function Index({ disabled, id, name, onChange, value }: BirthdayPickerProps) {
  const [open, setOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(defaultBirthdayMonth);
  const intl = useIntl();
  const selectedDate = useMemo(() => parseBirthdayDateOnly(value), [value]);
  const today = useMemo(() => new Date(), []);
  const datePickerLocale = useMemo(() => getDatePickerLocale(intl.locale), [intl.locale]);
  const monthOptions = useMemo(() => getMonthOptions(intl.locale), [intl.locale]);
  const yearOptions = useMemo(() => buildBirthdayYearOptions(today), [today]);
  const displayedMonthIndex = displayMonth.getMonth();
  const displayedYear = displayMonth.getFullYear();
  const canShowPreviousMonth = getBirthdayMonthOffset(displayMonth) > getBirthdayMonthOffset(birthdayStartMonth);
  const canShowNextMonth = getBirthdayMonthOffset(displayMonth) < getBirthdayMonthOffset(today);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDisplayMonth(clampBirthdayMonth(selectedDate ?? defaultBirthdayMonth, today));
    }

    setOpen(nextOpen);
  };

  const handleSelect = (date: Date | undefined) => {
    if (!date) {
      return;
    }

    onChange(formatBirthdayDateOnly(date));
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setOpen(false);
  };

  const handleMonthSelect = (month: string) => {
    setDisplayMonth(clampBirthdayMonth(new Date(displayedYear, Number(month), 1), today));
  };

  const handleYearSelect = (year: string) => {
    setDisplayMonth(clampBirthdayMonth(new Date(Number(year), displayedMonthIndex, 1), today));
  };

  const handlePreviousMonth = () => {
    setDisplayMonth((currentMonth) =>
      clampBirthdayMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1), today),
    );
  };

  const handleNextMonth = () => {
    setDisplayMonth((currentMonth) =>
      clampBirthdayMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1), today),
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button
            className={cn(
              'w-full justify-start font-normal',
              selectedDate && 'pr-10',
              !selectedDate && 'text-muted-foreground',
            )}
            disabled={disabled}
            id={id}
            name={name}
            type="button"
            variant="outline"
          >
            <CalendarIcon />
            {selectedDate
              ? formatDateOnlyDate(selectedDate, intl.locale)
              : intl.formatMessage({ id: 'common.not.set' })}
          </Button>
        </PopoverTrigger>
        {selectedDate ? (
          <InputGroupButton
            aria-label={intl.formatMessage({ id: 'common.clear' })}
            className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground active:not-aria-[haspopup]:-translate-y-1/2"
            disabled={disabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleClear();
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <XIcon className="pointer-events-none" />
          </InputGroupButton>
        ) : null}
      </div>
      <PopoverContent
        align="start"
        className="w-[18rem] rounded-xl p-2"
        onInteractOutside={(event: InteractOutsideEvent) => {
          if (event.target instanceof HTMLElement && event.target.closest('[data-slot="select-content"]')) {
            event.preventDefault();
          }
        }}
      >
        <div className="grid grid-cols-[2rem_minmax(0,1fr)_5rem_2rem] items-center gap-1 px-1 pt-1">
          <Button
            aria-label={intl.formatMessage({ id: 'common.previous.month' })}
            className="size-8 rounded-md"
            disabled={!canShowPreviousMonth}
            onClick={handlePreviousMonth}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon />
          </Button>
          <Select onValueChange={handleMonthSelect} value={String(displayedMonthIndex)}>
            <SelectTrigger className="w-full justify-between" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="center">
              <SelectGroup>
                {monthOptions.map((month) => (
                  <SelectItem key={month.value} value={month.value}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select onValueChange={handleYearSelect} value={String(displayedYear)}>
            <SelectTrigger className="w-full justify-between" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="center">
              <SelectGroup>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            aria-label={intl.formatMessage({ id: 'common.next.month' })}
            className="size-8 rounded-md"
            disabled={!canShowNextMonth}
            onClick={handleNextMonth}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <DayPicker
          className="w-full bg-background px-1 pt-3 pb-1 [--cell-radius:var(--radius-md)] [--cell-size:2rem] in-data-[slot=popover-content]:bg-transparent"
          classNames={{
            root: cn('w-full', defaultClassNames.root),
            months: cn('relative flex w-full flex-col gap-2 md:flex-row', defaultClassNames.months),
            month: cn('flex w-full flex-col gap-2', defaultClassNames.month),
            nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', defaultClassNames.nav),
            button_previous: cn(
              'flex size-(--cell-size) items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
              defaultClassNames.button_previous,
            ),
            button_next: cn(
              'flex size-(--cell-size) items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
              defaultClassNames.button_next,
            ),
            month_caption: 'hidden',
            caption_label: 'hidden',
            month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
            weekdays: cn('flex', defaultClassNames.weekdays),
            weekday: cn(
              'flex-1 rounded-(--cell-radius) text-center text-xs font-medium text-muted-foreground select-none',
              defaultClassNames.weekday,
            ),
            week: cn('mt-1 flex w-full', defaultClassNames.week),
            day: cn(
              'group/day relative flex flex-1 items-center justify-center rounded-(--cell-radius) p-0 text-center',
              defaultClassNames.day,
            ),
            day_button: cn(
              'flex size-(--cell-size) items-center justify-center rounded-(--cell-radius) border-0 text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-data-[today=true]/day:bg-muted group-data-[today=true]/day:text-foreground group-data-[selected=true]/day:bg-primary group-data-[selected=true]/day:text-primary-foreground group-data-[selected=true]/day:hover:bg-primary group-data-[selected=true]/day:hover:text-primary-foreground',
              defaultClassNames.day_button,
            ),
            today: cn(defaultClassNames.today),
            outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaultClassNames.outside),
            disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
            hidden: cn('invisible', defaultClassNames.hidden),
            selected: cn(defaultClassNames.selected),
          }}
          hideNavigation
          disabled={(date) => date > today}
          endMonth={today}
          locale={datePickerLocale}
          mode="single"
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          onSelect={handleSelect}
          selected={selectedDate ?? undefined}
          startMonth={birthdayStartMonth}
        />
      </PopoverContent>
    </Popover>
  );
}
