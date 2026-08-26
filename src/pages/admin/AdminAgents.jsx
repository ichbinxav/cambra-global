import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Bot, Play, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { CLUSTERS } from '@/lib/agentRegistry';

const NAME = {
  founderCopilotAgent: 'founder_copilot',
  investorUpdateAgent: 'investor_update',
  qaAgent: 'qa',
  leadDiscoveryAgent: 'lead_discovery',
  leadEnrichmentAgent: 'lead_enrichment',
  leadScoringAgent: 'lead_scoring',
  crmAgent: 'crm',
  outreachAgent: 'outreach',
  followUpAgent: 'follow_up',
  meetingAgent: 'meeting',
  blogAgent: 'blog',
  newsletterAgent: 'newsletter',
  linkedinAgent: 'linkedin',
  xTwitterAgent: 'x_twitter',
  seoAgent: 'seo',
  competitorMonitorAgent: 'competitor_monitor',
  providerResearchAgent: 'provider_research',
  providerMonitorAgent: 'provider_monitor',
  gdprAgent: 'gdpr',
  complianceAgent: 'compliance',
  legalReviewAgent: 'legal_review',
  contractIPAgent: 'contract_ip',
  codeReviewAgent: 'code_review',
  securityAgent: 'security',
  qaMonitorAgent: 'qa_monitor',
  engineeringReportAgent: 'engineering_report',
  fixValidatorAgent: 'fix_validator',
  discoveryTechStackAgent: 'discovery_tech_stack',
  spendIntelligenceAgent: 'spend_intelligence',
  recommendationEngineAgent: 'recommendation_engine',
  brainOrchestrator: 'brain_orchestrator',
  systemHealthAgent: 'system_health',
};

const EMPTY_DATA = { latest: {}, recent: [] };
const DISCOVERY_MARKETS = [
  ["ES", "Spain"], ["IT", "Italy"], ["PT", "Portugal"], ["GB", "United Kingdom"], ["GR", "Greece"],
  ["HR", "Croatia"], ["DE", "Germany"], ["PL", "Poland"], ["CZ", "Czech Republic"], ["CY", "Cyprus"],
];

const statusClass = (status) => {
  if (status === 'completed') return 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
  if (status === 'failed') return 'bg-rose-500/10 text-rose-700 border-rose-500/20';
  if (status) return 'bg-amber-500/10 text-amber-700 border-amber-500/20';
  return 'bg-secondary text-muted-foreground border-border';
};

const unwrapResponse = (response) => response?.data ?? response ?? {};

function summarizeResult(result, label) {
  if (result?.provider === 'apollo') {
    const stored = Number.isFinite(Number(result.count)) ? Number(result.count) : null;
    const scanned = Number.isFinite(Number(result.scanned)) ? Number(result.scanned) : null;
    if (stored !== null && scanned !== null) return `Apollo scanned ${scanned} companies and stored ${stored} qualified candidates.`;
    if (stored !== null) return `Apollo completed and stored ${stored} leads.`;
  }
  return result?.output_summary || result?.summary || result?.message || `${label} completed successfully.`;
}

function friendlyRunError(error) {
  const code = String(error?.message || error || "agent_run_failed");
  if (code.includes("apollo_not_configured")) return "Apollo is not configured in the production environment.";
  if (code.includes("provider_expired")) return "The Apollo provider authorization has expired and must be renewed.";
  if (code.includes("budget") || code.includes("paid_operation")) return `Apollo was blocked by the paid-operation budget guard (${code}). No credits were used unless a reservation receipt says otherwise.`;
  if (code.includes("policy")) return `The agent is waiting for one unambiguous active policy (${code}). No outreach was sent.`;
  return code;
}

