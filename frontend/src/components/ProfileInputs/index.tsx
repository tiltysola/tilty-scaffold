import { type ComponentPropsWithoutRef, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import {
  fetchProfileGenderOptions,
  fetchProfileLocationCities,
  fetchProfileLocationCountries,
  fetchProfileLocationRegions,
  type ProfileOption,
} from '@/lib/profile-options';
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
import { ProfileLocationCombobox } from './ProfileLocationCombobox';
import {
  formatProfileLocationLevels,
  getProfileLocationParentKey,
  getProfileOptionLabel,
  getProfileOptionsWithValueFallback,
  getProfileOptionValue,
  isProfileOptionEqualToValue,
  parseProfileLocationLevels,
  type ProfileLocationLevels,
} from './utils';

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'onChange' | 'value'>;

export function ProfileGenderInput({
  className,
  name,
  onValueChange,
  value,
  ...inputProps
}: InputProps & { onValueChange: (value: string) => void; value: string }) {
  const [genderOptions, setGenderOptions] = useState<ProfileOption[]>([]);
  const comboboxPortalContainerRef = useRef<HTMLDivElement | null>(null);
  const intl = useIntl();
  const comboboxOptions = useMemo(
    () => getProfileOptionsWithValueFallback(genderOptions, value),
    [genderOptions, value],
  );
  const selectedOption = useMemo(
    () => comboboxOptions.find((option) => option.value === value.trim()) ?? null,
    [comboboxOptions, value],
  );

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

  return (
    <>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <div ref={comboboxPortalContainerRef}>
        <Combobox
          inputValue={value}
          isItemEqualToValue={isProfileOptionEqualToValue}
          itemToStringLabel={getProfileOptionLabel}
          itemToStringValue={getProfileOptionValue}
          items={comboboxOptions}
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
          <ShadcnComboboxInput
            className={cn('w-full', className)}
            placeholder={intl.formatMessage({ id: 'common.not.set' })}
            showClear={Boolean(value)}
            {...inputProps}
            autoComplete="sex"
          />
          <ProfileComboboxContent container={comboboxPortalContainerRef}>
            <ComboboxEmpty>{intl.formatMessage({ id: 'common.not.set' })}</ComboboxEmpty>
            <ProfileComboboxList>
              <ComboboxCollection>
                {(option: ProfileOption) => (
                  <ComboboxItem key={option.id ?? option.value} value={option}>
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.description ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{option.description}</span>
                    ) : null}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ProfileComboboxList>
          </ProfileComboboxContent>
        </Combobox>
      </div>
    </>
  );
}

export function ProfileLocationInput({
  className,
  disabled,
  id,
  name,
  onValueChange,
  value,
  ...inputProps
}: InputProps & { onValueChange: (value: string) => void; value: string }) {
  const [countryOptions, setCountryOptions] = useState<ProfileOption[]>([]);
  const [regionOptions, setRegionOptions] = useState<ProfileOption[]>([]);
  const [regionOptionsCountry, setRegionOptionsCountry] = useState('');
  const [cityOptions, setCityOptions] = useState<ProfileOption[]>([]);
  const [cityOptionsParentKey, setCityOptionsParentKey] = useState('');
  const countryComboboxPortalContainerRef = useRef<HTMLDivElement | null>(null);
  const regionComboboxPortalContainerRef = useRef<HTMLDivElement | null>(null);
  const cityComboboxPortalContainerRef = useRef<HTMLDivElement | null>(null);
  const intl = useIntl();
  const locationLevels = useMemo(() => parseProfileLocationLevels(value), [value]);
  const countryValue = locationLevels[0];
  const regionValue = locationLevels[1];
  const cityValue = locationLevels[2];
  const selectedCityOptionsParentKey = getProfileLocationParentKey(countryValue, regionValue);
  const visibleRegionOptions = useMemo(
    () => (countryValue.trim() && regionOptionsCountry === countryValue ? regionOptions : []),
    [countryValue, regionOptions, regionOptionsCountry],
  );
  const visibleCityOptions = useMemo(
    () =>
      countryValue.trim() && regionValue.trim() && cityOptionsParentKey === selectedCityOptionsParentKey
        ? cityOptions
        : [],
    [cityOptions, cityOptionsParentKey, countryValue, regionValue, selectedCityOptionsParentKey],
  );
  const countryComboboxOptions = useMemo(
    () => getProfileOptionsWithValueFallback(countryOptions, countryValue),
    [countryOptions, countryValue],
  );
  const regionComboboxOptions = useMemo(
    () => getProfileOptionsWithValueFallback(visibleRegionOptions, regionValue),
    [regionValue, visibleRegionOptions],
  );
  const cityComboboxOptions = useMemo(
    () => getProfileOptionsWithValueFallback(visibleCityOptions, cityValue),
    [cityValue, visibleCityOptions],
  );

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
          setRegionOptionsCountry(countryValue);
        }
      })
      .catch(() => {
        if (shouldApplyOptions) {
          setRegionOptions([]);
          setRegionOptionsCountry(countryValue);
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
          setCityOptionsParentKey(selectedCityOptionsParentKey);
        }
      })
      .catch(() => {
        if (shouldApplyOptions) {
          setCityOptions([]);
          setCityOptionsParentKey(selectedCityOptionsParentKey);
        }
      });

    return () => {
      shouldApplyOptions = false;
    };
  }, [cityValue, countryValue, regionValue, selectedCityOptionsParentKey]);

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
      <ProfileLocationCombobox
        className={className}
        containerRef={countryComboboxPortalContainerRef}
        disabled={disabled}
        id={id}
        onValueChange={(nextValue) => {
          updateLocationLevel(0, nextValue);
        }}
        options={countryComboboxOptions}
        placeholder={intl.formatMessage({ id: 'profile.placeholder.country' })}
        value={countryValue}
        {...inputProps}
      />
      <ProfileLocationCombobox
        className={className}
        containerRef={regionComboboxPortalContainerRef}
        disabled={disabled || !countryValue.trim()}
        id={id ? `${id}-region` : undefined}
        onValueChange={(nextValue) => {
          updateLocationLevel(1, nextValue);
        }}
        options={regionComboboxOptions}
        placeholder={intl.formatMessage({ id: 'profile.placeholder.region' })}
        value={regionValue}
      />
      <ProfileLocationCombobox
        className={className}
        containerRef={cityComboboxPortalContainerRef}
        disabled={disabled || !countryValue.trim() || !regionValue.trim()}
        id={id ? `${id}-locality` : undefined}
        onValueChange={(nextValue) => {
          updateLocationLevel(2, nextValue);
        }}
        options={cityComboboxOptions}
        placeholder={intl.formatMessage({ id: 'profile.placeholder.city' })}
        value={cityValue}
      />
    </div>
  );
}
