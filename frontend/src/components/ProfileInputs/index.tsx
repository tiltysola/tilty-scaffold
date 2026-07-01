import { type ComponentPropsWithoutRef, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';

import {
  fetchProfileGenderOptions,
  fetchProfileLocationCities,
  fetchProfileLocationCountries,
  fetchProfileLocationRegions,
  type ProfileOption,
} from '@/lib/profile-options';

import { ComboboxInput } from '@/components/ComboboxInput';

type InputProps = Omit<ComponentPropsWithoutRef<typeof ComboboxInput>, 'onValueChange' | 'options' | 'value'>;
type ProfileLocationLevels = [string, string, string];

export function ProfileGenderInput(props: InputProps & { onValueChange: (value: string) => void; value: string }) {
  const [genderOptions, setGenderOptions] = useState<ProfileOption[]>([]);
  const intl = useIntl();
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

  return (
    <ComboboxInput
      autoComplete="sex"
      options={genderOptions}
      placeholder={intl.formatMessage({ id: 'common.not.set' })}
      {...props}
    />
  );
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
  const intl = useIntl();
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
      <ComboboxInput
        autoComplete="country-name"
        className={className}
        disabled={disabled}
        id={id}
        onValueChange={(nextValue) => updateLocationLevel(0, nextValue)}
        options={countryOptions}
        placeholder={intl.formatMessage({ id: 'profile.placeholder.country' })}
        value={countryValue}
        {...props}
      />
      <ComboboxInput
        autoComplete="address-level1"
        className={className}
        disabled={disabled}
        id={id ? `${id}-region` : undefined}
        onValueChange={(nextValue) => updateLocationLevel(1, nextValue)}
        options={visibleRegionOptions}
        placeholder={intl.formatMessage({ id: 'profile.placeholder.region' })}
        value={regionValue}
      />
      <ComboboxInput
        autoComplete="address-level2"
        className={className}
        disabled={disabled}
        id={id ? `${id}-locality` : undefined}
        onValueChange={(nextValue) => updateLocationLevel(2, nextValue)}
        options={visibleCityOptions}
        placeholder={intl.formatMessage({ id: 'profile.placeholder.city' })}
        value={cityValue}
      />
    </div>
  );
}

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
