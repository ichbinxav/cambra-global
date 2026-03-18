import { useState, useRef, useEffect } from "react";
import { LANGUAGES, useLanguage } from "@/lib/i18n.jsx";
import { ChevronDown } from "lucide-react";

export default function LanguageSwitcher({ className = "" }) {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/50 bg-background text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <span>{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[160px] rounded-xl border border-border/60 bg-background shadow-lg overflow-hidden">
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left hover:bg-secondary transition-colors ${l.code === lang ? "font-semibold bg-secondary/60" : ""}`}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}