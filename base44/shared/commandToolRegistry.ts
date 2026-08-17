// COMMAND-C4 (2026-08-17) — governed tool registry and tool search.
//
// The 48 tools already exist, declared inline in chatChiefOrchestrator with a
// `risk_level` and sometimes a `bulk_field`. What they do NOT carry is the
// governance metadata a multi-step loop needs: what class of effect a tool has,
// whether it reads or writes, and which permit domain must cover it.
//
// This registry adds exactly that, and is deliberately NOT a copy of the tool
// declarations. Duplicating 48 schemas would guarantee drift. Instead this file
// holds a classification keyed by tool name, and a test asserts the
// classification set equals the orchestrator's declared set — so adding a tool
// without classifying it fails the build rather than silently defaulting to
// something permissive.

export const COMMAND_TOOL_REGISTRY_VERSION = 'command-tool-registry-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** What kind of change a tool can cause. Ordered least to most consequential. */
export const EFFECT_CLASSES = Object.freeze([
  'read',            // reads canonical state, changes nothing
  'analysis',        // computes/derives, may write a snapshot of its own output
  'draft',           // produces content that lands in a queue for a human
  'internal_write',  // mutates CAMBRA-owned state
  'external_effect', // reaches a third party or a counterparty
] as const);

export type EffectClass = typeof EFFECT_CLASSES[number];

export type ToolGovernance = {
  effect_class: EffectClass;
  read_or_write: 'READ' | 'WRITE';
  /** Permit domain that must cover this tool. Null only for pure reads. */
  permit_domain: string | null;
  /** True when the tool can never complete without a human approving first. */
  always_drafts: boolean;
  /** Short reason, so a refusal can explain itself rather than just saying no. */
  note?: string;
};

/**
 * Classification for every tool the orchestrator declares.
 *
 * The default when in doubt is the MORE restrictive class. A tool wrongly
 * classified as `read` would bypass the permit check entirely; a tool wrongly
 * classified as `internal_write` merely asks for authority it did not need.
 */
export const TOOL_GOVERNANCE: Record<string, ToolGovernance> = {
  // --- pure reads -------------------------------------------------------
  read_state: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  system_health_check: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  commercial_os_status: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  command_center_pulse: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  founder_os_query: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  documentation_query: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  research_knowledge_search: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false,
    note: 'Returns untrusted external research; never authoritative.' },
  verify_instantly_supersearch: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  spend_intelligence: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  engineering_report: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },
  qa_monitor: { effect_class: 'read', read_or_write: 'READ', permit_domain: null, always_drafts: false },

  // --- analysis: derives, may snapshot its own output --------------------
  generate_founder_brief: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },
  founder_chief_of_staff: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },
  founder_simulation: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false,
    note: 'Simulation only; never modifies production state.' },
  recommendation_engine: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },
  brain_orchestrator: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },
  run_qa: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'engineering', always_drafts: false },
  run_security_audit: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'engineering', always_drafts: false },
  run_compliance_check: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'compliance', always_drafts: false },
  run_gdpr_audit: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'compliance', always_drafts: false },
  code_review: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'engineering', always_drafts: false },
  legal_review: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'legal', always_drafts: false },
  contract_ip_review: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'legal', always_drafts: false },
  fix_validator: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'engineering', always_drafts: false },
  provider_research: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },
  competitor_monitor: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },
  provider_monitor: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },
  discover_company_infrastructure: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'discovery', always_drafts: false },
  run_research_orchestrator: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },
  founder_command: { effect_class: 'analysis', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: false },

  // --- discovery: spends money on third-party enrichment -----------------
  discover_leads: { effect_class: 'internal_write', read_or_write: 'WRITE', permit_domain: 'discovery', always_drafts: false,
    note: 'Paid discovery; the AI-spend emergency covers it.' },
  enrich_leads: { effect_class: 'internal_write', read_or_write: 'WRITE', permit_domain: 'discovery', always_drafts: false,
    note: 'Paid enrichment.' },
  score_leads: { effect_class: 'internal_write', read_or_write: 'WRITE', permit_domain: 'discovery', always_drafts: false },
  run_commercial_discovery: { effect_class: 'internal_write', read_or_write: 'WRITE', permit_domain: 'discovery', always_drafts: false },
  run_lead_orchestrator: { effect_class: 'internal_write', read_or_write: 'WRITE', permit_domain: 'discovery', always_drafts: true,
    note: 'Chains discover -> enrich -> score -> CRM; the CRM step always drafts.' },

  // --- drafts: land in a queue for a human -------------------------------
  draft_outreach_emails: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'campaign', always_drafts: true },
  draft_follow_up: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'campaign', always_drafts: true },
  draft_linkedin_post: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'marketing', always_drafts: true },
  draft_x_twitter_post: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'marketing', always_drafts: true },
  draft_newsletter: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'marketing', always_drafts: true },
  draft_blog_post: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'marketing', always_drafts: true },
  draft_seo_content: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'marketing', always_drafts: true },
  draft_investor_update: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'investor', always_drafts: true },
  draft_meeting_notes: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'intelligence', always_drafts: true },
  push_to_crm: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'crm', always_drafts: true,
    note: 'Prepares the push only; the real push needs an Approval.' },
  run_marketing_orchestrator: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'marketing', always_drafts: true },
  run_outreach_orchestrator: { effect_class: 'draft', read_or_write: 'WRITE', permit_domain: 'campaign', always_drafts: true },

  // --- controls: change what the company is allowed to do -----------------
  pause_outbound: { effect_class: 'internal_write', read_or_write: 'WRITE', permit_domain: 'emergency', always_drafts: false,
    note: 'Restricting is always permitted; this tool can only stop sending, never start it.' },
};

