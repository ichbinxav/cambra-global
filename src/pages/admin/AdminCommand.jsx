import { useEffect, useState, useMemo } from "react";
import { LayoutDashboard, RefreshCw, FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PulseBar from "@/components/admin/command/PulseBar";
import CopilotBrief from "@/components/admin/command/CopilotBrief";
import AgentGrid from "@/components/admin/command/AgentGrid";
import RecentActivity from "@/components/admin/command/RecentActivity";
import AgentQuestionCard from "@/components/admin/inbox/AgentQuestionCard";
import { CLUSTERS } from "@/lib/agentRegistry";

export default function AdminCommand() {
  const [pulse, setPulse] = useState(null);
  const [activeSecrets, setActiveSecrets] = useState([]);
  const [lastTaskByAgent, setLastTaskByAgent] = useState({});
  const [lastBrief, setLastBrief] = useState(null);
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // FASE 2 (Opción B) — dev-only self-test brand creator. Fires
  // `createSelfTestBrand` from the admin's authenticated session so the
  // resulting Brand row is owned by the caller (created_by_id = xavi.id).
  // Displays the returned brand_id so it can be re-pointed from the
  // Integration side by a follow-up service-role step.
  const [selfTestState, setSelfTestState] = useState({ status: "idle", result: null, error: null });

  const createSelfTestBrand = async () => {
    setSelfTestState({ status: "running", result: null, error: null });
    try {
      const res = await base44.functions.invoke("createSelfTestBrand", {});
      const data = res?.data || res;
      if (data?.ok) {
        setSelfTestState({ status: "done", result: data, error: null });
      } else {
        setSelfTestState({ status: "error", result: null, error: data?.error || "Unknown error" });
      }
    } catch (e) {
      setSelfTestState({ status: "error", result: null, error: e.message });
    }
  };

  const totalAgents = useMemo(() => CLUSTERS.reduce((acc, c) => acc + c.agents.length, 0), []);
  const activeAgents = useMemo(() => {
    let count = 0;
    for (const c of CLUSTERS) {
      for (const a of c.agents) {
        if (!a.secret || activeSecrets.includes(a.secret)) count++;
      }
    }
    return count;
  }, [activeSecrets]);

  const load = async () => {
    setRefreshing(true);
    try {
      const [pulseRes, briefs, questions, allTasks] = await Promise.all([
        base44.functions.invoke("getCommandCenterPulse", {}).then(r => r?.data || r).catch(() => null),
        base44.entities.AgentTask.filter({ agent_name: "founder_copilot", status: "completed" }, "-completed_at", 1).catch(() => []),
        base44.entities.AgentQuestion.filter({ status: "pending" }, "-created_date", 5).catch(() => []),
        base44.entities.AgentTask.list("-created_date", 200).catch(() => []),
      ]);
      setPulse(pulseRes);
      setLastBrief(briefs[0] || null);
      setPendingQuestions(questions || []);

      // Latest task per agent_name (functionName)
      // Match by agent_name; our registry uses fn names but tasks use agent_name strings
      const map = {};
      const FN_TO_AGENT_NAME = {
        founderCopilotAgent: "founder_copilot",
        investorUpdateAgent: "investor_update",
        qaAgent: "qa",
        leadDiscoveryAgent: "lead_discovery",
        leadEnrichmentAgent: "lead_enrichment",
        leadScoringAgent: "lead_scoring",
        crmAgent: "crm",
        outreachAgent: "outreach",
        followUpAgent: "follow_up",
        meetingAgent: "meeting",
        blogAgent: "blog",
        newsletterAgent: "newsletter",
        linkedinAgent: "linkedin",
        xTwitterAgent: "x_twitter",
        seoAgent: "seo",
        competitorMonitorAgent: "competitor_monitor",
        providerResearchAgent: "provider_research",
        providerMonitorAgent: "provider_monitor",
        gdprAgent: "gdpr",
        complianceAgent: "compliance",
        legalReviewAgent: "legal_review",
        contractIPAgent: "contract_ip",
        codeReviewAgent: "code_review",
        securityAgent: "security",
        qaMonitorAgent: "qa_monitor",
        engineeringReportAgent: "engineering_report",
        fixValidatorAgent: "fix_validator",
        discoveryTechStackAgent: "discovery_tech_stack",
        spendIntelligenceAgent: "spend_intelligence",
        recommendationEngineAgent: "recommendation_engine",
        brainOrchestrator: "brain_orchestrator",
        systemHealthAgent: "system_health",
      };
      for (const [fn, an] of Object.entries(FN_TO_AGENT_NAME)) {
        const t = allTasks.find(x => x.agent_name === an);
        if (t) map[fn] = t;
      }
      setLastTaskByAgent(map);

      // Detect which secrets are "live" by sampling: any successful task in the
      // last 7 days from an agent that depends on a secret means the secret is set.
      // (We can't read Deno.env from the client. This is the cleanest proxy.)
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const successful = allTasks.filter(t => t.status === "completed" && (t.completed_at || t.created_date) >= since7d);
      const activeSet = new Set();
      for (const cluster of CLUSTERS) {
        for (const a of cluster.agents) {
          if (!a.secret) continue;
          const agentNameInDb = FN_TO_AGENT_NAME[a.fn];
          if (successful.some(t => t.agent_name === agentNameInDb)) activeSet.add(a.secret);
        }
      }
      setActiveSecrets([...activeSet]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <LayoutDashboard size={18} /> Command Center
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Tu vista única sobre la máquina: el pulso, el copiloto, los agentes y la actividad reciente.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-card text-xs font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* 1. Pulse */}
      <PulseBar pulse={pulse} activeAgents={activeAgents} totalAgents={totalAgents} />

      {/* 2. Brief */}
      <CopilotBrief events={pulse?.recent_significant_events || []} lastBrief={lastBrief} />

      {/* Inbox preview — pending questions */}
      {pendingQuestions.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black tracking-tight">Agents waiting for your input</h3>
            <Link to="/admin/inbox" className="text-[11px] font-bold text-foreground hover:underline">Open Inbox →</Link>
          </div>
          <div className="space-y-2">
            {pendingQuestions.slice(0, 3).map(q => (
              <AgentQuestionCard key={q.id} question={q} onAnswered={() => load()} />
            ))}
          </div>
        </div>
      )}

      {/* 3. Agents */}
      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <AgentGrid activeSecrets={activeSecrets} lastTaskByAgent={lastTaskByAgent} />
      )}

      {/* 4. Recent activity */}
      <RecentActivity tasks={pulse?.recent_activity || []} />

      {/* FASE 2 (Opción B) — dev-only harness. Remove after the self-test
          brand infrastructure stabilizes post-FASE-3. */}
      <div className="rounded-2xl border border-dashed border-amber-300/60 bg-amber-50/30 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
              <FlaskConical size={14} className="text-amber-700" />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight">Dev · Self-test brand</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Creates <code className="text-[10px] bg-secondary px-1 rounded">CAMBRA (self-test)</code> under your identity (idempotent). FASE 2 · Opción B.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={createSelfTestBrand}
            disabled={selfTestState.status === "running"}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold hover:opacity-90 disabled:opacity-50"
          >
            {selfTestState.status === "running" ? "Creating…" : "Create self-test brand"}
          </button>
        </div>
        {selfTestState.result && (
          <div className="mt-3 text-[11px] font-mono bg-white/60 border border-amber-200 rounded-lg p-2.5 space-y-1">
            <p><span className="text-muted-foreground">brand_id:</span> <span className="font-bold">{selfTestState.result.brand_id}</span></p>
            <p><span className="text-muted-foreground">created_by_id:</span> {selfTestState.result.created_by_id}</p>
            <p><span className="text-muted-foreground">reused:</span> {selfTestState.result.reused ? "yes (already existed)" : "no (fresh create)"}</p>
          </div>
        )}
        {selfTestState.error && (
          <p className="mt-3 text-[11px] text-red-600 font-mono">{selfTestState.error}</p>
        )}
      </div>
    </div>
  );
}