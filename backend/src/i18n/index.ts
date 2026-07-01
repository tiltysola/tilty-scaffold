import { defaultLocale, type SupportedLocale } from '@tilty/shared/i18n';

import enUSMessages from './messages/en-US';
import zhCNMessages from './messages/zh-CN';

export type BackendMessageId = keyof typeof enUSMessages;
type BackendMessageValues = Record<string, boolean | number | string | null | undefined>;
const pluralPattern = /\{([A-Za-z0-9_]+), plural, one \{([^{}]*)\} other \{([^{}]*)\}\}/g;
const valuePattern = /\{([A-Za-z0-9_]+)\}/g;

export const backendMessages = {
  'en-US': enUSMessages,
  'zh-CN': zhCNMessages,
} satisfies Record<SupportedLocale, Record<BackendMessageId, string>>;

export function getBackendMessage(locale: SupportedLocale, messageId: BackendMessageId) {
  return backendMessages[locale][messageId] ?? backendMessages[defaultLocale][messageId];
}

export function formatBackendMessage(
  locale: SupportedLocale,
  messageId: BackendMessageId,
  values: BackendMessageValues = {},
) {
  const template = getBackendMessage(locale, messageId);

  return template
    .replace(pluralPattern, (_match, key: string, one: string, other: string) => {
      const value = values[key];
      const formattedValue = value == null ? '' : String(value);
      const selected = value === 1 ? one : other;

      return selected.replaceAll('#', formattedValue);
    })
    .replace(valuePattern, (_match, key: string) => {
      const value = values[key];

      return value == null ? '' : String(value);
    });
}
