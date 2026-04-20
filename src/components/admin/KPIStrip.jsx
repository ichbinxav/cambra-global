import React from "react";

function Card({ title, value, subtitle, colorClass = "text-foreground", helper }) {
  return (
    <div className="p-4 rounded-xl border border-border/50 bg-card min-w-[140px]">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">{title}</p>
      <p className={`text-2xl font-black tabular-nums ${colorClass}`}>{value}</p>
      {subtitle && <p className="text-[11px] text-muted-foreground/40 mt-1">{subtitle}</p>}
      {helper && <p className="text-[10px] text-muted-foreground/40 mt-1">{helper}</p>}
    </div>
  );
}

export default function KPIStrip({
  kpis
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((k, i) => (
        <Card key={i} title={k.title} value={k.value} subtitle={k.subtitle} colorClass={k.color} helper={k.helper} />
      ))}
    </div>
  );
}