import { createContext, useContext, useEffect, useMemo, useState } from "react";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import es from "@/locales/es.json";
import { base44 } from "@/api/base44Client";

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" }
];

const DICTS = { en, fr, es };

function mapBrowserLang(lang) {
  if (!lang) return "en";
  const l = lang.toLowerCase();
  if (l.startsWith("fr")) return "fr";
  if (l.startsWith("es")) return "es";
  if (l.startsWith("en")) return "en";
  return "en";
}

const I18nContext = createContext({ lang: "en", setLang: () => {}, t: (k) => k, format: { n: (v)=>String(v) } });

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1) user preference
        const isAuthed = await base44.auth.isAuthenticated();
        if (isAuthed) {
          const me = await base44.auth.me();
          const pref = me?.preferred_language && DICTS[me.preferred_language] ? me.preferred_language : null;
          if (pref) { if (!cancelled) { setLang(pref); setReady(true); return; } }
        }
        // 2) localStorage
        const stored = typeof window !== 'undefined' ? localStorage.getItem("node_lang") : null;
        if (stored && DICTS[stored]) { if (!cancelled) { setLang(stored); setReady(true); return; } }
        // 3) browser
        const browser = typeof navigator !== 'undefined' ? mapBrowserLang(navigator.language || navigator.languages?.[0]) : "en";
        if (!cancelled) { setLang(browser); setReady(true); }
      } catch {
        setLang("en"); setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem("node_lang", lang);
    document.documentElement.lang = lang;
    // Persist to user profile if authenticated
    (async () => {
      try {
        const isAuthed = await base44.auth.isAuthenticated();
        if (isAuthed) await base44.auth.updateMe({ preferred_language: lang });
      } catch {}
    })();
  }, [lang]);

  const dict = useMemo(() => DICTS[lang] || DICTS.en, [lang]);

  const t = useMemo(() => {
    const fn = (key, fallbackParams = {}) => {
      if (!key) return "";
      const parts = key.split('.');
      let cur = dict;
      for (const p of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p]; else { cur = null; break; }
      }
      if (cur == null) {
        // try english fallback
        let def = DICTS.en;
        for (const p of parts) { if (def && Object.prototype.hasOwnProperty.call(def, p)) def = def[p]; else { def = null; break; } }
        return def ?? (fallbackParams.default ?? key);
      }
      return cur;
    };
    return fn;
  }, [dict]);

  const format = useMemo(() => ({
    n: (value, options) => new Intl.NumberFormat(lang).format(value),
    c: (value, currency = 'EUR', options) => new Intl.NumberFormat(lang, { style: 'currency', currency, ...options }).format(value),
    d: (date, options) => new Intl.DateTimeFormat(lang, options || { year: 'numeric', month: 'short', day: '2-digit' }).format(new Date(date)),
  }), [lang]);

  const value = useMemo(() => ({ lang, setLang, t, format, ready }), [lang, t, format, ready]);

  if (!ready) return children; // keep existing skeletons

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() { return useContext(I18nContext); }
export function useLanguage() { const { lang, setLang } = useContext(I18nContext); return { lang, setLang }; }

// Simple helpers for SEO metadata per page
export function setPageMeta(title, description) {
  if (typeof document !== 'undefined') {
    if (title) document.title = title;
    if (description) {
      let meta = document.querySelector('meta[name="description"]');
      if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name','description'); document.head.appendChild(meta); }
      meta.setAttribute('content', description);
    }
  }
}