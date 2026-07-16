import React from "react";

// Map a Tailwind text color class to a bright variant that pops on navy
const TEXT_ON_NAVY = {
  "text-purple-600": "text-[#C49AFF]",
  "text-green-600":  "text-[#2FE0A8]",
  "text-amber-600":  "text-[#FFC85A]",
  "text-red-600":    "text-[#FF8A8A]",
  "text-blue-600":   "text-[#8B7BFF]",
  "text-foreground": "text-white",
};

const GLOW_MAP = {
  "text-purple-600": "rgba(196,154,255,0.50)",
  "text-green-600":  "rgba(82,235,164,0.45)",
  "text-amber-600":  "rgba(255,200,90,0.45)",
  "text-red-600":    "rgba(255,138,138,0.45)",
  "text-blue-600":   "rgba(122,168,255,0.50)",
  "text-foreground": "rgba(80,210,235,0.45)",
};

function Card({ title, value, subtitle, colorClass = "text-foreground", helper }) {
  const glow = GLOW_MAP[colorClass] || "rgba(80,210,235,0.4)";
  const textClass = TEXT_ON_NAVY[colorClass] || "text-white";
  return (
    <div className="cambra-card cambra-card--soft cambra-card--compact group p-4 min-w-[140px]">
      <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-60 group-hover:opacity-100 transition-opacity"
           style={{ background: `radial-gradient(closest-side, ${glow}, transparent)`, zIndex: 0 }} />
      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/55 font-semibold mb-1.5">{title}</p>
        <p className={`text-2xl font-black tabular-nums tracking-tight ${textClass}`}>{value}</p>
        {subtitle && <p className="text-[11px] text-white/55 mt-1.5 leading-snug">{subtitle}</p>}
        {helper && <p className="text-[10px] text-white/40 mt-1">{helper}</p>}
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