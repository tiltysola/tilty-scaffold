import {
  getCitiesOfState,
  getCountries,
  getStatesOfCountry,
  type ICity,
  type ICountry,
  type IState,
} from '@countrystatecity/countries';
import { type Middleware } from 'koa';

import { ok } from '../../core/http';
import { type BackendModule } from '../../core/module';
import { type AuthCookieConfig, getAuthToken } from '../auth/auth.http';

export interface ProfileOptionsAuthService {
  authenticate: (token: string) => Promise<unknown>;
}

interface ProfileOptionsModuleOptions {
  authService: ProfileOptionsAuthService;
  cookies: AuthCookieConfig;
}

export interface ProfileOptionsUserService {
  listDistinctProfileGenders: () => Promise<string[]>;
}

export interface ProfileOption {
  id: string;
  label: string;
  value: string;
  description?: string;
}

const defaultProfileGenderValues = ['Male', 'Female', 'Secret'] as const;
const customProfileGenderOptionLimit = 30;

export function createProfileOptionsModule(
  userService: ProfileOptionsUserService,
  options: ProfileOptionsModuleOptions,
): BackendModule {
  const requireAuthenticated: Middleware = async (ctx, next) => {
    ctx.state.auth = await options.authService.authenticate(getAuthToken(ctx, options.cookies));

    await next();
  };

  const getGenders: Middleware = async (ctx) => {
    const query = getQueryText(ctx.query.q);
    const customGenders = await userService.listDistinctProfileGenders();

    ctx.body = ok({
      options: buildGenderOptions(customGenders, query),
    });
  };

  const getLocationCountries: Middleware = async (ctx) => {
    const query = getQueryText(ctx.query.q);

    ctx.body = ok({
      options: await buildCountryOptions(query),
    });
  };

  const getLocationRegions: Middleware = async (ctx) => {
    const country = await resolveCountry(getQueryText(ctx.query.country));
    const query = getQueryText(ctx.query.q);

    ctx.body = ok({
      options: country ? await buildRegionOptions(country, query) : [],
    });
  };

  const getLocationCities: Middleware = async (ctx) => {
    const country = await resolveCountry(getQueryText(ctx.query.country));
    const region = country ? await resolveRegion(country, getQueryText(ctx.query.region)) : undefined;
    const query = getQueryText(ctx.query.q);

    ctx.body = ok({
      options: region ? await buildCityOptions(region, query) : [],
    });
  };

  return {
    name: 'profile-options',
    prefix: '/api/profile-options',
    routes: [
      {
        method: 'get',
        path: '/genders',
        handlers: [requireAuthenticated, getGenders],
      },
      {
        method: 'get',
        path: '/locations/countries',
        handlers: [getLocationCountries],
      },
      {
        method: 'get',
        path: '/locations/regions',
        handlers: [getLocationRegions],
      },
      {
        method: 'get',
        path: '/locations/cities',
        handlers: [getLocationCities],
      },
    ],
  };
}

function buildGenderOptions(customGenders: string[], query: string): ProfileOption[] {
  const normalizedQuery = normalizeOptionText(query);
  const defaultOptions = defaultProfileGenderValues.filter((gender) => matchesOptionQuery(gender, normalizedQuery));
  const defaultGenderSet = new Set(defaultProfileGenderValues.map(normalizeOptionText));
  const customOptions = shuffleProfileOptionValues(
    getUniqueOptionValues(customGenders)
      .filter((gender) => !defaultGenderSet.has(normalizeOptionText(gender)))
      .filter((gender) => matchesOptionQuery(gender, normalizedQuery)),
  ).slice(0, customProfileGenderOptionLimit);

  return [...defaultOptions, ...customOptions].map(toGenderOption);
}

async function buildCountryOptions(query: string): Promise<ProfileOption[]> {
  return filterLocationRecords(
    await getCountries(),
    query,
    (country) => [country.name, country.native, country.iso2, country.iso3, country.region, country.subregion],
    toCountryOption,
  );
}

async function buildRegionOptions(country: ICountry, query: string): Promise<ProfileOption[]> {
  return filterLocationRecords(
    await getStatesOfCountry(country.iso2),
    query,
    (region) => [region.name, region.iso2],
    (region) => toRegionOption(region, country),
  );
}