/**
 * Steps a loop may take without a human, per effect class.
 *
 * `external_effect` is 0 on purpose: nothing that reaches a third party may ever
 * be executed inside an autonomous loop. There is currently no tool in that
 * class, and the entry exists so that adding one cannot silently become
 * loop-executable.
 */
export const AUTONOMOUS_ALLOWED: Record<EffectClass, boolean> = {
  read: true,
  analysis: true,
  draft: true,          // producing a draft is not sending it
  internal_write: true,
  external_effect: false,
};

export type RegisteredTool = ToolGovernance & {
  name: string;
  description: string;
  risk_level: number;
  bulk_field?: string | null;
};

/**
 * Joins the orchestrator's declared tools with their governance classification.
 *
 * A declared tool with no classification is returned as `unclassified` rather
 * than defaulted. The caller must refuse it: a tool nobody classified is a tool
 * nobody decided was safe.
 */
export function buildToolRegistry(declared: Array<{
  name?: string; description?: string; risk_level?: number; bulk_field?: string;
}>) {
  const tools: RegisteredTool[] = [];
  const unclassified: string[] = [];
  for (const row of Array.isArray(declared) ? declared : []) {
    const name = text(row?.name);
    if (!name) continue;
    const governance = TOOL_GOVERNANCE[name];
    if (!governance) { unclassified.push(name); continue; }
    tools.push({
      name,
      description: text(row?.description),
      risk_level: Number(row?.risk_level ?? 0),
      bulk_field: row?.bulk_field ?? null,
      ...governance,
    });
  }
  // A classification with no matching declared tool is stale — it would let a
  // deleted tool keep an authority entry.
  const declaredNames = new Set(tools.map((tool) => tool.name));
  const orphaned = Object.keys(TOOL_GOVERNANCE).filter((name) => !declaredNames.has(name));
  return {
    version: COMMAND_TOOL_REGISTRY_VERSION,
    tools,
    unclassified: unclassified.sort(),
    orphaned_classifications: orphaned.sort(),
    complete: unclassified.length === 0 && orphaned.length === 0,
  };
}

/**
 * Tool Search — finds the tools relevant to a request.
 *
 * Deliberately a bounded lexical match over name/description/effect class, not a
 * model call: choosing which tools the model may see must not itself depend on a
 * model. Returns them ranked, with pure reads first at equal score so a plan
 * naturally starts by looking before it acts.
 */
export function searchTools(registry: { tools: RegisteredTool[] }, query: unknown, limit = 12) {
  const terms = text(query).toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const rows = registry?.tools || [];
  if (!terms.length) return rows.slice(0, limit);

  const scored = rows.map((tool) => {
    const name = tool.name.toLowerCase();
    const description = tool.description.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (name === term) score += 10;
      else if (name.includes(term)) score += 5;
      if (description.includes(term)) score += 2;
      if (tool.effect_class.includes(term)) score += 1;
    }
    return { tool, score };
  }).filter((row) => row.score > 0);

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    // Equal relevance: prefer the tool that changes less.
    const rank = (tool: RegisteredTool) => EFFECT_CLASSES.indexOf(tool.effect_class);
    if (rank(left.tool) !== rank(right.tool)) return rank(left.tool) - rank(right.tool);
    return left.tool.name.localeCompare(right.tool.name);
  });
  return scored.slice(0, limit).map((row) => row.tool);
}
