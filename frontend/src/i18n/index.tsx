/* eslint-disable react-refresh/only-export-components -- I18n helpers intentionally share this entrypoint. */
import { type ReactNode, useEffect, useState } from 'react';
import { createIntl, createIntlCache, IntlProvider, type PrimitiveType } from 'react-intl';

import { enUS, zhCN } from 'date-fns/locale';

import {
  defaultLocale,
  getLocaleDirection,
  localeStorageKey,
  normalizeLocale,
  resolveSupportedLocale,
  type SupportedLocale,
} from '@tilty/shared/i18n';

import enUSMessages from './messages/en-US';
import zhCNMessages from './messages/zh-CN';

type AppMessages = Record<keyof typeof enUSMessages, string>;

type StaticMessageId = keyof AppMessages;

export const defaultMessages: AppMessages = enUSMessages;

const cache = createIntlCache();
const intlByLocale = new Map<SupportedLocale, ReturnType<typeof createIntl>>();
const frontendMessages = {
  'en-US': defaultMessages,
  'zh-CN': {
    ...defaultMessages,
    ...zhCNMessages,
  },
} satisfies Record<SupportedLocale, AppMessages>;

let currentLocale: SupportedLocale = resolveInitialLocale();

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const [locale] = useState(() => resolveInitialLocale());

  useEffect(() => {
    setCurrentLocale(locale);
    updateDocumentLocale(locale);
  }, [locale]);

  return (
    <IntlProvider defaultLocale={defaultLocale} key={locale} locale={locale} messages={frontendMessages[locale]}>
      {children}
    </IntlProvider>
  );
}

export function getCurrentLocale() {
  return currentLocale;
}

function setCurrentLocale(locale: SupportedLocale) {
  currentLocale = locale;
  writeStoredLocale(locale);
}

function resolveInitialLocale() {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  return resolveSupportedLocale([readStoredLocale(), ...getBrowserLocaleCandidates()]);
}

export function formatDateOnlyDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  }).format(date);
}

export function formatDateOnlyValue(value: string, locale: string) {
  const date = parseDateOnly(value);

  return date ? formatDateOnlyDate(date, locale) : value;
}

export function formatDateValue(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  }).format(date);
}

export function getDatePickerLocale(locale: string) {
  return locale === 'zh-CN' ? zhCN : enUS;
}

export function getMonthOptions(locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
  });

  return Array.from({ length: 12 }, (_, month) => ({
    label: formatter.format(new Date(2000, month, 1)),
    value: String(month),
  }));
}

export function formatStaticMessage(id: StaticMessageId, values?: Record<string, PrimitiveType>) {
  return getStaticIntl(getCurrentLocale()).formatMessage({ id }, values);
}

function updateDocumentLocale(locale: SupportedLocale) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.lang = locale;
  document.documentElement.dir = getLocaleDirection(locale);
}

function readStoredLocale() {
  try {
    return normalizeLocale(window.localStorage.getItem(localeStorageKey));
  } catch {
    return null;
  }
}

function writeStoredLocale(locale: SupportedLocale) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(localeStorageKey, locale);
  } catch {
    // Locale persistence is a convenience and must not block rendering.
  }
}

function getBrowserLocaleCandidates() {
  if (typeof navigator === 'undefined') {
    return [];
  }

  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }

  return navigator.language ? [navigator.language] : [];
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

function getStaticIntl(locale: SupportedLocale) {
  const existing = intlByLocale.get(locale);

  if (existing) {
    return existing;
  }

  const intl = createIntl(
    {
      defaultLocale,
      locale,
      messages: frontendMessages[locale],
    },
    cache,
  );

  intlByLocale.set(locale, intl);

  return intl;
}
