import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  ShieldCheck, Megaphone, Handshake, BarChart3, KeyRound,
  Bot, Database, Lock, AlertTriangle, CheckCircle2, Circle,
} from "lucide-react";

/**
 * Admin · Compliance — READ ONLY.
 * Lists ComplianceRules grouped by category. Source of truth lives in
 * functions/seedComplianceRules. To edit rules: update the seeder and re-run.
 */

const CATEGORY_META = {
  claims:           { label: "Claims & Marketing",      icon: Megaphone },
  provider_deal:    { label: "Provider Deals",          icon: Handshake },
  benchmark:        { label: "Benchmarks",              icon: BarChart3 },
  oauth:            { label: "OAuth & Connectors",      icon: KeyRound },
  ai_action:        { label: "AI Actions",              icon: Bot },
  data_processing:  { label: "Data Processing (GDPR)",  icon: Database },
  security:         { label: "Security",                icon: Lock },
};

const CATEGORY_ORDER = [
  "claims", "provider_deal", "benchmark", "oauth",
  "ai_action", "data_processing", "security",
];

const SEVERITY_STYLES = {
  critical: "bg-red-500/10 text-red-700 border-red-500/30",
  high:     "bg-orange-500/10 text-orange-700 border-orange-500/30",
  medium:   "bg-amber-500/10 text-amber-700 border-amber-500/30",
  low:      "bg-secondary text-muted-foreground border-border/60",
};

function SeverityBadge({ severity }) {
  const cls = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {severity === "critical" && <AlertTriangle size={9} />}
      {severity}
    </span>
  );
}

function RuleRow({ rule }) {
  return (
    <div className="p-4 rounded-xl border border-border/60 bg-card">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="mt-0.5 shrink-0">
          {rule.active ? (
            <CheckCircle2 size={16} className="text-emerald-600" />
          ) : (
            <Circle size={16} className="text-muted-foreground/40" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-foreground">{rule.title}</p>
            <code className="text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {rule.rule_id}
            </code>
          </div>
          {rule.description && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rule.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {rule.blocking && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-700 text-[10px] font-bold uppercase tracking-wider">
              Blocking
            </span>
          )}
          <SeverityBadge severity={rule.severity} />
        </div>
      </div>
    </div>
  );
}

export default function AdminCompliance() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const rows = await base44.entities.ComplianceRule.list("-created_date", 200);
        setRules(rows || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalActive = rules.filter(r => r.active).length;
  const totalBlocking = rules.filter(r => r.blocking && r.active).length;
  const totalCritical = rules.filter(r => r.severity === "critical" && r.active).length;

  const byCategory = rules.reduce((acc, r) => {
    const k = r.category || "other";
    (acc[k] = acc[k] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-foreground" />
            <h1 className="text-2xl font-black tracking-tight">Compliance</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Hard rules enforced across the platform. Read-only — edit via{" "}
            <code className="font-mono text-xs bg-secondary px-1 py-0.5 rounded">functions/seedComplianceRules</code>
            {" "}and re-run the seeder.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border/60 bg-card">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active rules</p>
          <p className="text-2xl font-black tabular-nums mt-1">{loading ? "…" : totalActive}</p>
        </div>
        <div className="p-4 rounded-xl border border-border/60 bg-card">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Blocking</p>
          <p className="text-2xl font-black tabular-nums mt-1 text-red-700">{loading ? "…" : totalBlocking}</p>
        </div>
        <div className="p-4 rounded-xl border border-border/60 bg-card">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Critical severity</p>
          <p className="text-2xl font-black tabular-nums mt-1 text-red-700">{loading ? "…" : totalCritical}</p>
        </div>
      </div>

      {/* Rules grouped by category */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="p-4 rounded-xl border border-border/60 bg-card animate-pulse">
              <div className="h-3 w-48 bg-secondary rounded mb-2" />
              <div className="h-2.5 w-full bg-secondary/60 rounded" />
            </div>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="p-6 rounded-xl border border-dashed border-border/60 bg-card text-center">
          <p className="text-sm text-muted-foreground">
            No compliance rules found. Run <code className="font-mono text-xs">seedComplianceRules</code> to seed them.
          </p>
        </div>
      ) : (
        CATEGORY_ORDER.map(catKey => {
          const items = byCategory[catKey] || [];
          if (items.length === 0) return null;
          const meta = CATEGORY_META[catKey] || { label: catKey, icon: ShieldCheck };
          const Icon = meta.icon;
          return (
            <section key={catKey} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <Icon size={14} className="text-muted-foreground" />
                <h2 className="text-sm font-black tracking-tight">{meta.label}</h2>
                <span className="text-xs text-muted-foreground/60 tabular-nums">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map(r => <RuleRow key={r.id} rule={r} />)}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}