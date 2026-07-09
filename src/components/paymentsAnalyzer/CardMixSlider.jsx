// CardMixSlider — single slider expressing debit-vs-credit split.
//
// Value semantics match the contract: card_mix_debit_pct = 0..100. Slider
// left = 100% credit, right = 100% debit. The two-way split label makes it
// obvious what's implied. Optional field — parent handles empty state.

export default function CardMixSlider({ value, onChange }) {
  const raw = Number(value);
  const isSet = value !== "" && value !== null && value !== undefined;
  const debitPct = isSet && isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 50;
  const creditPct = 100 - debitPct;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Debit vs credit
        </span>
        <span
          className="tabular-nums text-white font-bold"
          style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "18px", letterSpacing: "-0.02em" }}
        >
          {isSet ? (
            <>
              <span className="text-cyan-300">{debitPct}%</span>
              <span className="text-white/40 mx-1.5">/</span>
              <span className="text-white/85">{creditPct}%</span>
            </>
          ) : (
            "—"
          )}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={debitPct}
        onChange={(e) => onChange(e.target.value)}
        className="cambra-range w-full"
        aria-label="Debit card share"
      />

      <div className="flex items-center justify-between text-[10px] text-white/40">
        <span>100% credit</span>
        <span>100% debit</span>
      </div>

      <p className="text-[11px] text-white/35">
        Leave blank if unsure — today's engine doesn't consume this yet, but we store it for future rate refinements.
      </p>
    </div>
  );
}