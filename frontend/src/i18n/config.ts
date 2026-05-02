/**
 * i18n configuration — i18next + react-i18next + browser language detector
 *
 * How i18next works at a high level:
 *
 * 1. You call `t('some.key')` anywhere in a component that uses `useTranslation()`.
 * 2. i18next looks up the key in the active language's JSON file (en.json / fr.json).
 * 3. If the key is missing in the active language it falls back to the `fallbackLng`
 *    (English), so a missing French translation never shows a blank string — it shows
 *    the English text instead. This is the safety net that makes partial translations safe.
 *
 * LanguageDetector order (top = highest priority):
 *  - localStorage  → user's explicit choice (set by the language toggle in NavBar)
 *  - navigator     → browser language setting
 *  - htmlTag       → <html lang="..."> attribute
 *
 * We import the translation files directly (static JSON) rather than lazy-loading
 * them from a server. For two small files this is simpler and loads instantly.
 * Phase 1.5 (5+ languages) should switch to lazy loading via i18next-http-backend.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import fr from './locales/fr.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    // Only match the first two chars so 'fr-CA', 'fr-FR' etc. all resolve to 'fr'
    load: 'languageOnly',
    interpolation: {
      // React already escapes values — disabling avoids double-escaping
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });

export default i18n;
