// DASHBOARD-C14 (2026-08-17) — UNROUTED by founder decision. This page has no route and no
// sidebar entry. It is kept, not deleted: see unmapped_routes in
// config/dashboard/navigation.v1.json for the decision and the condition for its return.
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, RefreshCw, AlertTriangle, FileText, Bug } from "lucide-react";

function fmtTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "just now";
    const m = Math.floor(diff / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return d.toLocaleString();
  } catch { return iso; }
}

function AgentPanel({ title, description, icon: Icon, onRun, busy, lastTask, error, children }) {
  const status = lastTask?.status;
  const statusCls = {
    completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    waiting_approval: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    running: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    failed: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  }[status] || "bg-secondary text-muted-foreground border-border/60";

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-secondary border border-border/60 flex items-center justify-center">
          <Icon size={14} className="text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black tracking-tight">{title}</p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
        {lastTask && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusCls}`}>
            {status?.replace("_", " ")}
          </span>
        )}
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {busy ? "Running…" : "Run"}
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {children}

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 flex items-start gap-2">
            <AlertTriangle size={12} className="text-rose-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-bold text-rose-700">Error</p>
              <p className="text-[11px] text-rose-700 font-mono whitespace-pre-wrap break-words">{error}</p>
            </div>
          </div>
        )}

        {lastTask && (
          <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 flex items-center gap-2 flex-wrap">
            <span>Last run: <span className="text-foreground font-semibold">{fmtTime(lastTask.created_date)}</span></span>
            {lastTask.output_summary && <span className="truncate">· {lastTask.output_summary}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminCopilot() {
  const [busy, setBusy] = useState({ brief: false, investor: false, qa: false });
  const [errors, setErrors] = useState({ brief: null, investor: null, qa: null });
  const [lastTasks, setLastTasks] = useState({ brief: null, investor: null, qa: null });
  const [brief, setBrief] = useState("");
  const [investorDraft, setInvestorDraft] = useState(null);
  const [qaReport, setQaReport] = useState("");

  const [investorMonth, setInvestorMonth] = useState(new Date().getUTCMonth() + 1);
  const [investorYear, setInvestorYear] = useState(new Date().getUTCFullYear());
  const [qaFlows, setQaFlows] = useState("analyzer_run, stripe_connect, deal_activation, savings_report");

  const loadLast = async (agent_name, key) => {
    try {
      const rows = await base44.entities.AgentTask
        .filter({ agent_name }, "-created_date", 1);
      if (rows?.[0]) {
        setLastTasks(prev => ({ ...prev, [key]: rows[0] }));
        // Hydrate output if present
        const payload = rows[0].output_payload_json;
        if (key === "brief" && payload?.brief) setBrief(payload.brief);
        if (key === "investor" && payload?.metrics) setInvestorDraft({ metrics: payload.metrics, status: rows[0].status });
        if (key === "qa" && payload?.report) setQaReport(payload.report);
      }
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    loadLast("founder_copilot", "brief");
    loadLast("investor_update", "investor");
    loadLast("qa", "qa");
  }, []);

  const runBrief = async () => {
    setBusy(b => ({ ...b, brief: true }));
    setErrors(e => ({ ...e, brief: null }));
    try {
      const res = await base44.functions.invoke("founderCopilotAgent", {});
      const data = res?.data || res;
      if (data?.ok) {
        setBrief(data.brief || "");
      } else {
        setErrors(e => ({ ...e, brief: data?.error || "Unknown error" }));
      }
      await loadLast("founder_copilot", "brief");
    } catch (err) {
      setErrors(e => ({ ...e, brief: err?.message || "Network error" }));
    } finally {
      setBusy(b => ({ ...b, brief: false }));
    }
  };

  const runInvestor = async () => {
    setBusy(b => ({ ...b, investor: true }));
    setErrors(e => ({ ...e, investor: null }));
    try {
      const res = await base44.functions.invoke("investorUpdateAgent", { month: investorMonth, year: investorYear });
      const data = res?.data || res;
      if (data?.ok) {
        setInvestorDraft({ metrics: data.metrics, period: data.period, approval_id: data.approval_id, status: "waiting_approval" });
      } else {
        setErrors(e => ({ ...e, investor: data?.error || "Unknown error" }));
      }
      await loadLast("investor_update", "investor");
    } catch (err) {
      setErrors(e => ({ ...e, investor: err?.message || "Network error" }));
    } finally {
      setBusy(b => ({ ...b, investor: false }));
    }
  };

  const runQA = async () => {
    setBusy(b => ({ ...b, qa: true }));
    setErrors(e => ({ ...e, qa: null }));
    try {
      const flows = qaFlows.split(",").map(s => s.trim()).filter(Boolean);
      const res = await base44.functions.invoke("qaAgent", { flows });
      const data = res?.data || res;
      if (data?.ok) {
        setQaReport(data.report || "");
      } else {
        setErrors(e => ({ ...e, qa: data?.error || "Unknown error" }));
      }
      await loadLast("qa", "qa");
    } catch (err) {
      setErrors(e => ({ ...e, qa: err?.message || "Network error" }));
    } finally {
      setBusy(b => ({ ...b, qa: false }));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Sparkles size={18} /> Founder Copilot
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Daily brief, investor updates, and QA — powered by Claude. Each run creates an AgentTask
          in Activity Log; investor updates create an Approval.
        </p>
      </div>

      {/* Founder Copilot — daily brief */}
      <AgentPanel
        title="Daily brief"
        description="Pending approvals + failed tasks 24h + active brands → 300-word briefing"
        icon={Sparkles}
        onRun={runBrief}
        busy={busy.brief}
        lastTask={lastTasks.brief}
        error={errors.brief}
      >
        {brief ? (
          <pre className="text-[12px] text-foreground whitespace-pre-wrap break-words font-sans bg-secondary/40 rounded-lg p-3 max-h-[28rem] overflow-auto">
            {brief}
          </pre>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">No brief generated yet. Click Run.</p>
        )}
      </AgentPanel>

      {/* Investor update */}
      <AgentPanel
        title="Investor update"
        description="Monthly metrics → drafted update → goes to Approval Center for review"
        icon={FileText}
        onRun={runInvestor}
        busy={busy.investor}
        lastTask={lastTasks.investor}
        error={errors.investor}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] font-bold text-muted-foreground">Month</label>
          <input
            type="number"
            min={1} max={12}
            value={investorMonth}
            onChange={(e) => setInvestorMonth(Number(e.target.value))}
            className="h-8 w-16 px-2 rounded-lg border border-border/60 bg-card text-xs font-semibold text-foreground"
          />
          <label className="text-[11px] font-bold text-muted-foreground ml-2">Year</label>
          <input
            type="number"
            min={2024} max={2100}
            value={investorYear}
            onChange={(e) => setInvestorYear(Number(e.target.value))}
            className="h-8 w-20 px-2 rounded-lg border border-border/60 bg-card text-xs font-semibold text-foreground"
          />
        </div>
        {investorDraft?.metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(investorDraft.metrics)
              .filter(([k]) => k !== "period")
              .map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border/40 bg-secondary/30 px-3 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{k.replace(/_/g, " ")}</p>
                  <p className="text-sm font-black tabular-nums">{typeof v === "number" ? v.toLocaleString() : String(v)}</p>
                </div>
              ))}
          </div>
        )}
        {investorDraft?.status === "waiting_approval" && (
          <p className="text-[11px] text-amber-700 font-bold">
            Draft created. Review it in /admin/approvals to approve or reject.
          </p>
        )}
      </AgentPanel>

      {/* QA Agent */}
      <AgentPanel
        title="QA agent"
        description="Generates test cases + regressions for the listed flows"
        icon={Bug}
        onRun={runQA}
        busy={busy.qa}
        lastTask={lastTasks.qa}
        error={errors.qa}
      >
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">Flows (comma-separated)</label>
          <input
            type="text"
            value={qaFlows}
            onChange={(e) => setQaFlows(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-lg border border-border/60 bg-card text-xs font-semibold text-foreground"
          />
        </div>
        {qaReport ? (
          <pre className="text-[12px] text-foreground whitespace-pre-wrap break-words font-sans bg-secondary/40 rounded-lg p-3 max-h-[28rem] overflow-auto">
            {qaReport}
          </pre>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">No QA report yet. Click Run.</p>
        )}
      </AgentPanel>
    </div>
  );
}