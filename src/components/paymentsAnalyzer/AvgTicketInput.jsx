// AvgTicketInput — clean numeric input + quick-pick chips.
//
// No slider: the range (5..5000) is too wide for a slider AND precision
// matters (a €48 ticket is materially different from €52 when amortizing a
// €0.25 fixed fee). Chips give a one-tap common-case; typing gives precision.

const QUICK_TICKETS = [25, 50, 80, 150];

export default function AvgTicketInput({ value, onChange }) {
  const active = (chip) => Number(value) === chip;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
          Average ticket (EUR)
        </span>
        <span className="text-[10px] text-white/35">Tap a preset or type</span>
      </div>

      <input
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 80"
        className="cambra-num-input w-full h-11 rounded-md px-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-400/60 transition-colors"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
      />

      <div className="flex flex-wrap gap-2 pt-1">
        {QUICK_TICKETS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(String(v))}
            className="h-8 px-3 rounded-full text-[12px] font-semibold transition-colors"
            style={
              active(v)
                ? {
                    background: "rgba(34,211,238,0.15)",
                    color: "rgb(34,211,238)",
                    border: "1px solid rgba(34,211,238,0.55)",
                  }
                : {
                    background: "rgba(255,255,255,0.03)",
                    color: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }
            }
          >
            €{v}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-white/35">
        The fixed fee (e.g. €0.25) hits low-ticket merchants much harder — this changes the answer.
      </p>
    </div>
  );
}