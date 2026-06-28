import { useMemo, useState } from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
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

const birthdayStartMonth = new Date(1900, 0, 1);
const defaultBirthdayMonth = new Date(2000, 0, 1);
const defaultClassNames = getDefaultClassNames();
const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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

export default function BirthdayPicker({ disabled, id, name, onChange, value }: BirthdayPickerProps) {
  const [open, setOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(defaultBirthdayMonth);
  const selectedDate = useMemo(() => parseDateOnly(value), [value]);
  const today = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => buildYearOptions(today), [today]);
  const displayedMonthIndex = displayMonth.getMonth();
  const displayedYear = displayMonth.getFullYear();
  const canShowPreviousMonth = getMonthOffset(displayMonth) > getMonthOffset(birthdayStartMonth);
  const canShowNextMonth = getMonthOffset(displayMonth) < getMonthOffset(today);

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

    onChange(formatDateOnly(date));
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
      <PopoverTrigger asChild>
        <Button
          className={cn('w-full justify-start font-normal', !selectedDate && 'text-muted-foreground')}
          disabled={disabled}
          id={id}
          name={name}
          type="button"
          variant="outline"
        >
          <CalendarIcon />
          {selectedDate ? formatDateOnly(selectedDate) : 'Not set'}
        </Button>
      </PopoverTrigger>
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
            aria-label="Previous month"
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
                {monthNames.map((month, index) => (
                  <SelectItem key={month} value={String(index)}>
                    {month}
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
            aria-label="Next month"
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
          className="w-full bg-background px-1 pt-3 pb-1 [--cell-radius:var(--radius-md)] [--cell-size:2rem]"
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
              'relative flex flex-1 items-center justify-center rounded-(--cell-radius) p-0 text-center',
              defaultClassNames.day,
            ),
            day_button: cn(
              'flex size-(--cell-size) items-center justify-center rounded-(--cell-radius) border-0 text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-selected:bg-primary aria-selected:text-primary-foreground',
              defaultClassNames.day_button,
            ),
            today: cn('rounded-(--cell-radius) bg-muted text-foreground', defaultClassNames.today),
            outside: cn('text-muted-foreground aria-selected:text-muted-foreground', defaultClassNames.outside),
            disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
            hidden: cn('invisible', defaultClassNames.hidden),
            selected: cn('bg-primary text-primary-foreground', defaultClassNames.selected),
          }}
          hideNavigation
          disabled={(date) => date > today}
          endMonth={today}
          mode="single"
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          onSelect={handleSelect}
          selected={selectedDate ?? undefined}
          startMonth={birthdayStartMonth}
        />
        {selectedDate ? (
          <div className="border-t pt-2">
            <Button className="w-full justify-start" onClick={handleClear} size="sm" type="button" variant="ghost">
              <XIcon />
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function buildYearOptions(today: Date) {
  const years: string[] = [];

  for (let year = today.getFullYear(); year >= birthdayStartMonth.getFullYear(); year -= 1) {
    years.push(String(year));
  }

  return years;
}

function clampBirthdayMonth(month: Date, today: Date) {
  const monthOffset = getMonthOffset(month);
  const startOffset = getMonthOffset(birthdayStartMonth);
  const endOffset = getMonthOffset(today);

  if (monthOffset < startOffset) {
    return birthdayStartMonth;
  }

  if (monthOffset > endOffset) {
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return new Date(month.getFullYear(), month.getMonth(), 1);
}

function getMonthOffset(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  return formatDateOnly(date) === value ? date : null;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
