// ════════════════════════════════════════════════════════════════════
// Registry of all 18 agents + 4 orchestrators + the engineering /
// legal cluster, grouped by cluster, with: function name, level (L0-L4),
// tool dependency (secret name → green if present, red if missing).
//
// Used by the Command Center to render the grid and decide which agents
// are "active" vs "waiting on a key".
// ════════════════════════════════════════════════════════════════════

export const CLUSTERS = [
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
    label: "Outreach",
    description: "Cold outreach con gate de dos puertas (L3 — requiere Approval).",
    agents: [
      { name: "Outreach",          fn: "outreachAgent",          level: 3, tool: "Instantly", secret: "INSTANTLY_API_KEY", desc: "Draft + send. Apply solo con Approval aprobado." },
      { name: "Follow Up",         fn: "followUpAgent",          level: 3, tool: "Instantly", secret: "INSTANTLY_API_KEY", desc: "Secuencia de seguimiento (Approval requerido)." },
      { name: "Meeting",           fn: "meetingAgent",           level: 3, tool: "Cal.com",   secret: "CALCOM_API_KEY",     desc: "Propone slots de reunión (Approval requerido)." },
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
    key: "engineering",
    label: "Engineering",
    description: "Detecta problemas y propone fixes — el founder los aplica vía Base44.",
    agents: [
      { name: "Code Review",       fn: "codeReviewAgent",        level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Bugs, code smells, Architecture Bible." },
      { name: "Security",          fn: "securityAgent",          level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Tenant isolation, secrets, GDPR." },
      { name: "QA Monitor",        fn: "qaMonitorAgent",         level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Vigila runtime (fallos, regresiones)." },
      { name: "Engineering Report", fn: "engineeringReportAgent", level: 1, tool: "—",        secret: null, desc: "Consolida 2x/día con prompts listos." },
      { name: "Fix Validator",     fn: "fixValidatorAgent",      level: 1, tool: "Claude",   secret: "ANTHROPIC_API_KEY", desc: "Valida fixes aplicados (rescan + review)." },
    ],
  },
];

export const ORCHESTRATORS = [
  { name: "Lead Chain",      fn: "leadOrchestrator",      desc: "Discovery → Enrichment → Scoring → CRM." },
  { name: "Outreach Chain",  fn: "outreachOrchestrator",  desc: "Outreach.draft → [Approval] → Outreach.execute → FollowUp.draft → [Approval]." },
  { name: "Marketing Chain", fn: "marketingOrchestrator", desc: "Ejecuta una selección de agentes de marketing sobre un mismo topic." },
  { name: "Research Chain",  fn: "researchOrchestrator",  desc: "Competitor → Provider Research → Provider Monitor." },
];

export function levelBadge(level) {
  switch (level) {
    case 0: return { label: "L0", cls: "bg-slate-100 text-slate-700 border-slate-200" };
    case 1: return { label: "L1", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case 2: return { label: "L2", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case 3: return { label: "L3", cls: "bg-orange-50 text-orange-700 border-orange-200" };
    case 4: return { label: "L4", cls: "bg-rose-50 text-rose-700 border-rose-200" };
    default: return { label: `L${level}`, cls: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}