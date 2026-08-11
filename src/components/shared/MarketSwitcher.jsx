import React, { useMemo } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { EUROPE_MARKETS, marketDisplayName, useMarket } from "@/lib/publicExperience.jsx";

export default function MarketSwitcher({ className = "", variant = "dark" }) {
  const { locale, t } = useTranslation();
  const { marketCode, detectedMarket, isAutomatic, setMarket, setAutoMarket } = useMarket();
  const dark = variant === "dark";
  const options = useMemo(() => EUROPE_MARKETS.map((market) => ({
    code: market.iso2,
    name: marketDisplayName(market.iso2, locale),
    currency: market.primary_currency,
  })).sort((a, b) => a.name.localeCompare(b.name, locale)), [locale]);
  const active = options.find((option) => option.code === marketCode);
  const detected = options.find((option) => option.code === detectedMarket);

  return (
    <label className={`relative inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border pl-2.5 pr-1.5 ${dark ? "border-white/15 bg-white/[.06] text-white" : "border-border/60 bg-secondary/40 text-foreground"} ${className}`}>
      <MapPin aria-hidden="true" size={13} className={dark ? "text-white/65" : "text-muted-foreground"} />
      <span className="sr-only">{t("market_switcher_label")}</span>
      <select
        value={isAutomatic ? "auto" : marketCode}
        onChange={(event) => event.target.value === "auto" ? setAutoMarket() : setMarket(event.target.value)}
        aria-label={t("market_switcher_label")}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
      >
        <option value="auto">{t("market_detected", { market: detected?.name || detectedMarket })}</option>
        {options.map((option) => <option key={option.code} value={option.code}>{option.name} · {option.currency}</option>)}
      </select>
      <span aria-hidden="true" className="max-w-[5.5rem] truncate text-[11px] font-bold">
        {active?.name || marketCode}
      </span>
      <ChevronDown aria-hidden="true" size={12} className={dark ? "text-white/55" : "text-muted-foreground"} />
    </label>
  );
}
