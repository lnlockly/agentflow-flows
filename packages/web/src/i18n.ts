import { LocalesEnum } from '@activepieces/shared';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import ICU from 'i18next-icu';
import { initReactI18next } from 'react-i18next';

i18n
  .use(ICU)
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // AgentFlow ships to a Russian-speaking audience, so Russian is the
    // default: it is the first detected fallback and the fallback for any
    // untranslated key. An explicit user choice (stored in localStorage by the
    // language toggle) still wins via the detector order below.
    fallbackLng: ['ru', 'en'],
    debug: false,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    supportedLngs: Object.values(LocalesEnum),
    detection: {
      // Honor an explicit choice (querystring or the stored toggle value)
      // first; otherwise fall through to `fallbackLng[0]` ('ru'). `navigator`
      // is intentionally omitted so the default is Russian regardless of the
      // browser locale — users switch via the language toggle, which persists
      // to localStorage.
      order: ['querystring', 'localStorage'],
      caches: ['localStorage'],
    },
    keySeparator: false,
    nsSeparator: false,
    returnEmptyString: false,
  });
export default i18n;
