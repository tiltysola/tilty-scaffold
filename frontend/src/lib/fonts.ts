const FONT_CSS_PRECONNECT_ID = 'font-css-preconnect';
const FONT_CDN_PRECONNECT_ID = 'font-cdn-preconnect';
const BASE_FONT_STYLESHEET_ID = 'base-font-stylesheet';
const BASE_FONT_STYLESHEET_HREF =
  'https://fonts.loli.net/css2?family=Fontdiner+Swanky&family=Inter:wght@400;500;600;700&display=swap';
const NOTO_SANS_SC_STYLESHEET_ID = 'noto-sans-sc-stylesheet';
const NOTO_SANS_SC_STYLESHEET_HREF =
  'https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap';
const NOTO_SANS_JP_STYLESHEET_ID = 'noto-sans-jp-stylesheet';
const NOTO_SANS_JP_STYLESHEET_HREF = 'https://fonts.loli.net/css2?family=Noto+Sans+JP:wght@100..900&display=swap';

export type AppFontLanguage = 'zh' | 'ja';

interface AppFontConfig {
  className: string;
  stylesheetHref: string;
  stylesheetId: string;
}

const languageFontConfigs: Record<AppFontLanguage, AppFontConfig> = {
  zh: {
    className: 'font-noto-sans-sc',
    stylesheetHref: NOTO_SANS_SC_STYLESHEET_HREF,
    stylesheetId: NOTO_SANS_SC_STYLESHEET_ID,
  },
  ja: {
    className: 'font-noto-sans-jp',
    stylesheetHref: NOTO_SANS_JP_STYLESHEET_HREF,
    stylesheetId: NOTO_SANS_JP_STYLESHEET_ID,
  },
};

const languageFontClassNames = Object.values(languageFontConfigs).map((config) => config.className);

const ensureHeadElement = (id: string, createElement: () => HTMLElement) => {
  if (document.getElementById(id)) return;
  document.head.appendChild(createElement());
};

const ensurePreconnect = (id: string, href: string, crossOrigin = false) => {
  ensureHeadElement(id, () => {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'preconnect';
    link.href = href;
    if (crossOrigin) {
      link.crossOrigin = 'anonymous';
    }
    return link;
  });
};

const ensureStylesheet = (id: string, href: string) => {
  ensureHeadElement(id, () => {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    return link;
  });
};

const ensureFontPreconnect = () => {
  ensurePreconnect(FONT_CSS_PRECONNECT_ID, 'https://fonts.loli.net');
  ensurePreconnect(FONT_CDN_PRECONNECT_ID, 'https://gstatic.loli.net', true);
};

const ensureFontStylesheet = (id: string, href: string) => {
  ensureFontPreconnect();
  ensureStylesheet(id, href);
};

export const normalizeAppFontLanguage = (language: string | null | undefined): AppFontLanguage | undefined => {
  const normalizedLanguage = language?.trim().toLowerCase();
  if (!normalizedLanguage) return undefined;
  if (normalizedLanguage === 'zh' || normalizedLanguage.startsWith('zh-')) return 'zh';
  if (normalizedLanguage === 'ja' || normalizedLanguage.startsWith('ja-')) return 'ja';
  return undefined;
};

export const getPreferredAppFontLanguage = (): AppFontLanguage | undefined => {
  if (typeof document !== 'undefined') {
    const documentLanguage = normalizeAppFontLanguage(document.documentElement.lang);
    if (documentLanguage) return documentLanguage;
  }

  if (typeof navigator === 'undefined') return undefined;

  const browserLanguages = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  for (const browserLanguage of browserLanguages) {
    const fontLanguage = normalizeAppFontLanguage(browserLanguage);
    if (fontLanguage) return fontLanguage;
  }

  return undefined;
};

export const loadAppFonts = (language = getPreferredAppFontLanguage()) => {
  if (typeof document === 'undefined') return;

  const fontConfig = language ? languageFontConfigs[language] : undefined;

  ensureFontStylesheet(BASE_FONT_STYLESHEET_ID, BASE_FONT_STYLESHEET_HREF);
  languageFontClassNames.forEach((className) => {
    document.documentElement.classList.toggle(className, className === fontConfig?.className);
  });
  if (fontConfig) {
    ensureFontStylesheet(fontConfig.stylesheetId, fontConfig.stylesheetHref);
  }
};

export const clearAppFontClasses = () => {
  if (typeof document === 'undefined') return;

  document.documentElement.classList.remove(...languageFontClassNames);
};
