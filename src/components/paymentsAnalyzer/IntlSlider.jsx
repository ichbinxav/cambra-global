// IntlSlider — 0–100 slider for international share, with contextual copy.
//
// Linear scale, single value. The label changes with the value so the user
// gets a plain-language read of what they picked. The percentage is always
// the source of truth for the payload.

export default function IntlSlider({ value, onChange }) {
  const raw = Number(value);
  const pct = isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 0;
  const isSet = value !== "" && value !== null && value !== undefined;

  const contextLabel = (() => {
    if (!isSet) return "Move the slider to set it (0 is valid)";
    if (pct === 0)    return "Domestic only";
    if (pct <= 15)    return "Mostly domestic";
    if (pct <= 50)    return "Mixed markets";
    if (pct <= 85)    return "Mostly international";
    return "Almost entirely international";
  })();

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--gris-1)" }}>
          International share
        </span>
        <span
          className="tabular-nums font-bold"
          style={{ color: "var(--ink)", fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "22px", letterSpacing: "-0.02em" }}
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
        aria-label="International sales share"
      />

      <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--gris-2)" }}>
        <span>0%</span>
        <span className="text-[11px]" style={{ color: "var(--gris-1)" }}>{contextLabel}</span>
        <span>100%</span>
      </div>
    </div>
  );
}