import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, Users, Globe2, CreditCard, AlertTriangle, RefreshCw } from "lucide-react";

/**
 * AggregateDemandPanel — admin-only.
 *
 * Reads getWaitlistAggregate and renders:
 *   - three headline KPIs (linked brands, combined savings, combined GMV)
 *   - breakdown tables by tier, country, payment provider
 *   - trust banner: unverified/manual/anonymous figures are excluded from all
 *     economic totals rather than being softened by a warning.
 *
 * Pure presentation. No calculations happen here.
 */
export default function AggregateDemandPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("getWaitlistAggregate", {});
      const payload = res?.data || res;
      if (payload?.ok) setData(payload.aggregate);
      else setError(payload?.error || "Failed to load");
    } catch (e) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 text-center text-sm text-muted-foreground">Loading demand aggregate…</div>;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-6">
        <p className="text-sm font-semibold text-red-300 mb-1">Couldn't load aggregate</p>
        <p className="text-xs text-red-300/70">{error}</p>
        <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-200 hover:text-white">
          <RefreshCw size={11} /> Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black tracking-tight text-foreground">Aggregate demand</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verified demand evidence only. Estimates remain visible as excluded counts.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 text-[11px] font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Trust banner — no unverified estimate enters an economic total. */}
      <div
        className="flex items-start gap-3 rounded-xl px-4 py-3"
        style={{
          background: "rgba(245,158,11,0.06)",
          border: "1px solid rgba(245,158,11,0.20)",
        }}
      >
        <AlertTriangle size={14} className="text-amber-300 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-amber-100/80 leading-relaxed">
          <span className="font-bold text-amber-200">Verified-only totals.</span>{" "}
          {data.unverified_excluded.toLocaleString("en-US")} linked estimate(s) are excluded because they lack verified integration/vertical provenance. Per-brand outliers above
          €{data.caps.savings_per_brand.toLocaleString("en-US")}/yr in savings or
          €{data.caps.monthly_revenue.toLocaleString("en-US")}/mo in revenue are dropped from the aggregate.
          {data.outliers_dropped > 0 && (
            <> Currently dropped: <span className="font-bold text-amber-200">{data.outliers_dropped}</span>.</>
          )}
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi
          icon={Users}
          label="Verified linked brands"
          value={data.linked_brands.toLocaleString("en-US")}
          hint={`${data.linked_estimates} linked estimates · ${data.unverified_excluded} unverified excluded · ${data.total_signups} signups`}
        />
        <Kpi
          icon={TrendingUp}
          label="Combined savings"
          value={`€${(data.combined_savings_yearly).toLocaleString("en-US")}`}
          hint="per year, verified evidence only"
        />
        <Kpi
          icon={CreditCard}
          label="Combined GMV"
          value={`€${(data.combined_annual_gmv).toLocaleString("en-US")}`}
          hint={`€${data.combined_monthly_revenue.toLocaleString("en-US")}/mo across verified linked brands`}
        />
      </div>

      {/* Breakdown grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BreakdownCard title="By revenue tier" rows={tierRows(data.by_tier)} />
        <BreakdownCard title="By country" rows={countryRows(data.by_country)} icon={Globe2} />
        <ProviderCard providers={data.by_payment_provider} />
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }) {
  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className="text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-black text-foreground tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

const TIER_ORDER = ["large", "mid", "small", "micro"];
const TIER_LABEL = { large: "Large (>€500K/mo)", mid: "Mid (€100–500K/mo)", small: "Small (€30–100K/mo)", micro: "Micro (<€30K/mo)" };

function tierRows(byTier) {
  return TIER_ORDER
    .filter((t) => byTier[t])
    .map((t) => ({
      label: TIER_LABEL[t] || t,
      brands: byTier[t].brands,
      savings: byTier[t].savings,
    }));
}

function countryRows(byCountry) {
  return Object.entries(byCountry || {})
    .map(([label, v]) => ({ label, brands: v.brands, savings: v.savings }))
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 8);
}

function BreakdownCard({ title, rows, icon: Icon = null }) {
  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={13} className="text-muted-foreground" />}
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No linked brands yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-xs">
              <span className="text-foreground/85 truncate mr-2">{r.label}</span>
              <span className="flex items-center gap-2 text-muted-foreground shrink-0">
                <span className="tabular-nums">{r.brands}</span>
                <span className="text-muted-foreground/60">·</span>
                <span className="tabular-nums text-cyan-300">€{Math.round(r.savings).toLocaleString("en-US")}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({ providers }) {
  const rows = Object.entries(providers || {})
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <CreditCard size={13} className="text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">By payment provider</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No provider data captured yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between text-xs">
              <span className="text-foreground/85 truncate mr-2">{r.name}</span>
              <span className="tabular-nums text-muted-foreground">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