async function buildCityOptions(region: IState, query: string): Promise<ProfileOption[]> {
  return filterLocationRecords(
    await getCitiesOfState(region.country_code, region.iso2),
    query,
    (city) => [city.name],
    (city) => toCityOption(city, region),
  );
}

function filterLocationRecords<T>(
  records: T[],
  query: string,
  getSearchValues: (record: T) => Array<string | undefined>,
  toOption: (record: T) => ProfileOption,
) {
  const normalizedQuery = normalizeOptionText(query);
  const filteredRecords = normalizedQuery
    ? records.filter((record) =>
        getSearchValues(record).some((value) => normalizeOptionText(value).includes(normalizedQuery)),
      )
    : records;

  return filteredRecords.map(toOption);
}

async function resolveCountry(input: string) {
  const countries = await getCountries();
  const normalizedInput = normalizeOptionText(input);

  if (!normalizedInput) {
    return undefined;
  }

  const countryId = parseLocationRecordId(input, 'country');

  if (countryId !== undefined) {
    const country = countries.find((candidate) => candidate.id === countryId);

    if (country) {
      return country;
    }
  }

  return (
    countries.find((country) =>
      [country.name, country.native, country.iso2, country.iso3].some(
        (value) => normalizeOptionText(value) === normalizedInput,
      ),
    ) ??
    countries.find((country) =>
      [country.name, country.native, country.iso2, country.iso3].some((value) =>
        normalizeOptionText(value).includes(normalizedInput),
      ),
    )
  );
}

async function resolveRegion(country: ICountry, input: string) {
  const regions = await getStatesOfCountry(country.iso2);
  const normalizedInput = normalizeOptionText(input);

  if (!normalizedInput) {
    return undefined;
  }

  const regionId = parseLocationRecordId(input, 'region');

  if (regionId !== undefined) {
    const region = regions.find((candidate) => candidate.id === regionId);

    if (region) {
      return region;
    }
  }

  return (
    regions.find((region) =>
      [region.name, region.iso2].some((value) => normalizeOptionText(value) === normalizedInput),
    ) ??
    regions.find((region) =>
      [region.name, region.iso2].some((value) => normalizeOptionText(value).includes(normalizedInput)),
    )
  );
}

function toCountryOption(country: ICountry): ProfileOption {
  return {
    id: `country:${country.id}`,
    label: country.name,
    value: country.name,
    description: country.iso2,
  };
}

function toRegionOption(region: IState, country: ICountry): ProfileOption {
  return {
    id: `region:${region.id}`,
    label: region.name,
    value: region.name,
    description: region.iso2 || country.iso2,
  };
}

function toCityOption(city: ICity, region: IState): ProfileOption {
  return {
    id: `city:${city.id}`,
    label: city.name,
    value: city.name,
    description: region.iso2 || city.country_code,
  };
}

function toGenderOption(gender: string): ProfileOption {
  return {
    id: `gender:${encodeURIComponent(gender)}`,
    label: gender,
    value: gender,
  };
}

function getUniqueOptionValues(values: string[]) {
  const optionValues = new Map<string, string>();

  for (const value of values) {
    const normalizedValue = value.trim();
    const normalizedKey = normalizeOptionText(normalizedValue);

    if (normalizedValue && !optionValues.has(normalizedKey)) {
      optionValues.set(normalizedKey, normalizedValue);
    }
  }

  return [...optionValues.values()];
}

function shuffleProfileOptionValues(values: string[]) {
  const shuffledValues = [...values];

  for (let index = shuffledValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentValue = shuffledValues[index]!;

    shuffledValues[index] = shuffledValues[swapIndex]!;
    shuffledValues[swapIndex] = currentValue;
  }

  return shuffledValues;
}

function matchesOptionQuery(value: string, normalizedQuery: string) {
  return !normalizedQuery || normalizeOptionText(value).includes(normalizedQuery);
}

function getQueryText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseLocationRecordId(value: string, type: 'country' | 'region') {
  const normalizedValue = value.trim();
  const idText = normalizedValue.startsWith(`${type}:`) ? normalizedValue.slice(type.length + 1) : normalizedValue;
  const id = Number(idText);

  return Number.isInteger(id) ? id : undefined;
}

function normalizeOptionText(value: string | undefined) {
  return (value ?? '').trim().toLocaleLowerCase();
}
