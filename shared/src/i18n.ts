export const defaultLocale = 'en-US';
export const localeRequestHeader = 'X-Tilty-Locale';
export const localeStorageKey = 'tilty-scaffold.locale';
export const supportedLocales = ['en-US', 'zh-CN'] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type LocaleDirection = 'ltr' | 'rtl';

const localeAliases: Record<string, SupportedLocale> = {
  en: 'en-US',
  'en-us': 'en-US',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hans-cn': 'zh-CN',
  'zh-sg': 'zh-CN',
};

export function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.some((locale) => locale === value);
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  const normalized = value?.trim().replace(/_/g, '-').toLowerCase();

  if (!normalized) {
    return null;
  }

  return localeAliases[normalized] ?? null;
}

export function resolveSupportedLocale(candidates: Iterable<string | null | undefined>) {
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);

    if (locale) {
      return locale;
    }
  }

  return defaultLocale;
}

export function negotiateLocaleHeader(value: string | null | undefined) {
  return resolveSupportedLocale(parseAcceptLanguage(value));
}

export function getLocaleDirection(_locale: SupportedLocale): LocaleDirection {
  return 'ltr';
}

function parseAcceptLanguage(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item, index) => {
      const [languageRange = '', ...parameters] = item.trim().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;

      return {
        index,
        languageRange: languageRange.trim(),
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((item) => item.languageRange && item.languageRange !== '*' && item.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map((item) => item.languageRange);
}
