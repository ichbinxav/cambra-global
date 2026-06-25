import React, { useMemo, useState } from "react";

export default function SavingsEstimator() {
  const [monthlyRevenue, setMonthlyRevenue] = useState(50000);
  const [monthlyShipping, setMonthlyShipping] = useState(4000);
  const [monthlySaaS, setMonthlySaaS] = useState(2500);

  // Assumptions aligned with Analyzer defaults:
  // Payments: 2.9% → tier benchmark (typical delta ~1.5pp) on revenue
  // Shipping: -18% on declared shipping spend
  // SaaS: -30% on declared SaaS spend
  const estimate = useMemo(() => {
    const payMonthly = Number(monthlyRevenue || 0) * 0.015; // 1.5% delta
    const shipMonthly = Number(monthlyShipping || 0) * 0.18;
    const saasMonthly = Number(monthlySaaS || 0) * 0.30;
    const annual = (payMonthly + shipMonthly + saasMonthly) * 12;
    return Math.max(0, Math.round(annual));
  }, [monthlyRevenue, monthlyShipping, monthlySaaS]);

  const benchmarkScore = 85;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/70 backdrop-blur p-4 sm:p-5 mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">quick diagnostic</p>
        <span className="text-[10px] text-muted-foreground/50">Indicative</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-5 rounded-2xl border border-border/40 bg-background shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Estimated savings</p>
          <p className="text-4xl sm:text-5xl font-black tracking-tight text-green-600 tabular-nums">
            €{estimate.toLocaleString()}<span className="text-sm font-normal text-muted-foreground/60">/yr</span>
          </p>
        </div>
        <div className="p-5 rounded-2xl border border-border/40 bg-secondary/40 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Benchmark</p>
            <p className="text-4xl sm:text-5xl font-black tracking-tight">{benchmarkScore}</p>
          </div>
          <div className="text-[10px] text-muted-foreground/60 max-w-[220px] text-right hidden sm:block">
            Network benchmark at this scale.
          </div>
        </div>
      </div>

      <div className="mt-4">
        <a href="/Analyzer" className="inline-flex items-center gap-2 px-5 h-11 rounded-full text-sm font-bold text-white bg-saas-gradient shadow-lg hover:opacity-95 transition-opacity">
          Run the analyzer
        </a>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground/50">Estimate only — finalized once the Analyzer runs on your data.</p>
    </div>
  );
}