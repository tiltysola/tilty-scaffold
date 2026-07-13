export interface ApiKeyDraft {
  name: string;
  description: string;
  expiresAt: string;
  neverExpires: boolean;
}

export const defaultApiKeyDraft: ApiKeyDraft = {
  name: '',
  description: '',
  expiresAt: '',
  neverExpires: true,
};

export function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function parseExpirationValue(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function mergeExpirationDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59);
}

export function formatDateTimeLocalValue(date: Date) {
  return `${date.getFullYear()}-${padDateTimePart(date.getMonth() + 1)}-${padDateTimePart(date.getDate())}T${formatTimeValue(
    date,
  )}`;
}

export function isBeforeToday(date: Date) {
  const today = new Date();

  return date < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function formatTimeValue(date: Date) {
  return `${padDateTimePart(date.getHours())}:${padDateTimePart(date.getMinutes())}`;
}

function padDateTimePart(value: number) {
  return String(value).padStart(2, '0');
}
