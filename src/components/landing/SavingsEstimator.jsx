import { useMemo, useState } from "react";
import { calculateSavings, computeInfraScore } from "@/lib/scoreEngine";

/**
 * Interactive landing estimator.
 *
 * Uses scoreEngine.calculateSavings — the SAME single source of truth used by
 * the real Analyzer — so the number a visitor sees here matches what they'd
 * get after signing up and running the full audit. No parallel formula.
 *
 * Inputs are intentionally minimal (revenue, payment fee %, shipping, SaaS) to
 * keep the landing surface friction-free. Everything else falls back to
 * scoreEngine's defaults / benchmarks (tier + geo aware).
 */

// Starting defaults — clearly a starting point, editable in the UI.
const DEFAULTS = {
  monthlyRevenue: 50000,
  paymentFeePct: 2.6,
  monthlyShipping: 4000,
  monthlyShipments: 600,
  monthlySaaS: 2500,
};

function fmtEUR(n) {
  return `€${Math.max(0, Math.round(n)).toLocaleString()}`;
}

function Slider({ label, value, onChange, min, max, step, format, sublabel }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">{label}</label>
        <span className="text-sm font-bold tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-secondary accent-foreground"
        aria-label={label}
      />
      {sublabel && (
        <p className="text-[10px] text-muted-foreground/50 mt-1">{sublabel}</p>
      )}
    </div>
  );
}

export default function SavingsEstimator() {
  const [monthlyRevenue, setMonthlyRevenue] = useState(DEFAULTS.monthlyRevenue);
  const [paymentFeePct, setPaymentFeePct] = useState(DEFAULTS.paymentFeePct);
  const [monthlyShipping, setMonthlyShipping] = useState(DEFAULTS.monthlyShipping);
  const [monthlySaaS, setMonthlySaaS] = useState(DEFAULTS.monthlySaaS);

  const { annualSavings, benchmarkScore } = useMemo(() => {
    // Derive shipments from a reasonable per-shipment default (~€6.50) so
    // scoreEngine's shipping math has something to work with without asking
    // the user for it directly on the landing.
    const derivedShipments = monthlyShipping > 0
      ? Math.max(1, Math.round(monthlyShipping / 6.5))
      : 0;

    const input = {
      monthly_revenue: monthlyRevenue,
      payment_fee_pct: paymentFeePct,
      monthly_shipping_cost: monthlyShipping,
      monthly_shipments: derivedShipments,
      total_saas_spend: monthlySaaS,
      avg_order_value: 60,
      country: "France", // EU benchmarks; landing visitors are mostly EU brands
    };

    const savings = calculateSavings(input);
    const score = computeInfraScore(input, "manual");
    return {
      annualSavings: savings.totalSavings,
      benchmarkScore: score.total,
    };
  }, [monthlyRevenue, paymentFeePct, monthlyShipping, monthlySaaS]);

  return (
    <div className="rounded-2xl border border-border/50 bg-card/70 backdrop-blur p-4 sm:p-5 mt-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">quick diagnostic</p>
        <span className="text-[10px] text-muted-foreground/50">Indicative</span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-5">
        <Slider
          label="Monthly revenue"
          value={monthlyRevenue}
          onChange={setMonthlyRevenue}
          min={5000}
          max={500000}
          step={1000}
          format={fmtEUR}
        />
        <Slider
          label="Payment fee %"
          value={paymentFeePct}
          onChange={setPaymentFeePct}
          min={1.0}
          max={4.0}
          step={0.05}
          format={(v) => `${v.toFixed(2)}%`}
          sublabel="Blended rate you pay today"
        />
        <Slider
          label="Monthly shipping"
          value={monthlyShipping}
          onChange={setMonthlyShipping}
          min={0}
          max={50000}
          step={100}
          format={fmtEUR}
        />
        <Slider
          label="Monthly SaaS"
          value={monthlySaaS}
          onChange={setMonthlySaaS}
          min={0}
          max={30000}
          step={100}
          format={fmtEUR}
        />
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-5 rounded-2xl border border-border/40 bg-background shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Estimated savings</p>
          <p className="text-4xl sm:text-5xl font-black tracking-tight text-green-600 tabular-nums">
            {fmtEUR(annualSavings)}<span className="text-sm font-normal text-muted-foreground/60">/yr</span>
          </p>
        </div>
        <div className="p-5 rounded-2xl border border-border/40 bg-secondary/40 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Infrastructure score</p>
            <p className="text-4xl sm:text-5xl font-black tracking-tight tabular-nums">{benchmarkScore}</p>
          </div>
          <div className="text-[10px] text-muted-foreground/60 max-w-[220px] text-right hidden sm:block">
            Same engine used in the full Analyzer.
          </div>
        </div>
      </div>

      <div className="mt-4">
        <a href="/Analyzer" className="inline-flex items-center gap-2 px-5 h-11 rounded-full text-sm font-bold text-white bg-saas-gradient shadow-lg hover:opacity-95 transition-opacity">
          Run the full analyzer
        </a>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground/50">Estimate only — finalized once the Analyzer runs on your real data.</p>
    </div>
  );
}