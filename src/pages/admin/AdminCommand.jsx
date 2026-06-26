import { useEffect, useState, useMemo } from "react";
import { LayoutDashboard, RefreshCw } from "lucide-react";
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
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-white text-xs font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
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
        <div className="rounded-2xl border border-border/60 bg-white p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <AgentGrid activeSecrets={activeSecrets} lastTaskByAgent={lastTaskByAgent} />
      )}

      {/* 4. Recent activity */}
      <RecentActivity tasks={pulse?.recent_activity || []} />
    </div>
  );
}