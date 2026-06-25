import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle2, XCircle, Loader2, ListChecks, Database, RotateCcw } from "lucide-react";

const CHECKLIST = [
  { key: "brand_onboarding", label: "Brand onboarding test" },
  { key: "analyzer_run", label: "Analyzer run test" },
  { key: "unlock_savings", label: "Unlock savings test" },
  { key: "mandate_creation", label: "Mandate creation test" },
  { key: "authorization_log", label: "Authorization log test" },
  { key: "migration_task_generation", label: "Migration task generation test" },
  { key: "monthly_savings_report", label: "Monthly savings report test" },
  { key: "invoice_generation", label: "Invoice generation test" },
  { key: "api_key_creation_flow", label: "API key creation test" },
  { key: "rls_admin_access", label: "RLS permission test (admin)" },
];

export default function FlowSelfTestPanel() {
  const [running, setRunning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [report, setReport] = useState(null);
  const [seedResult, setSeedResult] = useState(null);
  const [error, setError] = useState(null);

  const runFlow = async () => {
    setRunning(true); setError(null);
    try {
      const { data } = await base44.functions.invoke("runFlowSelfTests", {});
      setReport(data);
    } catch (e) {
      setError(e.message || "Flow test runner failed");
    }
    setRunning(false);
  };

  const seed = async (reset = false) => {
    reset ? setResetting(true) : setSeeding(true);
    setError(null);
    try {
      const url = reset ? "/functions/seedDemoData?reset=true" : "/functions/seedDemoData";
      const { data } = await base44.functions.invoke("seedDemoData", reset ? { reset: true } : {});
      setSeedResult(data);
    } catch (e) {
      setError(e.message || "Seeding failed");
    }
    reset ? setResetting(false) : setSeeding(false);
  };

  const lookup = (key) => report?.results.find(r => r.name === key);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2"><ListChecks className="h-4 w-4" /> End-to-End Flow Tests</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Validates the full Brand → Analyzer → Recommendation → DealActivation → Mandate → MigrationTask
            → MonthlySavingsReport → Invoice flow. All test records are cleaned up after the run.
          </p>
        </div>
        <Button onClick={runFlow} disabled={running} size="sm" className="gap-1.5 shrink-0">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Running…" : "Run flow tests"}
        </Button>
      </div>

      {/* Checklist */}
      <div className="rounded-xl border border-border/60 divide-y divide-border/40">
        {CHECKLIST.map(item => {
          const r = lookup(item.key);
          const status = r?.status;
          return (
            <div key={item.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm font-medium">{item.label}</span>
              <span className="flex items-center gap-2">
                {!r && <span className="text-[10px] text-muted-foreground">not run</span>}
                {status === "pass" && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> pass</span>}
                {status === "fail" && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700" title={typeof r.details === "string" ? r.details : JSON.stringify(r.details)}><XCircle className="h-3.5 w-3.5" /> fail</span>}
              </span>
            </div>
          );
        })}
      </div>

      {report && (
        <div className="grid grid-cols-4 gap-3">
          <Metric label="Total" value={report.summary.total} />
          <Metric label="Passed" value={report.summary.passed} tone="green" />
          <Metric label="Failed" value={report.summary.failed} tone="red" />
          <Metric label="Pass rate" value={`${report.summary.pass_rate}%`} />
        </div>
      )}

      <div className="pt-6 border-t border-border/40 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2"><Database className="h-4 w-4" /> Demo data</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Seed 3 fake brands, 3 analyzer results, 3 recommendations, 2 deal activations, 1 mandate, 1 monthly savings report, 1 invoice and 3 providers. All marked with <code>[DEMO]</code> prefix and <code>is_demo: true</code>.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => seed(false)} disabled={seeding || resetting} size="sm" variant="outline" className="gap-1.5">
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
              Seed
            </Button>
            <Button onClick={() => seed(true)} disabled={seeding || resetting} size="sm" variant="ghost" className="gap-1.5">
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Reset & re-seed
            </Button>
          </div>
        </div>
        {seedResult && (
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs font-mono">
            {seedResult.status === "seeded" ? (
              <div className="space-y-1">
                <div className="font-bold text-green-700">✓ Seeded</div>
                <div>Brands: {seedResult.summary.brands} · Providers: {seedResult.summary.providers} · Results: {seedResult.summary.results}</div>
                <div>Activations: {seedResult.summary.activations} · Mandate: {seedResult.summary.mandate} · Report: {seedResult.summary.report} · Invoice: {seedResult.summary.invoice}</div>
              </div>
            ) : (
              <div>Already seeded ({seedResult.count} demo brands present)</div>
            )}
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700">{error}</div>}
    </div>
  );
}

function Metric({ label, value, tone }) {
  const cls = tone === "green" ? "border-green-500/30 bg-green-500/5 text-green-700"
    : tone === "red" ? "border-red-500/30 bg-red-500/5 text-red-700"
    : "border-border/60";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}