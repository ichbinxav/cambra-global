// CurrencyField — merchant currency selector for the Payments Analyzer (FX-2).
//
// Product decision (founder, 2026-08-16): the merchant picks the currency
// they actually work in. The field is PROPOSED from the selected country's
// primary currency (via the market registry) but stays freely changeable —
// a Czech merchant selling mostly to Germany may genuinely work in EUR.
//
// The selected currency is sent with the payload; conversion to the EUR the
// engine requires happens server-side at the daily ECB reference rate, and
// that rate is frozen onto the analysis. This field never converts anything
// itself — it only declares what the typed amounts mean.

import { useTranslation } from "@/lib/i18n.jsx";

export default function CurrencyField({ value, onChange, options }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {t("az_currency_label")}
        </span>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
          {t("az_currency_hint")}
        </span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("az_currency_label")}
        className="w-full h-11 px-3 rounded-md text-sm focus:outline-none transition-colors"
        style={{
          color: "#ffffff",
          background: "rgba(30,26,60,0.9)",
          border: "1px solid rgba(255,255,255,0.14)",
          colorScheme: "dark",
        }}
      >
        {options.map((code) => (
          <option key={code} value={code}>{code}</option>
        ))}
      </select>
      <p className="text-[10.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
        {t("az_currency_help")}
      </p>
    </div>
  );
}
