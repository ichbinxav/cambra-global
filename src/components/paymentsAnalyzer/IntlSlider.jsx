// IntlSlider — 0–100 slider for international share, with contextual copy.
//
// Linear scale, single value. The label changes with the value so the user
// gets a plain-language read of what they picked. The percentage is always
// the source of truth for the payload.

import { useTranslation } from "@/lib/i18n.jsx";

export default function IntlSlider({ value, onChange }) {
  const { t } = useTranslation();
  const raw = Number(value);
  const pct = isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 0;
  const isSet = value !== "" && value !== null && value !== undefined;

  const contextLabel = (() => {
    if (!isSet) return t("az_intl_ctx_unset");
    if (pct === 0)    return t("az_intl_ctx_domestic");
    if (pct <= 15)    return t("az_intl_ctx_mostly_domestic");
    if (pct <= 50)    return t("az_intl_ctx_mixed");
    if (pct <= 85)    return t("az_intl_ctx_mostly_intl");
    return t("az_intl_ctx_almost_all_intl");
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.85)" }}>
          {t("az_intl_title")}
        </span>
        <span
          className="tabular-nums font-bold"
          style={{ color: "#ffffff", fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "22px", letterSpacing: "-0.02em" }}
        >
          {isSet ? `${pct}%` : "—"}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={isSet ? pct : 0}
        onChange={(e) => onChange(e.target.value)}
        className="cambra-range w-full"
        aria-label={t("az_intl_aria")}
      />

      <div className="flex items-center justify-between text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>
        <span>0%</span>
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.8)" }}>{contextLabel}</span>
        <span>100%</span>
      </div>
    </div>
  );
}