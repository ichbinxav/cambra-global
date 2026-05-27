import React from "react";

// Map a Tailwind text color class to an rgba glow color for the halo
const GLOW_MAP = {
  "text-purple-600": "rgba(168,85,247,0.35)",
  "text-green-600":  "rgba(34,197,94,0.30)",
  "text-amber-600":  "rgba(245,158,11,0.32)",
  "text-red-600":    "rgba(239,68,68,0.32)",
  "text-blue-600":   "rgba(31,78,216,0.35)",
  "text-foreground": "rgba(44,167,193,0.30)",
};

function Card({ title, value, subtitle, colorClass = "text-foreground", helper }) {
  const glow = GLOW_MAP[colorClass] || "rgba(31,78,216,0.25)";
  return (
    <div className="group relative p-4 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm min-w-[140px] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.15)]">
      {/* halo */}
      <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity"
           style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }} />
      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-semibold mb-1.5">{title}</p>
        <p className={`text-2xl font-black tabular-nums tracking-tight ${colorClass}`}>{value}</p>
        {subtitle && <p className="text-[11px] text-muted-foreground/55 mt-1.5 leading-snug">{subtitle}</p>}
        {helper && <p className="text-[10px] text-muted-foreground/45 mt-1">{helper}</p>}
      </div>
    </div>
  );
}

export default function KPIStrip({ kpis }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((k, i) => (
        <Card key={i} title={k.title} value={k.value} subtitle={k.subtitle} colorClass={k.color} helper={k.helper} />
      ))}
    </div>
  );
}