export default function AdminAgents() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [discoveryMarket, setDiscoveryMarket] = useState('ES');
  const [discoveryVertical, setDiscoveryVertical] = useState('ecommerce');
  const [discoveryLimit, setDiscoveryLimit] = useState(25);
  const agents = useMemo(() => CLUSTERS.flatMap((cluster) => cluster.agents.map((agent) => ({ ...agent, cluster: cluster.label }))), []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await base44.functions.invoke('adminAgentOperations', { action: 'status' });
      const next = unwrapResponse(response);
      if (next?.ok === false) throw new Error(next.error || 'Could not load agent operations');
      const normalized = { latest: next.latest || {}, recent: next.recent || [] };
      setData(normalized);
      return normalized;
    } catch (loadError) {
      setError(loadError?.message || 'Could not load agent operations');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const run = async (functionName, args = {}) => {
    setRunning(functionName);
    setError('');
    setNotice(null);
    try {
      const response = await base44.functions.invoke('adminAgentOperations', {
        action: 'run',
        function_name: functionName,
        args,
      });
      const envelope = unwrapResponse(response);
      const result = unwrapResponse(envelope.result);
      if (envelope?.ok === false || result?.ok === false) {
        throw new Error(result?.error || envelope?.error || `Could not run ${functionName}`);
      }

      const refreshed = await load();
      const definition = agents.find((agent) => agent.fn === functionName);
      const task = refreshed?.latest?.[NAME[functionName]];
      setNotice({
        functionName,
        title: `${definition?.name || functionName} completed`,
        summary: task?.output_summary || summarizeResult(result, definition?.name || functionName),
      });
    } catch (runError) {
      setError(friendlyRunError(runError?.message || `Could not run ${functionName}`));
    } finally {
      setRunning('');
    }
  };

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Bot size={18}/><h1 className="text-2xl font-black tracking-tight">AI Operations</h1></div>
        <p className="text-xs text-muted-foreground mt-1">Admin control plane for CAMBRA agents. Manual runs are allowlisted and logged; external/financial effects still require their existing approval gates.</p>
      </div>
      <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 h-8 px-3 rounded-lg border text-xs font-bold"><RefreshCw size={12} className={loading ? 'animate-spin' : ''}/>Refresh</button>
    </div>

    <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
      <ShieldCheck size={18}/>
      <div><p className="text-sm font-bold">Guardrail</p><p className="text-xs text-muted-foreground">This page can invoke only the fixed agent allowlist. It cannot call arbitrary backend functions or bypass Approval, ECL, billing or legal gates.</p></div>
    </div>

    {notice && <div role="status" className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 flex items-start gap-3">
      <CheckCircle2 size={18} className="mt-0.5 shrink-0"/>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black">{notice.title}</p>
        <p className="mt-1 text-xs leading-5">{notice.summary}</p>
        {notice.functionName === 'leadDiscoveryAgent' && <Link to="/admin/discovery" className="mt-2 inline-flex text-xs font-black underline underline-offset-2">Open Discovery results</Link>}
      </div>
    </div>}
    {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

    {CLUSTERS.map((cluster) => <section key={cluster.id} className="space-y-3">
      <div><h2 className="text-sm font-black">{cluster.label}</h2><p className="text-[11px] text-muted-foreground">{cluster.description}</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cluster.agents.map((agent) => {
        const task = data.latest?.[NAME[agent.fn]];
        const quarantined = agent.status === 'QUARANTINED_COMPATIBILITY';
        return <div key={agent.fn} className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-bold">{agent.name}</p><p className="text-[11px] text-muted-foreground font-mono">{agent.fn}</p></div>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClass(quarantined ? 'quarantined' : task?.status)}`}>{quarantined ? 'quarantined' : task?.status || 'not observed'}</span>
          </div>
          <p className="text-xs text-muted-foreground min-h-8">{agent.desc}</p>
          <div className="text-[10px] text-muted-foreground">Risk L{agent.level}{task?.completed_at ? ` · last ${new Date(task.completed_at).toLocaleString()}` : ''}</div>
          {task?.output_summary && <p className="rounded-lg bg-secondary/50 p-2 text-[10px] leading-4 text-muted-foreground">{task.output_summary}</p>}
          {agent.fn === 'leadDiscoveryAgent' && <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-secondary/20 p-2"><select value={discoveryMarket} onChange={(event) => setDiscoveryMarket(event.target.value)} className="h-8 rounded-lg border bg-background px-2 text-[10px]">{DISCOVERY_MARKETS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><select value={discoveryLimit} onChange={(event) => setDiscoveryLimit(Number(event.target.value))} className="h-8 rounded-lg border bg-background px-2 text-[10px]"><option value={10}>10 companies max</option><option value={25}>25 companies max</option><option value={50}>50 companies max</option></select><input value={discoveryVertical} onChange={(event) => setDiscoveryVertical(event.target.value)} placeholder="Vertical" className="col-span-2 h-8 rounded-lg border bg-background px-2 text-[10px]"/><p className="col-span-2 text-[9px] leading-4 text-muted-foreground">Apollo company search is paid and budget-gated. It discovers companies only; outreach stays disabled and separately governed.</p></div>}
          <button onClick={() => { const market = DISCOVERY_MARKETS.find(([code]) => code === discoveryMarket); run(agent.fn, agent.fn === 'leadDiscoveryAgent' ? { country_code:discoveryMarket, country:market?.[1] || discoveryMarket, industry:discoveryVertical.trim() || 'ecommerce', per_page:discoveryLimit } : {}); }} disabled={!!running || quarantined} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-foreground text-background text-[11px] font-bold disabled:opacity-50"><Play size={11}/>{quarantined ? 'Quarantined' : running === agent.fn ? 'Running…' : agent.fn === 'leadDiscoveryAgent' ? 'Run Apollo discovery' : 'Run now'}</button>
        </div>;
      })}</div>
    </section>)}
  </div>;
}
