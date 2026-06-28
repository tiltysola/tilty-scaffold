import { useEffect, useState } from 'react';

import { clearAppFontClasses, getPreferredAppFontLanguage, loadAppFonts } from '@/lib/fonts';

export function LanguageFontProvider() {
  const [language, setLanguage] = useState(() => getPreferredAppFontLanguage());

  useEffect(() => {
    loadAppFonts(language);
  }, [language]);

  useEffect(() => {
    const handleLanguageChange = () => {
      setLanguage(getPreferredAppFontLanguage());
    };

    window.addEventListener('languagechange', handleLanguageChange);

    const observer = new MutationObserver(handleLanguageChange);
    observer.observe(document.documentElement, {
      attributeFilter: ['lang'],
      attributes: true,
    });

    return () => {
      observer.disconnect();
      window.removeEventListener('languagechange', handleLanguageChange);
      clearAppFontClasses();
    };
  }, []);

  return null;
}
