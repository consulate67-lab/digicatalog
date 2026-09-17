import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import tr from './locales/tr.json';
import en from './locales/en.json';

/**
 * i18n konfigürasyonu.
 *
 * - Tarayıcı dilini algılar (navigator.language), yoksa TR default
 * - localStorage'a 'dc.lang' ile kaydeder (sayfa yenilemede korunur)
 * - TR + EN destekleniyor (Faz 1'de 2 dil yeterli)
 *
 * Kullanım:
 *   import { useTranslation } from 'react-i18next';
 *   const { t, i18n } = useTranslation();
 *   <h1>{t('landing.hero.title')}</h1>
 *   <button onClick={() => i18n.changeLanguage('en')}>EN</button>
 */

const STORAGE_KEY = 'dc.lang';
const SUPPORTED = ['tr', 'en'] as const;
type Lang = (typeof SUPPORTED)[number];

const detectInitialLanguage = (): Lang => {
  // Önce localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED as readonly string[]).includes(stored)) {
      return stored as Lang;
    }
  } catch {
    // localStorage erişilemiyorsa (private mode, vb.) navigator'a düş
  }
  // Sonra tarayıcı dili
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'tr';
  const short = nav.split('-')[0].toLowerCase();
  if ((SUPPORTED as readonly string[]).includes(short)) return short as Lang;
  return 'tr'; // default
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      tr: { translation: tr },
      en: { translation: en },
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'tr',
    interpolation: {
      escapeValue: false, // React zaten escape ediyor
    },
  })
  .then(() => {
    // <html lang="..."> güncelle (screen reader + SEO için)
    document.documentElement.lang = i18n.language;
  });

// Dil değiştiğinde localStorage + <html lang> güncelle
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // ignore
  }
  document.documentElement.lang = lng;
});

export const SUPPORTED_LANGUAGES = SUPPORTED;
export default i18n;
