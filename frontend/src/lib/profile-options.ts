import { apiRequest } from './api';

export interface ProfileOption {
  id?: string;
  label: string;
  value: string;
  description?: string;
}

interface ProfileOptionsResponse {
  options: ProfileOption[];
}

interface ProfileLocationRegionsRequest {
  country: string;
  query?: string;
}

interface ProfileLocationCitiesRequest extends ProfileLocationRegionsRequest {
  region: string;
}

export function fetchProfileGenderOptions(query = '') {
  return fetchProfileOptions('/api/profile-options/genders', {
    q: query,
  });
}

export function fetchProfileLocationCountries(query = '') {
  return fetchProfileOptions('/api/profile-options/locations/countries', {
    q: query,
  });
}

export function fetchProfileLocationRegions({ country, query = '' }: ProfileLocationRegionsRequest) {
  return fetchProfileOptions('/api/profile-options/locations/regions', {
    country,
    q: query,
  });
}

export function fetchProfileLocationCities({ country, query = '', region }: ProfileLocationCitiesRequest) {
  return fetchProfileOptions('/api/profile-options/locations/cities', {
    country,
    q: query,
    region,
  });
}

function fetchProfileOptions(apiPath: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const normalizedValue = value?.trim();

    if (normalizedValue) {
      searchParams.set(key, normalizedValue);
    }
  }

  const queryString = searchParams.toString();

  return apiRequest<ProfileOptionsResponse>(queryString ? `${apiPath}?${queryString}` : apiPath);
}
