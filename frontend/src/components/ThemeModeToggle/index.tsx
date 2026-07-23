import { useIntl } from 'react-intl';

import { type LucideIcon, MoonIcon, SunIcon } from 'lucide-react';

import { Button } from '@/shadcn/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { cn } from '@/shadcn/lib/utils';

import { type AppThemeMode, useThemeMode } from '@/components/ThemeProvider/theme-mode';

interface ThemeModeOption {
  icon: LucideIcon | typeof ShadcnThemeIcon;
  labelMessageId: 'theme.mode.auto' | 'theme.mode.dark' | 'theme.mode.light';
  value: AppThemeMode;
}

interface ThemeModeToggleProps {
  className?: string;
}

const themeModeOptions: ThemeModeOption[] = [
  {
    icon: ShadcnThemeIcon,
    labelMessageId: 'theme.mode.auto',
    value: 'auto',
  },
  {
    icon: SunIcon,
    labelMessageId: 'theme.mode.light',
    value: 'light',
  },
  {
    icon: MoonIcon,
    labelMessageId: 'theme.mode.dark',
    value: 'dark',
  },
];

export function ThemeModeToggle({ className }: ThemeModeToggleProps) {
  const intl = useIntl();
  const { mode, setMode } = useThemeMode();
  const activeOption = themeModeOptions.find((option) => option.value === mode) ?? themeModeOptions[0];
  const ActiveIcon = activeOption.icon;
  const switcherLabel = intl.formatMessage({ id: 'theme.mode.switcher' });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={switcherLabel}
          className={cn('group/toggle size-8 shrink-0', className)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ActiveIcon />
          <span className="sr-only">{switcherLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuLabel>{switcherLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={(value: string) => {
            if (isThemeMode(value)) {
              setMode(value);
            }
          }}
          value={mode}
        >
          {themeModeOptions.map((option) => {
            const Icon = option.icon;
            const label = intl.formatMessage({ id: option.labelMessageId });

            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <Icon />
                {label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isThemeMode(value: string): value is AppThemeMode {
  return value === 'auto' || value === 'dark' || value === 'light';
}

function ShadcnThemeIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4.5"
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 0h24v24H0z" fill="none" stroke="none" />
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M12 3l0 18" />
      <path d="M12 9l4.65 -4.65" />
      <path d="M12 14.3l7.37 -7.37" />
      <path d="M12 19.6l8.85 -8.85" />
    </svg>
  );
}
