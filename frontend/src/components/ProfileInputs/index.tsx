import { type ComponentPropsWithoutRef, useEffect, useMemo, useState } from 'react';

import {
  fetchProfileGenderOptions,
  fetchProfileLocationCities,
  fetchProfileLocationCountries,
  fetchProfileLocationRegions,
  type ProfileOption,
} from '@/lib/profile-options';
import { Input } from '@/shadcn/components/ui/input';
import { cn } from '@/shadcn/lib/utils';

type InputProps = Omit<ComponentPropsWithoutRef<typeof Input>, 'onChange' | 'value'>;

interface ProfileOptionInputProps extends InputProps {
  onValueChange: (value: string) => void;
  options: ProfileOption[];
  value: string;
}

export function ProfileGenderInput(props: InputProps & { onValueChange: (value: string) => void; value: string }) {
  const [genderOptions, setGenderOptions] = useState<ProfileOption[]>([]);
  const { value } = props;

  useEffect(() => {
    let shouldApplyOptions = true;

    void fetchProfileGenderOptions(value)
      .then(({ options }) => {
        if (shouldApplyOptions) {
          setGenderOptions(options);
        }
      })
      .catch(() => {
        if (shouldApplyOptions) {
          setGenderOptions([]);
        }
      });

    return () => {
      shouldApplyOptions = false;
    };
  }, [value]);

  return <ProfileOptionInput autoComplete="sex" options={genderOptions} placeholder="Not set" {...props} />;
}

export function ProfileLocationInput({
  className,
  disabled,
  id,
  name,
  onValueChange,
  value,
  ...props
}: InputProps & { onValueChange: (value: string) => void; value: string }) {
  const [countryOptions, setCountryOptions] = useState<ProfileOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<ProfileOption[]>([]);
  const [cityOptions, setCityOptions] = useState<ProfileOption[]>([]);
  const locationLevels = useMemo(() => parseProfileLocationLevels(value), [value]);
  const countryValue = locationLevels[0];
  const regionValue = locationLevels[1];
  const cityValue = locationLevels[2];
  const visibleRegionOptions = countryValue.trim() ? regionOptions : [];
  const visibleCityOptions = countryValue.trim() && regionValue.trim() ? cityOptions : [];

  useEffect(() => {
    let shouldApplyOptions = true;

    void fetchProfileLocationCountries(countryValue)
      .then(({ options }) => {
        if (shouldApplyOptions) {
          setCountryOptions(options);
        }
      })
      .catch(() => {
        if (shouldApplyOptions) {
          setCountryOptions([]);
        }
      });

    return () => {
      shouldApplyOptions = false;
    };
  }, [countryValue]);

  useEffect(() => {
    let shouldApplyOptions = true;

    if (!countryValue.trim()) {
      return () => {
        shouldApplyOptions = false;
      };
    }

    void fetchProfileLocationRegions({
      country: countryValue,
      query: regionValue,
    })
      .then(({ options }) => {
        if (shouldApplyOptions) {
          setRegionOptions(options);
        }
      })
      .catch(() => {
        if (shouldApplyOptions) {
          setRegionOptions([]);
        }
      });

    return () => {
      shouldApplyOptions = false;
    };
  }, [countryValue, regionValue]);

  useEffect(() => {
    let shouldApplyOptions = true;

    if (!countryValue.trim() || !regionValue.trim()) {
      return () => {
        shouldApplyOptions = false;
      };
    }

    void fetchProfileLocationCities({
      country: countryValue,
      query: cityValue,
      region: regionValue,
    })
      .then(({ options }) => {
        if (shouldApplyOptions) {
          setCityOptions(options);
        }
      })
      .catch(() => {
        if (shouldApplyOptions) {
          setCityOptions([]);
        }
      });

    return () => {
      shouldApplyOptions = false;
    };
  }, [cityValue, countryValue, regionValue]);

  const updateLocationLevel = (index: number, nextValue: string) => {
    const nextLocationLevels = [...locationLevels] as ProfileLocationLevels;

    nextLocationLevels[index] = nextValue;

    for (let nextIndex = index + 1; nextIndex < nextLocationLevels.length; nextIndex += 1) {
      nextLocationLevels[nextIndex] = '';
    }

    onValueChange(formatProfileLocationLevels(nextLocationLevels));
  };

  return (
    <div className="grid gap-2">
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <ProfileOptionInput
        autoComplete="country-name"
        className={className}
        disabled={disabled}
        id={id}
        onValueChange={(nextValue) => updateLocationLevel(0, nextValue)}
        options={countryOptions}
        placeholder="Country or region"
        value={countryValue}
        {...props}
      />
      <ProfileOptionInput
        autoComplete="address-level1"
        className={className}
        disabled={disabled}
        id={id ? `${id}-region` : undefined}
        onValueChange={(nextValue) => updateLocationLevel(1, nextValue)}
        options={visibleRegionOptions}
        placeholder="Region or state"
        value={regionValue}
      />
      <ProfileOptionInput
        autoComplete="address-level2"
        className={className}
        disabled={disabled}
        id={id ? `${id}-locality` : undefined}
        onValueChange={(nextValue) => updateLocationLevel(2, nextValue)}
        options={visibleCityOptions}
        placeholder="City or district"
        value={cityValue}
      />
    </div>
  );
}

function ProfileOptionInput({
  className,
  disabled,
  onBlur,
  onFocus,
  onKeyDown,
  onValueChange,
  options,
  value,
  ...props
}: ProfileOptionInputProps) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const suggestions = useMemo(() => filterProfileOptions(options, value), [options, value]);
  const canShowSuggestions = suggestionsOpen && !disabled && suggestions.length > 0;

  const handleSelectOption = (option: ProfileOption) => {
    onValueChange(option.value);
    setSuggestionsOpen(false);
  };

  return (
    <div className="relative">
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
          setSuggestionsOpen(true);
        }}
        onFocus={(event) => {
          onFocus?.(event);
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
      {canShowSuggestions ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <div className="no-scrollbar max-h-64 overflow-y-auto">
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
        </div>
      ) : null}
    </div>
  );
}

function filterProfileOptions(options: ProfileOption[], value: string) {
  const query = normalizeProfileOptionQuery(value);

  if (!query) {
    return options;
  }

  return options.filter((option) => {
    const label = normalizeProfileOptionQuery(option.label);
    const description = normalizeProfileOptionQuery(option.description ?? '');

    return label.includes(query) || description.includes(query);
  });
}

function normalizeProfileOptionQuery(value: string) {
  return value.trim().toLocaleLowerCase();
}

type ProfileLocationLevels = [string, string, string];

function parseProfileLocationLevels(value: string): ProfileLocationLevels {
  const [country = '', region = '', locality = ''] = value.split(',').map((part) => part.trim());

  return [country, region, locality];
}

function formatProfileLocationLevels(levels: ProfileLocationLevels) {
  const normalizedLevels = levels.map((level) => level.trim());
  let lastValueIndex = -1;

  for (let index = normalizedLevels.length - 1; index >= 0; index -= 1) {
    if (normalizedLevels[index]) {
      lastValueIndex = index;
      break;
    }
  }

  if (lastValueIndex < 0) {
    return '';
  }

  return normalizedLevels
    .slice(0, lastValueIndex + 1)
    .filter(Boolean)
    .join(', ');
}
