// ════════════════════════════════════════════════════════════════════
// Registry of all 34 declared agents + 5 orchestrators + the engineering /
// legal cluster, grouped by cluster, with: function name, level (L0-L4),
// tool dependency (secret name → green if present, red if missing).
//
// Used by the Command Center to render the grid and decide which agents
// are "active" vs "waiting on a key".
// ════════════════════════════════════════════════════════════════════

/**
 * @typedef {{
 *   name: string,
 *   fn: string,
 *   level: number,
 *   tool: string,
 *   secret: string | null,
 *   desc: string,
 *   requiresInput?: string,
 *   status?: string,
 *   canonicalReplacement?: string
 * }} AgentDefinition
 * @typedef {{
 *   key: string,
 *   label: string,
 *   description: string,
 *   agents: AgentDefinition[]
 * }} AgentCluster
 */

/** @type {AgentCluster[]} */
const CLUSTER_DEFINITIONS = [
  {
    key: "founder_os",
    label: "Founder OS",
    description: "Tu copiloto y reportes ejecutivos.",
    agents: [
      { name: "Founder Copilot",   fn: "founderCopilotAgent",   level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Resumen diario · briefing del estado de la máquina." },
      { name: "Investor Update",   fn: "investorUpdateAgent",   level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Borrador de updates mensuales para inversores (draft Approval L2)." },
      { name: "QA",                fn: "qaAgent",                level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Auditoría puntual sobre una pregunta del founder." },
    ],
  },
  {
    key: "lead_engine",
    label: "Lead Engine",
    description: "Descubre, enriquece, puntúa y empuja al CRM.",
    agents: [
      { name: "Lead Discovery",    fn: "leadDiscoveryAgent",    level: 1, tool: "Apollo",   secret: "APOLLO_API_KEY",    desc: "Busca prospectos en Apollo (fallback: heurística)." },
      { name: "Lead Enrichment",   fn: "leadEnrichmentAgent",   level: 1, tool: "Clay",     secret: "CLAY_API_KEY",      desc: "Enriquece leads con Clay." },
      { name: "Lead Scoring",      fn: "leadScoringAgent",       level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Asigna fit score 0-100 con explicación." },
      { name: "CRM",               fn: "crmAgent",               level: 0, tool: "Attio",    secret: "ATTIO_API_KEY",     desc: "Sincroniza leads con el CRM." },
    ],
  },
  {
    key: "outreach",
    label: "Commercial Autonomy",
    description: "External communication is policy-gated: routine L3 actions can run inside an active founder-approved policy; L4 commitments always stop for human approval.",
    agents: [
      { name: "Acquisition Loop",   fn: "autonomousCommercialWorker", level: 3, tool: "Claude + Resend", secret: "ANTHROPIC_API_KEY", desc: "Hourly policy-gated lead outreach; suppression, business-hours and daily caps are deterministic." },
      { name: "Reply Operator",     fn: "commercialReplyAgent",       level: 3, tool: "Claude + Resend", secret: "ANTHROPIC_API_KEY", desc: "Classifies inbound replies and continues routine threads; opt-out stops immediately and L4 escalates." },
      { name: "Provider Negotiation", fn: "providerNegotiationAgent", level: 3, tool: "Claude + Resend", secret: "ANTHROPIC_API_KEY", desc: "Persistent multi-round pricing negotiation inside a Recover mandate; never auto-accepts a final/material deal." },
      { name: "Outreach Legacy",    fn: "outreachAgent",          level: 3, tool: "Resend",   secret: "RESEND_API_KEY", desc: "Legacy per-email approval path retained for controlled/manual outreach." },
      { name: "Follow Up Legacy",   fn: "followUpAgent",          level: 3, tool: "Instantly", secret: "INSTANTLY_API_KEY", desc: "Legacy approval-gated follow-up path; autonomous threads use Commercial Autonomy instead." },
      { name: "Meeting",            fn: "meetingAgent",           level: 3, tool: "Cal.com",   secret: "CAL_API_KEY", desc: "Uses real Cal.com availability only; missing calendar data is a blocker, never fabricated slots." },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Contenido en múltiples canales, todo con draft → Approval.",
    agents: [
      { name: "Blog",              fn: "blogAgent",              level: 2, tool: "Claude + SurferSEO", secret: "ANTHROPIC_API_KEY", desc: "Drafts de artículos largos." },
      { name: "Newsletter",        fn: "newsletterAgent",        level: 2, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Draft del newsletter mensual." },
      { name: "LinkedIn",          fn: "linkedinAgent",          level: 2, tool: "Taplio",   secret: "TAPLIO_API_KEY",    desc: "Drafts de posts de LinkedIn." },
      { name: "X / Twitter",       fn: "xTwitterAgent",          level: 2, tool: "Typefully", secret: "TYPEFULLY_API_KEY", desc: "Drafts de threads de X." },
      { name: "SEO",               fn: "seoAgent",               level: 1, tool: "SurferSEO", secret: "SURFERSEO_API_KEY", desc: "Investigación de keywords." },
    ],
  },
  {
    key: "research",
    label: "Research",
    description: "Mantiene tu conocimiento de mercado al día.",
    agents: [
      { name: "Competitor Monitor", fn: "competitorMonitorAgent", level: 1, tool: "Perplexity", secret: "PERPLEXITY_API_KEY", desc: "Detecta movimientos de competidores." },
      { name: "Provider Research",  fn: "providerResearchAgent",  level: 1, tool: "Perplexity", secret: "PERPLEXITY_API_KEY", desc: "Investiga proveedores antes de proponerlos." },
      { name: "Provider Monitor",   fn: "providerMonitorAgent",   level: 1, tool: "Perplexity", secret: "PERPLEXITY_API_KEY", desc: "Vigila cambios en proveedores activos." },
    ],
  },
  {
    key: "legal",
    label: "Legal & Compliance",
    description: "Vigilantes que solo alertan — nunca firman ni aprueban.",
    agents: [
      { name: "GDPR",              fn: "gdprAgent",              level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Vigila manejo de datos personales (24h)." },
      { name: "Compliance",        fn: "complianceAgent",        level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Audita controles operativos del sistema." },
      { name: "Legal Review",      fn: "legalReviewAgent",       level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Analiza contratos puntuales (input: texto)." },
      { name: "Contract & IP",     fn: "contractIPAgent",        level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Checklist de acuerdos pendientes." },
    ],
  },
  {
    key: "analyzer_brain",
    label: "Analyzer Brain",
    description: "Loop de valor del brand: web → stack → gasto → recomendaciones. Spend Intelligence es determinista y no usa proveedor de IA; otras rutas conservan sus propias compuertas.",
    agents: [
      { name: "Discovery (Tech Stack)", fn: "discoveryTechStackAgent",   level: 1, tool: "Deterministic + Claude", secret: "ANTHROPIC_API_KEY", desc: "Escanea web pública y detecta tools del stack.", requiresInput: "url" },
      { name: "Spend Intelligence",     fn: "spendIntelligenceAgent",    level: 1, tool: "scoreEngine deterministic", secret: null, desc: "Estima gasto EUR por tool solo con fuentes observadas; no usa IA generativa.", requiresInput: "brand" },
      { name: "Recommendation Engine",  fn: "recommendationEngineAgent", level: 1, tool: "scoreEngine + Claude",   secret: "ANTHROPIC_API_KEY", desc: "Detecta oportunidades vs benchmark (savings + confidence + effort + priority).", requiresInput: "brand" },
    ],
  },
  {
    key: "engineering",
    label: "Engineering",
    description: "Detecta problemas y propone fixes — el founder los aplica vía Base44.",
    agents: [
      { name: "Code Review",       fn: "codeReviewAgent",        level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Bugs, code smells, Architecture Bible." },
      { name: "Security",          fn: "securityAgent",          level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Tenant isolation, secrets, GDPR." },
      { name: "QA Monitor",        fn: "qaMonitorAgent",         level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Vigila runtime (fallos, regresiones)." },
      { name: "Engineering Report", fn: "engineeringReportAgent", level: 1, tool: "—",        secret: null, desc: "Consolida 2x/día con prompts listos." },
      { name: "Fix Validator",     fn: "fixValidatorAgent",      level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Valida fixes aplicados (rescan + review)." },
      { name: "System Health",     fn: "systemHealthAgent",      level: 1, tool: "Deterministic", secret: null, status: "QUARANTINED_COMPATIBILITY", canonicalReplacement: "autonomousOperationsSupervisor", desc: "Quarantined compatibility surface (410; no supervisor, incident, AgentTask or Event writes). A bounded quarantine access audit may be recorded. General supervision is owned exclusively by autonomousOperationsSupervisor." },
    ],
  },
];

// Keep the canonical source names while preserving the aliases consumed by
// the two existing admin grids. This is a read-only UI projection; it grants
// no agent authority and does not alter the generated workforce counts.
export const CLUSTERS = CLUSTER_DEFINITIONS.map((cluster) => ({
  ...cluster,
  id: cluster.key,
  agents: cluster.agents.map((agent) => ({
    ...agent,
    label: agent.name,
    description: agent.desc,
    risk: agent.level,
  })),
}));

export const ORCHESTRATORS = [
  { name: "Brain Chain",     fn: "brainOrchestrator",     desc: "Discovery → Spend → Recommendation. Mete una URL, corre el loop entero.", requiresInput: "url" },
  { name: "Lead Chain",      fn: "leadOrchestrator",      desc: "Discovery → Enrichment → Scoring → CRM." },
  { name: "Outreach Chain (legacy)",  fn: "outreachOrchestrator",  desc: "Legacy per-message approval chain retained for controlled/manual use; policy-gated autonomous acquisition uses autonomousCommercialWorker." },
  { name: "Marketing Chain", fn: "marketingOrchestrator", desc: "Ejecuta una selección de agentes de marketing sobre un mismo topic." },
  { name: "Research Chain",  fn: "researchOrchestrator",  desc: "Competitor → Provider Research → Provider Monitor." },
];

export function levelBadge(level) {
  switch (level) {
    case 0: return { label: "L0", cls: "bg-muted text-slate-700 border-slate-200" };
    case 1: return { label: "L1", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case 2: return { label: "L2", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case 3: return { label: "L3", cls: "bg-orange-50 text-orange-700 border-orange-200" };
    case 4: return { label: "L4", cls: "bg-rose-50 text-rose-700 border-rose-200" };
    default: return { label: `L${level}`, cls: "bg-muted text-slate-700 border-slate-200" };
  }
}
