import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { Input } from '@/shadcn/components/ui/input';
import { cn } from '@/shadcn/lib/utils';

type InputProps = Omit<ComponentPropsWithoutRef<typeof Input>, 'onChange' | 'value'>;

export interface ComboboxOption {
  description?: string;
  id?: string;
  label: string;
  value: string;
}

interface ComboboxInputProps extends InputProps {
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  value: string;
}

export function ComboboxInput({
  className,
  disabled,
  onBlur,
  onFocus,
  onKeyDown,
  onValueChange,
  options,
  value,
  ...props
}: ComboboxInputProps) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsStyle, setSuggestionsStyle] = useState<CSSProperties | null>(null);
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const updateSuggestionsStyle = useCallback(() => {
    const inputWrapper = inputWrapperRef.current;

    if (!inputWrapper) {
      setSuggestionsStyle(null);
      return;
    }

    setSuggestionsStyle(getFloatingOptionsStyle(inputWrapper.getBoundingClientRect()));
  }, []);
  const suggestions = useMemo(() => filterOptions(options, value), [options, value]);
  const canShowSuggestions = suggestionsOpen && !disabled && suggestions.length > 0;

  useEffect(() => {
    if (!suggestionsOpen) {
      return;
    }

    window.addEventListener('resize', updateSuggestionsStyle);
    window.addEventListener('scroll', updateSuggestionsStyle, true);

    return () => {
      window.removeEventListener('resize', updateSuggestionsStyle);
      window.removeEventListener('scroll', updateSuggestionsStyle, true);
    };
  }, [suggestionsOpen, updateSuggestionsStyle]);

  const handleSelectOption = (option: ComboboxOption) => {
    onValueChange(option.value);
    setSuggestionsOpen(false);
  };

  return (
    <div ref={inputWrapperRef}>
      <Input
        aria-autocomplete="list"
        aria-expanded={canShowSuggestions}
        className={cn('text-left', className)}
        disabled={disabled}
        onBlur={(event) => {
          onBlur?.(event);
          setSuggestionsOpen(false);
        }}
        onChange={(event) => {
          onValueChange(event.target.value);
          updateSuggestionsStyle();
          setSuggestionsOpen(true);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          updateSuggestionsStyle();
          setSuggestionsOpen(true);
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);

          if (event.key === 'Escape') {
            setSuggestionsOpen(false);
          }
        }}
        role="combobox"
        value={value}
        {...props}
      />
      {canShowSuggestions && suggestionsStyle
        ? createPortal(
            <div
              className="fixed z-[60] rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={suggestionsStyle}
            >
              <div className="no-scrollbar max-h-full overflow-y-auto">
                {suggestions.map((option) => (
                  <button
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm',
                      'outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent',
                    )}
                    key={option.id ?? option.value}
                    onClick={() => handleSelectOption(option)}
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    <span className="truncate">{option.label}</span>
                    {option.description ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{option.description}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function getFloatingOptionsStyle(rect: DOMRect): CSSProperties {
  const viewportPadding = 16;
  const triggerOffset = 4;
  const preferredMaxHeight = 256;
  const minimumUsefulHeight = 160;
  const availableBelow = window.innerHeight - rect.bottom - viewportPadding - triggerOffset;
  const availableAbove = rect.top - viewportPadding - triggerOffset;
  const openAbove = availableBelow < minimumUsefulHeight && availableAbove > availableBelow;
  const maxHeight = Math.max(
    0,
    Math.min(preferredMaxHeight, openAbove ? availableAbove : Math.max(availableBelow, minimumUsefulHeight)),
  );

  return {
    left: rect.left,
    maxHeight,
    width: rect.width,
    ...(openAbove ? { bottom: window.innerHeight - rect.top + triggerOffset } : { top: rect.bottom + triggerOffset }),
  };
}

function filterOptions(options: ComboboxOption[], value: string) {
  const query = normalizeOptionQuery(value);

  if (!query) {
    return options;
  }

  return options.filter((option) => {
    const label = normalizeOptionQuery(option.label);
    const description = normalizeOptionQuery(option.description ?? '');

    return label.includes(query) || description.includes(query);
  });
}

function normalizeOptionQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}
