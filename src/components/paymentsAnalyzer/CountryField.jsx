// CountryField — required country selector for the Payments Analyzer.
//
// Country is NOT cosmetic: the engine resolves country-pinned rows in
// PaymentsRateTable (e.g. sumup|ANY|EU-ES vs the pan-EU row), so an ES
// merchant is priced against Spanish rules and an FR merchant against
// French ones. It was already required in validation — this component
// makes that explicit in the UI (Required marker + red state when empty).
//
// Extracted from PaymentsAnalyzer so the single-channel and combined
// layouts render the exact same field instead of two copies.

import { useTranslation } from "@/lib/i18n.jsx";

export default function CountryField({ value, onChange, options }) {
  const { t } = useTranslation();
  const missing = !value;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {t("az_country_label")} <span style={{ color: "#FCA5A5" }}>*</span>
        </span>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
          {t("az_country_required_hint")}
        </span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required="true"
        aria-invalid={missing}
        className="w-full h-11 px-3 rounded-md text-sm focus:outline-none transition-colors"
        style={{
          color: "#ffffff",
          background: "rgba(30,26,60,0.9)",
          border: missing ? "1px solid rgba(239,68,68,0.55)" : "1px solid rgba(255,255,255,0.14)",
          colorScheme: "dark",
        }}
      >
        <option value="">{t("az_country_placeholder")}</option>
        {options.map((c) => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </select>
      <p className="text-[10.5px] leading-relaxed" style={{ color: missing ? "#FCA5A5" : "rgba(255,255,255,0.5)" }}>
        {missing
          ? t("az_country_missing_help")
          : t("az_country_selected_help")}
      </p>
    </div>
  );
}
