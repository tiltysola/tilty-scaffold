import { type ProfileOption } from '@/lib/profile-options';

export type ProfileLocationLevels = [string, string, string];

export function getProfileOptionsWithValueFallback(options: ProfileOption[], value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue || options.some((option) => option.value === normalizedValue)) {
    return options;
  }

  return [
    {
      id: `custom:${encodeURIComponent(normalizedValue)}`,
      label: normalizedValue,
      value: normalizedValue,
    },
    ...options,
  ];
}

export function getProfileOptionLabel(option: ProfileOption | null) {
  return option?.label ?? '';
}

export function getProfileOptionValue(option: ProfileOption | null) {
  return option?.value ?? '';
}

export function isProfileOptionEqualToValue(option: ProfileOption, value: ProfileOption) {
  return option.value === value.value;
}

export function getProfileLocationParentKey(country: string, region: string) {
  return `${country.trim()}\u0000${region.trim()}`;
}

export function parseProfileLocationLevels(value: string): ProfileLocationLevels {
  const [country = '', region = '', locality = ''] = value.split(',').map((part) => part.trim());

  return [country, region, locality];
}

export function formatProfileLocationLevels(levels: ProfileLocationLevels) {
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
