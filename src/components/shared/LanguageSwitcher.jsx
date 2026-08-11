import React, { useMemo } from "react";
import { ChevronDown, Languages } from "lucide-react";
import { useTranslation, LANGUAGES } from "@/lib/i18n.jsx";

/** Compact, accessible selector: automatic local language first, English always
 * explicit, and every currently supported manual language in one dropdown. */
export default function LanguageSwitcher({ className = "", variant = "dark" }) {
  const { lang, detectedLang, isAutomatic, setLang, setAutoLang, t } = useTranslation();
  const dark = variant === "dark";
  const detected = LANGUAGES.find((item) => item.code === detectedLang) || LANGUAGES[0];
  const ordered = useMemo(() => {
    const english = LANGUAGES.find((item) => item.code === "en");
    return [english, ...LANGUAGES.filter((item) => item.code !== "en")].filter(Boolean);
  }, []);
  const value = isAutomatic ? "auto" : lang;

  return (
    <label className={`relative inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border pl-2.5 pr-1.5 ${dark ? "border-white/15 bg-white/[.06] text-white" : "border-border/60 bg-secondary/40 text-foreground"} ${className}`}>
      <Languages aria-hidden="true" size={13} className={dark ? "text-white/65" : "text-muted-foreground"} />
      <span className="sr-only">{t("language_switcher_label")}</span>
      <select
        value={value}
        onChange={(event) => event.target.value === "auto" ? setAutoLang() : setLang(event.target.value)}
        aria-label={t("language_switcher_label")}
        className={`peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0 ${dark ? "text-white" : "text-foreground"}`}
      >
        <option value="auto">{t("language_detected", { language:detected.label })}</option>
        {ordered.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
      <span aria-hidden="true" className="max-w-[6.8rem] truncate text-[11px] font-bold">
        {isAutomatic ? detected.label : (LANGUAGES.find((item) => item.code === lang)?.label || "English")}
      </span>
      <ChevronDown aria-hidden="true" size={12} className={dark ? "text-white/55" : "text-muted-foreground"} />
    </label>
  );
}
