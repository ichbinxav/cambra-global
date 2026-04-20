import React, { useMemo, useState } from "react";

export default function SavingsEstimator() {
  const [monthlyRevenue, setMonthlyRevenue] = useState(50000);
  const [monthlyShipping, setMonthlyShipping] = useState(4000);
  const [monthlySaaS, setMonthlySaaS] = useState(2500);

  // Assumptions aligned with Analyzer defaults:
  // Payments: 2.9% → 1.4% (delta 1.5%) on revenue
  // Shipping: -18% on declared shipping spend
  // SaaS: -30% on declared SaaS spend
  const estimate = useMemo(() => {
    const payMonthly = Number(monthlyRevenue || 0) * 0.015; // 1.5% delta
    const shipMonthly = Number(monthlyShipping || 0) * 0.18;
    const saasMonthly = Number(monthlySaaS || 0) * 0.30;
    const annual = (payMonthly + shipMonthly + saasMonthly) * 12;
    return Math.max(0, Math.round(annual));
  }, [monthlyRevenue, monthlyShipping, monthlySaaS]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/70 backdrop-blur p-4 sm:p-5 mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">Estimate · Benchmarks</p>
        <span className="text-[10px] text-muted-foreground/50">Indicative only</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="text-[11px] text-muted-foreground/60">
          <span className="block mb-1">Monthly revenue (€)</span>
          <input
            type="number"
            value={monthlyRevenue}
            onChange={(e)=>setMonthlyRevenue(Number(e.target.value))}
            className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm"
            min={0}
          />
        </label>
        <label className="text-[11px] text-muted-foreground/60">
          <span className="block mb-1">Monthly shipping spend (€)</span>
          <input
            type="number"
            value={monthlyShipping}
            onChange={(e)=>setMonthlyShipping(Number(e.target.value))}
            className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm"
            min={0}
          />
        </label>
        <label className="text-[11px] text-muted-foreground/60">
          <span className="block mb-1">Monthly SaaS spend (€)</span>
          <input
            type="number"
            value={monthlySaaS}
            onChange={(e)=>setMonthlySaaS(Number(e.target.value))}
            className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm"
            min={0}
          />
        </label>
      </div>
      <div className="mt-4 p-4 rounded-xl bg-secondary/40 border border-border/40 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Estimated optimization potential</p>
          <p id="avg-savings-display" className="text-2xl sm:text-3xl font-black tracking-tight text-green-600 tabular-nums">
            €{estimate.toLocaleString()}<span className="text-sm font-normal text-muted-foreground/60">/yr</span>
          </p>
        </div>
        <div className="text-[10px] text-muted-foreground/60 max-w-[220px] text-right hidden sm:block">
          Based on network benchmarks (payments −1.5pp, shipping −18%, SaaS −30%). Finalized by the Analyzer.
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/50">
        Estimate only — realized savings depend on your actual data and activation.
      </p>
    </div>
  );
}