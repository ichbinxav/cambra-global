import React from "react";
import { useTranslation, LANGUAGES } from "@/lib/i18n.jsx";

/**
 * LanguageSwitcher — compact EN / FR / ES segmented toggle.
 * Works on dark navbars (default) and light surfaces via `variant="light"`.
 */
export default function LanguageSwitcher({ className = "", variant = "dark" }) {
  const { lang, setLang } = useTranslation();

  const isDark = variant === "dark";
  const wrapperBase = isDark
    ? "border border-white/15 bg-white/5"
    : "border border-border/60 bg-secondary/40";
  const inactiveText = isDark ? "text-white/50 hover:text-white" : "text-muted-foreground hover:text-foreground";
  const activeStyle  = isDark
    ? "text-white border-white/30 bg-white/10"
    : "text-foreground border-foreground/30 bg-background";

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full p-0.5 ${wrapperBase} ${className}`}
      role="group"
      aria-label="Select language"
    >
      {LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => setLang(l.code)}
            aria-pressed={active}
            aria-label={`Switch language to ${l.label}`}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider transition-colors border border-transparent ${
              active ? activeStyle : inactiveText
            }`}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}