// English / Tamil for the customer app.
//
//   const { t, lang, setLang } = useT();
//   t('Add to cart')                      → "Add to cart" or "கார்ட்டில் சேர்"
//   t('Only {count} left', { count: 3 })  → "Only 3 left" or "3 மட்டுமே உள்ளன"
//
// The English text is the key; Tamil translations live in ./ta.ts. Anything
// without a translation falls back to English. Run `npm run check-translations`
// to list missing Tamil texts.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { localStore } from '@/lib/storage';
import { ta } from './ta';

export type Lang = 'en' | 'ta';
export type Params = Record<string, string | number>;

const LANG_KEY = 'meeranji.language';

function translate(lang: Lang, text: string, params?: Params): string {
  const template = lang === 'ta' ? (ta[text] ?? text) : text;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (params[key] !== undefined ? String(params[key]) : match));
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (text: string, params?: Params) => string;
  /** Locale for dates and numbers: "en-IN" or "ta-IN". */
  locale: string;
  /** The Tamil name when the app is in Tamil and one exists, otherwise the English name. */
  localName: (item: { name: string; nameTa?: string | null }) => string;
  loaded: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    localStore.getJson<Lang>(LANG_KEY).then((saved) => {
      if (saved === 'en' || saved === 'ta') setLangState(saved);
      setLoaded(true);
    });
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStore.setJson(LANG_KEY, next);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      loaded,
      locale: lang === 'ta' ? 'ta-IN' : 'en-IN',
      t: (text, params) => translate(lang, text, params),
      localName: (item) => (lang === 'ta' && item.nameTa ? item.nameTa : item.name),
    }),
    [lang, setLang, loaded],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useT must be used inside <LanguageProvider>');
  return ctx;
}
