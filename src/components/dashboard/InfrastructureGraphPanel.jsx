import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  CreditCard, Truck, ShoppingBag, Package, Megaphone, BarChart3,
  Headphones, Building2, Shield, Phone, Users, Activity, Check, Sparkles, ArrowRight, AlertTriangle
} from "lucide-react";

/**
 * M6 — Infrastructure Graph Panel
 *
 * Summary widget on Dashboard. Calls getInfrastructureGraph.
 * Shows summary strip + nodes grouped by node_type with benchmark comparison.
 */

const TYPE_META = {
  payment_provider:  { label: "Payments",       icon: CreditCard },
  shipping_carrier:  { label: "Shipping",       icon: Truck },
  commerce_platform: { label: "Commerce",       icon: ShoppingBag },
  saas_tool:         { label: "SaaS",           icon: Package },
  marketing:         { label: "Marketing",      icon: Megaphone },
  analytics:         { label: "Analytics",      icon: BarChart3 },
  support:           { label: "Support",        icon: Headphones },
  bank:              { label: "Banking",        icon: Building2 },
  insurance:         { label: "Insurance",      icon: Shield },
  telecom:           { label: "Telecom",        icon: Phone },
  hr_tool:           { label: "HR",             icon: Users },
  logistics:         { label: "Logistics",      icon: Truck },
};

const STATUS_BADGE = {
  verified:  { label: "Verified",  cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  connected: { label: "Connected", cls: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  detected:  { label: "Detected",  cls: "bg-secondary text-muted-foreground border-border/60" },
  inactive:  { label: "Inactive",  cls: "bg-secondary text-muted-foreground/60 border-border/60" },
};

function Skeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 animate-pulse">
      <div className="h-3 w-40 bg-secondary rounded mb-4" />
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-secondary rounded-xl" />)}
      </div>
      <div className="space-y-2">
        {[1,2,3].map(i => <div key={i} className="h-12 bg-secondary rounded-xl" />)}
      </div>
    </div>
  );
}

export default function InfrastructureGraphPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await base44.functions.invoke("getInfrastructureGraph", {});
        const payload = res?.data || res;
        if (cancelled) return;
        if (!payload?.ok) {
          setError(payload?.error || "Could not load infrastructure graph.");
        } else {
          setData(payload);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Could not load infrastructure graph.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Skeleton />;
  if (error) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-5 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  const nodes = data?.nodes || [];
  const summary = data?.summary || {};

  if (!nodes.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 p-8 text-center">
        <div className="w-10 h-10 rounded-xl bg-secondary border border-border/60 mx-auto mb-3 flex items-center justify-center">
          <Activity size={16} className="text-muted-foreground" />
        </div>
        <h3 className="text-sm font-bold tracking-tight mb-1">Infrastructure graph empty</h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
          Run the Analyzer to map your infrastructure across payments, shipping, commerce and SaaS.
        </p>
        <Link to="/Analyzer">
          <button className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold">
            Run the Analyzer <ArrowRight size={11} />
          </button>
        </Link>
      </div>
    );
  }

  // Group by node_type
  const groups = new Map();
  for (const n of nodes) {
    const key = n.node_type || 'saas_tool';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60 font-semibold">Infrastructure graph</p>
          <p className="text-sm font-bold tracking-tight mt-0.5">Your mapped stack</p>
        </div>
        <Link to="/ConnectTools">
          <button className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
            <Sparkles size={10} /> Connect more
          </button>
        </Link>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 divide-x divide-border/30 border-b border-border/30">
        <SummaryCell label="Tools detected" value={summary.total_nodes} />
        <SummaryCell label="Connected" value={summary.connected_nodes} />
        <SummaryCell
          label="Est. infra cost / mo"
          value={`€${(summary.estimated_monthly_cost + summary.verified_monthly_cost).toLocaleString()}`}
        />
      </div>

      {/* Savings opportunity callout */}
      {summary.total_savings_opportunity > 0 && (
        <div className="px-5 py-3 border-b border-border/30 bg-emerald-500/5 flex items-center gap-2">
          <Sparkles size={12} className="text-emerald-600" />
          <p className="text-xs">
            <span className="font-bold">€{summary.total_savings_opportunity.toLocaleString()}/yr</span>
            <span className="text-muted-foreground"> savings opportunity identified vs benchmark</span>
          </p>
        </div>
      )}

      {/* Grouped nodes */}
      <div className="divide-y divide-border/20">
        {Array.from(groups.entries()).map(([type, items]) => {
          const meta = TYPE_META[type] || { label: type, icon: Package };
          return (
            <div key={type} className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <meta.icon size={11} className="text-muted-foreground" />
                <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">{meta.label}</p>
              </div>
              <div className="space-y-1.5">
                {items.map(n => <NodeRow key={n.id} node={n} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCell({ label, value }) {
  return (
    <div className="px-4 py-4 text-center">
      <p className="text-lg font-black tracking-tight tabular-nums">{value ?? 0}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function NodeRow({ node }) {
  const badge = STATUS_BADGE[node.status] || STATUS_BADGE.detected;
  const showRateCompare = node.node_type === 'payment_provider'
    && Number(node.effective_rate || 0) > 0
    && node.benchmark?.median > 0;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold truncate">{node.provider_name}</p>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${badge.cls}`}>
            {node.status === 'verified' && <Check size={8} />}
            {badge.label}
          </span>
          {showRateCompare && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {Number(node.effective_rate).toFixed(2)}% vs benchmark {Number(node.benchmark.median).toFixed(2)}%
              {node.effective_rate > node.benchmark.median && (
                <span className="ml-1 text-orange-600 inline-flex items-center gap-0.5">
                  <AlertTriangle size={8} /> above
                </span>
              )}
            </span>
          )}
        </div>
        {node.savings_opportunity > 0 && (
          <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
            €{node.savings_opportunity.toLocaleString()}/yr opportunity
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        {node.monthly_cost > 0 ? (
          <>
            <p className="text-xs font-bold tabular-nums">€{Math.round(node.monthly_cost).toLocaleString()}/mo</p>
            <p className="text-[9px] text-muted-foreground">{node.cost_confidence}</p>
          </>
        ) : (
          <p className="text-[10px] text-muted-foreground/60">—</p>
        )}
      </div>
    </div>
  );
}