import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { TrendingUp, FileSignature, ListChecks, Receipt, CheckCircle2, Clock, Loader2, ArrowRight } from "lucide-react";

const STAGES = [
  { key: "proposed", label: "Proposed", icon: ListChecks, color: "text-muted-foreground" },
  { key: "awaiting_authorization", label: "Awaiting authorization", icon: FileSignature, color: "text-amber-600" },
  { key: "authorized", label: "Authorized", icon: CheckCircle2, color: "text-blue-600" },
  { key: "migrating", label: "Migrating", icon: Clock, color: "text-blue-600" },
  { key: "live", label: "Live", icon: CheckCircle2, color: "text-green-600" },
  { key: "monetizing", label: "Verified / Invoiced", icon: Receipt, color: "text-green-700" },
];

export default function RecoveryTracker() {
  const [activations, setActivations] = useState([]);
  const [mandates, setMandates] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [reports, setReports] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [a, m, t, r, i] = await Promise.all([
      base44.entities.DealActivation.list("-created_date", 50).catch(() => []),
      base44.entities.Mandate.list("-created_date", 50).catch(() => []),
      base44.entities.MigrationTask.list("-created_date", 100).catch(() => []),
      base44.entities.MonthlySavingsReport.list("-created_date", 50).catch(() => []),
      base44.entities.Invoice.list("-created_date", 50).catch(() => []),
    ]);
    setActivations(a); setMandates(m); setTasks(t); setReports(r); setInvoices(i);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading recovery tracker…</div>;
  }

  const stageCount = (key) => activations.filter(a => a.status === key).length;
  const totalEstimated = activations.reduce((s, a) => s + (a.estimated_savings_yearly || 0), 0);
  const totalVerified = reports.filter(r => r.verification_status === "verified" || r.verification_status === "realized" || r.verification_status === "invoiced" || r.verification_status === "paid")
    .reduce((s, r) => s + (r.savings || 0), 0) * 12;
  const totalInvoiced = invoices.filter(i => ["issued","sent","paid","partially_paid"].includes(i.status))
    .reduce((s, i) => s + (i.total_amount || 0), 0);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border/60 bg-background/70 mb-3">
          <TrendingUp className="h-3 w-3 text-cambra-cyan" />
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-muted-foreground">Recovery</span>
        </div>
        <h1 className="font-display text-3xl font-black tracking-[-0.03em] mb-2">Recovery Tracker</h1>
        <p className="text-sm text-muted-foreground">From estimated → authorized → live → verified → invoiced.</p>
      </div>

      {/* Money stages — clear separation per the spec */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StageCard label="Estimated" sub="From analyzer" value={totalEstimated} tone="muted" />
        <StageCard label="Activated" sub="Mandate signed" value={activations.filter(a => ["authorized","migrating","live","monetizing"].includes(a.status)).reduce((s,a) => s + (a.estimated_savings_yearly||0), 0)} tone="blue" />
        <StageCard label="Verified" sub="With evidence" value={totalVerified} tone="cyan" />
        <StageCard label="Invoiced" sub="Billed" value={totalInvoiced} tone="green" />
      </div>

      {/* Stage pipeline */}
      <div>
        <h2 className="text-sm font-bold mb-3">Pipeline</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {STAGES.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.key} className="rounded-lg border border-border/60 bg-card p-3">
                <Icon className={`h-4 w-4 mb-2 ${s.color}`} />
                <div className="text-2xl font-black tabular-nums">{stageCount(s.key)}</div>
                <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activations list */}
      <div>
        <h2 className="text-sm font-bold mb-3">All activations</h2>
        {activations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-10 text-center">
            <p className="text-sm text-muted-foreground mb-3">No activations yet. Start by unlocking savings.</p>
            <Link to="/UnlockSavings"><Button size="sm">Go to Unlock Savings</Button></Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2.5 px-3 font-bold">Deal</th>
                  <th className="text-left py-2.5 px-3 font-bold">Vertical</th>
                  <th className="text-right py-2.5 px-3 font-bold">Est. /yr</th>
                  <th className="text-left py-2.5 px-3 font-bold">Mandate</th>
                  <th className="text-left py-2.5 px-3 font-bold">Tasks</th>
                  <th className="text-left py-2.5 px-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {activations.map(a => {
                  const hasMandate = mandates.some(m => m.deal_activation_id === a.id && m.status === "active");
                  const aTasks = tasks.filter(t => t.deal_activation_id === a.id);
                  const doneTasks = aTasks.filter(t => t.status === "done").length;
                  return (
                    <tr key={a.id} className="border-t border-border/40">
                      <td className="py-2.5 px-3 text-xs font-semibold">{a.deal_name || "Untitled"}</td>
                      <td className="py-2.5 px-3 text-xs">{a.vertical}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-xs">€{Math.round(a.estimated_savings_yearly || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-xs">
                        {hasMandate ? <span className="text-green-700 font-semibold">Signed</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-xs tabular-nums">{aTasks.length ? `${doneTasks}/${aTasks.length}` : "—"}</td>
                      <td className="py-2.5 px-3">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-secondary text-foreground">{a.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StageCard({ label, sub, value, tone }) {
  const toneCls = tone === "green" ? "border-green-500/30 bg-green-500/[0.04]"
    : tone === "cyan" ? "border-cambra-cyan/30 bg-cambra-cyan/[0.04]"
    : tone === "blue" ? "border-blue-500/30 bg-blue-500/[0.04]"
    : "border-border/60 bg-card";
  return (
    <div className={`rounded-xl border p-4 ${toneCls}`}>
      <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-black tabular-nums mt-1">€{Math.round(value || 0).toLocaleString()}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}