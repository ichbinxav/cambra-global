import React from "react";

const ACCENT_GRADIENTS = [
  "linear-gradient(135deg, #ffffff 0%, #B8D8E0 50%, #2CA7C1 100%)",
  "linear-gradient(135deg, #ffffff 0%, #FFD9B0 50%, #FB923C 100%)",
  "linear-gradient(135deg, #ffffff 0%, #BBE5C6 50%, #22C55E 100%)",
];

function MetricBlock({ label, value, helper, accent, gradient }) {
  return (
    <div className="min-w-[180px] flex-1">
      <p className="text-[10px] uppercase tracking-[0.25em] opacity-60 mb-2 font-semibold">{label}</p>
      <div className="flex items-end gap-2">
        <p className="text-4xl sm:text-5xl font-black tracking-[-0.035em] tabular-nums leading-none"
           style={gradient ? {
             background: gradient,
             WebkitBackgroundClip: "text",
             WebkitTextFillColor: "transparent",
             backgroundClip: "text",
             filter: "drop-shadow(0 0 18px rgba(44,167,193,0.25))",
           } : undefined}>
          {value}
        </p>
        {helper ? <span className={`text-xs font-semibold mb-1 ${accent || 'opacity-60'}`}>{helper}</span> : null}
      </div>
    </div>
  );
}

export default function CommandHero({ title = "Command Center", subtitle = "Infrastructure Intelligence · CAMBRA", metrics = [] }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-foreground text-background shadow-[0_24px_80px_-20px_rgba(0,0,0,0.5)]">
      {/* Inner halos like landing */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full blur-3xl"
             style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.55), rgba(31,78,216,0))" }} />
        <div className="absolute -bottom-32 -right-24 w-[26rem] h-[26rem] rounded-full blur-3xl"
             style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.45), rgba(44,167,193,0))" }} />
        <div className="absolute inset-0 opacity-[0.06]"
             style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
      </div>

      <div className="relative p-6 sm:p-7 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-full border border-background/15 bg-background/[0.04] backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cambra-mint opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              </span>
              <span className="text-[10px] font-semibold tracking-[0.22em] uppercase opacity-75">Live · Admin operations</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.04em] leading-[0.95]">{title}</h2>
            <p className="text-xs opacity-55 mt-1">{subtitle}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {metrics.slice(0, 3).map((m, i) => (
            <div key={i} className="relative rounded-xl border border-background/10 bg-background/[0.04] backdrop-blur-md p-4 sm:p-5 overflow-hidden">
              <div className="pointer-events-none absolute -bottom-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-50"
                   style={{ background: i === 0 ? "rgba(31,78,216,0.4)" : i === 1 ? "rgba(251,146,60,0.35)" : "rgba(34,197,94,0.35)" }} />
              <div className="relative">
                <MetricBlock
                  label={m.label}
                  value={m.value}
                  helper={m.helper}
                  accent={m.accent}
                  gradient={ACCENT_GRADIENTS[i % ACCENT_GRADIENTS.length]}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}