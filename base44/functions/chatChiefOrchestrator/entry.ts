import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ════════════════════════════════════════════════════════════════════
// Chief Orchestrator Chat
//
// Founder talks in natural language → Claude picks a tool (an agent /
// orchestrator) → backend invokes it.
//
// THREE STRUCTURAL GUARDRAILS (enforced in code, not in the prompt):
//   GATE 1 — Risk forcing: any tool with risk_level >= 2 is FORCED into
//            mode="draft". Even if Claude tries to pass mode="execute"
//            we override it. This makes L3-L4 silent execution impossible.
//   GATE 2 — Bulk confirmation: if a tool would operate on N >= 5 items
//            and the caller did NOT pass `confirmed: true`, we refuse,
//            return a `requires_confirmation` reply, and do not invoke.
//   GATE 3 — Tool whitelist: only the 5 chat-safe tools below are
//            exposed to Claude. Engineering / orchestrators-that-create-
//            massive-fanout are NOT in the list.
//
// All tasks launched here are normal AgentTasks (with input_summary
// containing "chat_orchestrator") so the Activity Log shows them like
// anything else.
// ════════════════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

// ────────────────────────────────────────────────────────────────
// A + B1 EXPANSION: Chief Orchestrator now has full operational reach.
//
//   • READ tools: `read_state` exposes every entity for observation.
//     Nothing here mutates. Used to answer "what's happening" questions.
//   • WRITE tools: every real agent/orchestrator in the app is exposed.
//     Gate 1 stays intact — anything risk_level >= 2 is forced to draft
//     and lands in the Approval Inbox. No email/publication/deal
//     activation ever leaves this process without your approve.
//
// If you want to allow silent L2 execution or full root, change the
// forced_draft threshold in executeToolWithGates() — never here.
// ────────────────────────────────────────────────────────────────

// Entities the read_state tool can query. Everything is admin-scoped
// (asServiceRole below), so add/remove entries here to control visibility.
const READ_ENTITIES = [
  "AgentTask", "AgentQuestion", "Approval", "Event", "ChatMessage",
  "Brand", "AnalyzerInput", "AnalyzerResult",
  "Integration", "IntegrationCatalog",
  "OutboundLead", "Lead", "ProviderLead",
  "BenchmarkContribution", "BenchmarkCohort",
  "StatementImport", "Recommendation",
  "FounderDecision", "FounderSimulation", "StrategyDirective", "FounderCommandAudit",
  "User",
];

const CHAT_TOOLS = [
  // ═══ READ (L1) ═══════════════════════════════════════════════════
  {
    name: "read_state",
    description: "READ-ONLY. Query approved operational fields for system state (tasks, approvals, leads, brands, integrations, benchmarks, events, users…). Sensitive fields, credentials, PII and raw document payloads are never returned. Supports filter, sort, limit.",
    function: "__READ_STATE__", // handled inline, not a real function
    risk_level: 1,
    input_schema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: READ_ENTITIES, description: "Which entity to read." },
        filter: { type: "object", description: "Optional filter object, e.g. {status: 'pending'}." },
        sort:   { type: "string", description: "Optional sort, e.g. '-created_date'." },
        limit:  { type: "number", description: "Max rows to return. Default 25, hard cap 100." },
      },
      required: ["entity"],
    },
  },
  {
    name: "generate_founder_brief",
    description: "Asks Founder Copilot to generate a fresh strategic brief on the current state of the business. Read-only.",
    function: "founderCopilotAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "system_health_check",
    description: "Runs the system health agent — read-only report of failing agents, stalled tasks, missed schedules, stuck events.",
    function: "systemHealthAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "command_center_pulse",
    description: "Read-only snapshot of the legacy command center: KPIs, recent activity, significant events.",
    function: "getCommandCenterPulse",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "founder_os_query",
    description: "PRIMARY COMPANY INTELLIGENCE TOOL. Read-only governed query across CAMBRA. Use for company summary, recommended founder actions, WHY a canonical metric has its current state, universal search, Merchant 360, Provider 360, negotiation war room and approval decision evidence. Never invent joins in prose when this tool can retrieve them.",
    function: "founderOSQuery",
    risk_level: 1,
    input_schema: {type:"object",properties:{mode:{type:"string",enum:["company_summary","recommended_actions","metric_catalog","search","merchant_360","provider_360","negotiation_war_room","decision","why_metric"]},query:{type:"string"},metric:{type:"string"},brand_id:{type:"string"},provider_id:{type:"string"},case_id:{type:"string"},approval_id:{type:"string"}},required:["mode"]},
  },
  {
    name: "founder_chief_of_staff",
    description: "Generate an evidence-bounded executive Chief of Staff brief from the canonical Founder OS snapshot. Narrative may explain but never becomes financial truth.",
    function: "founderChiefOfStaff",
    risk_level: 1,
    input_schema: {type:"object",properties:{}},
  },
  {
    name: "founder_simulation",
    description: "Run a clearly labeled non-production scenario simulation. Supported types: acquisition_scale, conversion, aggregate_growth. It can never modify production.",
    function: "founderOSSimulation",
    risk_level: 1,
    input_schema: {type:"object",properties:{simulation_type:{type:"string",enum:["acquisition_scale","conversion","aggregate_growth"]},scenario:{type:"string",enum:["base","upside","downside","custom"]},inputs:{type:"object"}},required:["simulation_type","inputs"]},
  },
  {
    name: "founder_command",
    description: "Founder OS governed action gateway. It ALWAYS previews actions requiring confirmation before execution and creates an audit trail. Use for approval resolution, provider revenue recovery, system health investigation, Developer investigation and explicit strategy directives. Natural language never bypasses domain policy.",
    function: "founderOSCommand",
    risk_level: 1,
    input_schema: {type:"object",properties:{action:{type:"string",enum:["resolve_approval","run_provider_revenue_recovery","run_system_health","investigate_developer","save_strategy_directive"]},approval_id:{type:"string"},decision:{type:"string",enum:["approve","reject"]},reason:{type:"string"},provider_id:{type:"string"},incident_id:{type:"string"},scope:{type:"string"},directive:{type:"string"},priority:{type:"number"}},required:["action"]},
  },
  {
    name: "discover_leads",
    description: "Search for outbound leads matching a topic/industry/country. Read-only — never contacts anyone.",
    function: "leadDiscoveryAgent",
    risk_level: 1,
    bulk_field: "limit",
    input_schema: {
      type: "object",
      properties: {
        topic:    { type: "string", description: "Industry, segment or product." },
        country:  { type: "string" },
        limit:    { type: "number", description: "Max leads. Default 20." },
      },
      required: ["topic"],
    },
  },
  {
    name: "enrich_leads",
    description: "Enriches existing OutboundLead rows with company/contact data. Read-only augmentation.",
    function: "leadEnrichmentAgent",
    risk_level: 1,
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "score_leads",
    description: "Scores existing OutboundLead rows with a 0-100 fit score. Read-only.",
    function: "leadScoringAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "discover_company_infrastructure",
    description: "Reads a company website + public signals to infer its stack. Read-only.",
    function: "discoverCompanyInfrastructure",
    risk_level: 1,
    input_schema: {
      type: "object",
      properties: {
        website_url: { type: "string" },
        brand_id:    { type: "string" },
      },
      required: ["website_url"],
    },
  },
  {
    name: "spend_intelligence",
    description: "Computes spend intelligence for a brand from its verified data. Read-only.",
    function: "spendIntelligenceAgent",
    risk_level: 1,
    input_schema: {
      type: "object",
      properties: { brand_id: { type: "string" } },
      required: ["brand_id"],
    },
  },
  {
    name: "recommendation_engine",
    description: "Runs the recommendation engine for a brand and produces Recommendation rows. Read-only for the engine itself; recommendations are proposals, never executed.",
    function: "recommendationEngineAgent",
    risk_level: 1,
    input_schema: {
      type: "object",
      properties: { brand_id: { type: "string" } },
      required: ["brand_id"],
    },
  },
  {
    name: "brain_orchestrator",
    description: "Runs the deterministic brain loop for a brand: sync → bridge → score. Read-only in effect; only writes verified AnalyzerResults.",
    function: "brainOrchestrator",
    risk_level: 1,
    input_schema: {
      type: "object",
      properties: { brand_id: { type: "string" } },
      required: ["brand_id"],
    },
  },
  {
    name: "run_qa",
    description: "Runs the QA agent across the app. Read-only.",
    function: "qaAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "run_security_audit",
    description: "Runs the security agent. Read-only.",
    function: "securityAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "run_compliance_check",
    description: "Runs the compliance agent for a brand or globally. Read-only.",
    function: "complianceAgent",
    risk_level: 1,
    input_schema: {
      type: "object",
      properties: { brand_id: { type: "string" } },
    },
  },
  {
    name: "run_gdpr_audit",
    description: "Runs the GDPR audit agent. Read-only.",
    function: "gdprAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "provider_research",
    description: "Researches infrastructure providers in a category. Read-only.",
    function: "providerResearchAgent",
    risk_level: 1,
    input_schema: {
      type: "object",
      properties: { category: { type: "string" } },
    },
  },
  {
    name: "competitor_monitor",
    description: "Runs the competitor monitoring agent. Read-only.",
    function: "competitorMonitorAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "provider_monitor",
    description: "Runs the provider monitoring agent. Read-only.",
    function: "providerMonitorAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "engineering_report",
    description: "Generates an engineering status report. Read-only.",
    function: "engineeringReportAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "code_review",
    description: "Runs the code review agent. Read-only.",
    function: "codeReviewAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "qa_monitor",
    description: "Runs the QA monitor agent. Read-only.",
    function: "qaMonitorAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },

  // ═══ DRAFT-PRODUCING (L2 — forced draft → Inbox) ═════════════════
  {
    name: "draft_linkedin_post",
    description: "Drafts a LinkedIn post. L2 — forced draft. Never published.",
    function: "linkedinAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        angle: { type: "string" },
      },
      required: ["topic"],
    },
  },
  {
    name: "draft_x_twitter_post",
    description: "Drafts an X/Twitter post. L2 — forced draft.",
    function: "xTwitterAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        angle: { type: "string" },
      },
      required: ["topic"],
    },
  },
  {
    name: "draft_newsletter",
    description: "Drafts a newsletter. L2 — forced draft.",
    function: "newsletterAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
    },
  },
  {
    name: "draft_blog_post",
    description: "Drafts a blog post. L2 — forced draft.",
    function: "blogAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
        angle: { type: "string" },
      },
      required: ["topic"],
    },
  },
  {
    name: "draft_seo_content",
    description: "Drafts SEO content. L2 — forced draft.",
    function: "seoAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
    },
  },
  {
    name: "draft_investor_update",
    description: "Drafts an investor update. L2 — forced draft.",
    function: "investorUpdateAgent",
    risk_level: 2,
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "draft_meeting_notes",
    description: "Drafts meeting notes / prep. L2 — forced draft.",
    function: "meetingAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: {
        topic:   { type: "string" },
        context: { type: "string" },
      },
    },
  },
  {
    name: "legal_review",
    description: "Runs legal review on a document / draft. L2 — produces review notes as draft.",
    function: "legalReviewAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        topic:       { type: "string" },
      },
    },
  },
  {
    name: "contract_ip_review",
    description: "Reviews a contract / IP question. L2 — draft output.",
    function: "contractIPAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" } },
    },
  },
  {
    name: "fix_validator",
    description: "Runs the fix validator agent on a recent engineering change. L2 — draft verdict.",
    function: "fixValidatorAgent",
    risk_level: 2,
    input_schema: { type: "object", properties: {} },
  },

  // ═══ EXTERNAL-ACTION (L3 — always draft, Approval required) ══════
  {
    name: "draft_outreach_emails",
    description: "Drafts cold outreach emails. L3 — ALWAYS produces drafts in the Approval queue. Never sends.",
    function: "outreachAgent",
    risk_level: 3,
    bulk_field: "lead_count",
    input_schema: {
      type: "object",
      properties: {
        lead_count: { type: "number" },
        angle:      { type: "string" },
      },
      required: ["lead_count"],
    },
  },
  {
    name: "draft_follow_up",
    description: "Drafts follow-up messages to leads/contacts. L3 — draft only.",
    function: "followUpAgent",
    risk_level: 3,
    bulk_field: "lead_count",
    input_schema: {
      type: "object",
      properties: {
        lead_count: { type: "number" },
        context:    { type: "string" },
      },
    },
  },
  {
    name: "push_to_crm",
    description: "Prepares CRM push (Attio). L3 — always draft, requires Approval before real push.",
    function: "crmAgent",
    risk_level: 3,
    bulk_field: "lead_count",
    input_schema: {
      type: "object",
      properties: { lead_count: { type: "number" } },
    },
  },
  {
    name: "run_marketing_orchestrator",
    description: "Runs the marketing orchestrator chain. L3 — every produced artifact lands as a draft in the Approval queue.",
    function: "marketingOrchestrator",
    risk_level: 3,
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" } },
    },
  },
  {
    name: "run_outreach_orchestrator",
    description: "Runs the outreach orchestrator chain. L3 — every produced artifact is drafted for approval.",
    function: "outreachOrchestrator",
    risk_level: 3,
    input_schema: {
      type: "object",
      properties: { lead_count: { type: "number" } },
    },
  },
  {
    name: "run_lead_orchestrator",
    description: "Runs the lead orchestrator chain (discover → enrich → score → CRM). L3 — CRM push part is drafted.",
    function: "leadOrchestrator",
    risk_level: 3,
    input_schema: {
      type: "object",
      properties: {
        topic:   { type: "string" },
        country: { type: "string" },
        limit:   { type: "number" },
      },
      required: ["topic"],
    },
  },
  {
    name: "run_research_orchestrator",
    description: "Runs the research orchestrator. L2 — outputs drafted.",
    function: "researchOrchestrator",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" } },
    },
  },
];

// P10 — AI data-minimization boundary. read_state is admin-only, but its rows
// are persisted into ChatMessage history and therefore can enter future model
// context. Never give the LLM raw entity rows: use explicit safe projections
// so credentials, signed file URLs, PII, raw extraction payloads and future
// schema additions stay server-side by default.
const READ_SAFE_FIELDS: Record<string, string[]> = {
  AgentTask: ['id','brand_id','agent_name','task_type','status','risk_level','requires_approval','input_summary','output_summary','error','created_date','started_at','completed_at'],
  AgentQuestion: ['id','brand_id','agent_name','question','status','created_date','answered_at'],
  Approval: ['id','brand_id','action_type','status','risk_level','summary','created_date','approved_at','rejected_at'],
  Event: ['id','brand_id','event_type','source','entity_type','entity_id','status','created_date'],
  ChatMessage: ['id','conversation_id','role','content','blocked_by_gate','created_date'],
  Brand: ['id','name','category','country','sector','annual_revenue','created_date'],
  AnalyzerInput: ['id','brand_id','vertical','created_date'],
  AnalyzerResult: ['id','brand_id','infra_score','total_savings','payment_savings','created_date'],
  Integration: ['id','brand_id','provider','category','status','scopes','connected_at','last_sync_at','last_sync_status','provider_account_id'],
  IntegrationCatalog: ['id','provider','category','name','status','created_date'],
  OutboundLead: ['id','company_name','country','status','fit_score','created_date'],
  Lead: ['id','company','country','status','source','created_date'],
  ProviderLead: ['id','provider_name','category','country','status','created_date'],
  BenchmarkContribution: ['id','brand_id','cohort_key','vertical','created_date'],
  BenchmarkCohort: ['id','cohort_key','vertical','sample_size','is_public','created_date'],
  StatementImport: ['id','brand_id','provider','status','confidence','owner_email','created_date'],
  Recommendation: ['id','brand_id','vertical','title','status','priority','created_date'],
  FounderDecision: ['id','decision_key','decision_type','status','title','summary','recommended_option','confidence','approval_id','created_at','updated_at'],
  FounderSimulation: ['id','simulation_key','simulation_type','status','scenario','confidence','production_effect','created_at'],
  StrategyDirective: ['id','directive_key','scope','directive','status','priority','effective_from','effective_to','created_at'],
  FounderCommandAudit: ['id','command_key','intent','action','risk_level','material','requires_confirmation','confirmed','status','created_at'],
  User: ['id','name','role','created_date'],
};

function projectReadRow(entity: string, row: any) {
  const fields = READ_SAFE_FIELDS[entity] || [];
  const out: Record<string, unknown> = {};
  for (const field of fields) if (row?.[field] !== undefined) out[field] = row[field];
  return out;
}

// Inline handler for read_state. Returns a safe operational projection only.
async function handleReadState(base44: any, input: any) {
  const entity = String(input?.entity || "");
  if (!READ_ENTITIES.includes(entity)) {
    return { error: `Entity '${entity}' not in read-allowed list.` };
  }
  const filter = (input && typeof input.filter === "object" && input.filter) ? input.filter : {};
  const sort   = typeof input?.sort === "string" ? input.sort : "-created_date";
  const limit  = Math.min(Math.max(Number(input?.limit || 25), 1), 100);
  try {
    const rows = Object.keys(filter).length > 0
      ? await base44.asServiceRole.entities[entity].filter(filter, sort, limit)
      : await base44.asServiceRole.entities[entity].list(sort, limit);
    return { ok: true, entity, count: rows.length, rows: rows.map((row: any) => projectReadRow(entity, row)) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const BULK_THRESHOLD = 5;
const SYSTEM_PROMPT = `You are ASK CAMBRA, the operating interface of CAMBRA Founder OS. Your job is to help the founder OBSERVE → UNDERSTAND → DECIDE → ACT while preserving human governance.

Prefer founder_os_query for company questions because it performs governed cross-domain joins and returns evidence. Use founder_chief_of_staff for an executive brief. Use founder_simulation for what-if questions. Use founder_command for governed actions. Use read_state only for narrow raw operational lookups that Founder OS does not cover.

Strict rules:
1. NEVER invent internal data, metrics, trends, causes, meetings, approvals, provider terms or payments. If evidence is missing, say unknown.
2. Financial state is deterministic. AI may explain numbers but must never create authoritative money values from prose.
3. For "why?" questions, use founder_os_query mode=why_metric or a relevant 360/war-room query. Distinguish evidence from operational hypotheses.
4. For "do it" requests, use founder_command. If it returns a preview/confirmation gate, present exactly what will happen, affected scope, financial/risk impact and reversibility. Do not claim execution before confirmation.
5. Material contracts, exclusivity, volume guarantees, liabilities, legal decisions, money movement and production-critical changes remain governed by their existing domain policies. Chat never overrides them.
6. Simulations are SIMULATION ONLY and never modify production.
7. Pick AT MOST one tool per turn. Maintain conversational context, but retrieve current state rather than relying on chat memory for company facts.
8. If a request is genuinely ambiguous and cannot be resolved from context, ask one concise clarification. Otherwise act on the best grounded interpretation.
9. Bulk operations require explicit scope/impact confirmation before execution.`;

async function callClaude(messages, tools) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err.slice(0, 200)}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ ok: false, error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const {
      conversation_id,
      message,
      confirmed = false,        // GATE 2 — second-call confirmation flag
      pending_tool = null,      // GATE 2 — what to re-execute if confirmed
      brand_id = null,
    } = body;

    if (!conversation_id) return Response.json({ ok: false, error: "conversation_id required" }, { status: 400 });
    if (!message && !pending_tool) return Response.json({ ok: false, error: "message required" }, { status: 400 });

    // Record the user message
    if (message) {
      await base44.asServiceRole.entities.ChatMessage.create({
        conversation_id,
        role: "user",
        content: message,
      });
    }

    // Load recent history for context (last 20 messages of this conversation)
    const history = await base44.asServiceRole.entities.ChatMessage
      .filter({ conversation_id }, "created_date", 20)
      .catch(() => []);

    const claudeMessages = history
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content || "" }));

    // ─────────────────────────────────────────────────────────────
    // Path A — second call confirming a bulk action
    // ─────────────────────────────────────────────────────────────
    if (pending_tool && confirmed) {
      return await executeToolWithGates({
        base44,
        conversation_id,
        toolName: pending_tool.name,
        toolInput: { ...(pending_tool.input || {}), confirmed: true, command_key: pending_tool.command_key || pending_tool.input?.command_key || undefined, conversation_id },
        userMessage: message || "(confirmed governed action)",
        brand_id,
        bypassBulkGate: true,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // Path B — fresh natural-language turn → ask Claude what to do
    // ─────────────────────────────────────────────────────────────
    if (!ANTHROPIC_API_KEY) {
      const assistantText = "Chat is not configured yet (ANTHROPIC_API_KEY missing). Ask the admin to set the key.";
      await base44.asServiceRole.entities.ChatMessage.create({
        conversation_id, role: "assistant", content: assistantText,
        blocked_by_gate: "tool_not_allowed",
      });
      return Response.json({ ok: true, assistant_text: assistantText, tool_calls: [], blocked_by_gate: "no_api_key" });
    }

    const claudeRes = await callClaude(claudeMessages, CHAT_TOOLS);

    // Parse Claude's reply
    let assistantText = "";
    let toolUseBlock = null;
    for (const block of (claudeRes.content || [])) {
      if (block.type === "text") assistantText += block.text;
      if (block.type === "tool_use") toolUseBlock = block;
    }

    // No tool → just save text and reply
    if (!toolUseBlock) {
      await base44.asServiceRole.entities.ChatMessage.create({
        conversation_id, role: "assistant", content: assistantText || "(no response)",
      });
      return Response.json({ ok: true, assistant_text: assistantText, tool_calls: [] });
    }

    // Tool requested → run through the gates
    return await executeToolWithGates({
      base44,
      conversation_id,
      toolName: toolUseBlock.name,
      toolInput: toolUseBlock.input || {},
      userMessage: assistantText || "",
      brand_id,
      bypassBulkGate: false,
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

// ──────────────────────────────────────────────────────────────────
// Central gate function — every tool invocation passes through here.
// ──────────────────────────────────────────────────────────────────
async function executeToolWithGates({ base44, conversation_id, toolName, toolInput, userMessage, brand_id, bypassBulkGate }) {
  // GATE 3 — tool whitelist
  const tool = CHAT_TOOLS.find(t => t.name === toolName);
  if (!tool) {
    const text = `I tried to use a tool ('${toolName}') that is not in my allowed list. Refusing.`;
    await base44.asServiceRole.entities.ChatMessage.create({
      conversation_id, role: "assistant", content: text,
      blocked_by_gate: "tool_not_allowed",
      tool_calls_json: [{ name: toolName, status: "refused", reason: "not_in_whitelist" }],
    });
    return Response.json({ ok: true, assistant_text: text, tool_calls: [{ name: toolName, status: "refused" }], blocked_by_gate: "tool_not_allowed" });
  }

  // Special-case: read_state runs inline, no agent invocation.
  if (tool.function === "__READ_STATE__") {
    const readResult = await handleReadState(base44, toolInput);
    const preview = readResult?.ok
      ? `Leí ${readResult.count} filas de ${readResult.entity}.`
      : `No pude leer ${toolInput?.entity}: ${readResult?.error || "error"}.`;
    const rowsSummary = readResult?.ok && readResult.rows?.length
      ? "\n\n" + JSON.stringify(readResult.rows.slice(0, 10), null, 2).slice(0, 3000)
      : "";
    await base44.asServiceRole.entities.ChatMessage.create({
      conversation_id, role: "assistant", content: preview + rowsSummary,
      tool_calls_json: [{
        name: toolName,
        status: readResult?.ok ? "executed" : "failed",
        input: toolInput,
        risk_level: 1,
        forced_draft: false,
        error: readResult?.ok ? null : readResult?.error,
      }],
    });
    return Response.json({
      ok: !!readResult?.ok,
      assistant_text: preview,
      read_result: readResult,
      tool_calls: [{ name: toolName, status: readResult?.ok ? "executed" : "failed" }],
    });
  }

  // GATE 2 — bulk confirmation
  if (!bypassBulkGate && tool.bulk_field) {
    const n = Number(toolInput?.[tool.bulk_field] || 0);
    if (n >= BULK_THRESHOLD) {
      const text = `Esto creará ${n} ${tool.risk_level >= 2 ? "drafts para tu aprobación" : "tareas"} (${tool.name}). ¿Confirmas?`;
      await base44.asServiceRole.entities.ChatMessage.create({
        conversation_id, role: "assistant", content: text,
        blocked_by_gate: "bulk_needs_confirmation",
        tool_calls_json: [{ name: toolName, status: "requires_confirmation", input: toolInput, count: n }],
      });
      return Response.json({
        ok: true,
        assistant_text: text,
        requires_confirmation: true,
        pending_tool: { name: toolName, input: toolInput },
        tool_calls: [{ name: toolName, status: "requires_confirmation", count: n }],
        blocked_by_gate: "bulk_needs_confirmation",
      });
    }
  }

  // GATE 1 — risk forcing: anything L2+ is FORCED into draft mode.
  // Even if the input tries mode:"execute", we override.
  const forcedDraft = tool.risk_level >= 2;
  const effectiveInput = { ...toolInput };
  if (forcedDraft) {
    effectiveInput.mode = "draft";   // structural override
    effectiveInput.brand_id = brand_id || effectiveInput.brand_id || null;
  }

  // Invoke the real agent function
  let invokeResult = null;
  let invokeError = null;
  try {
    const res = await base44.asServiceRole.functions.invoke(tool.function, effectiveInput);
    invokeResult = res?.data || res;
  } catch (e) {
    invokeError = e?.message || String(e);
  }

  // Tag the AgentTask that was just created so it shows "chat_orchestrator"
  // as the source — best-effort, only if we got a task_id back.
  const taskId = invokeResult?.task_id || invokeResult?.agent_task_id || null;
  const approvalId = invokeResult?.approval_id || null;

  if (taskId) {
    try {
      const existing = await base44.asServiceRole.entities.AgentTask.get(taskId);
      const inputSummary = `[chat_orchestrator] ${existing.input_summary || userMessage || ""}`.slice(0, 280);
      await base44.asServiceRole.entities.AgentTask.update(taskId, { input_summary: inputSummary });
    } catch { /* non-fatal */ }
  }

  // Founder OS command gateway can return its own material-action preview.
  if (!invokeError && tool.function === 'founderOSCommand' && invokeResult?.requires_confirmation) {
    const preview = invokeResult.preview || {};
    const reply = `Action preview: ${preview.action || toolName}. Risk L${preview.risk_level ?? '—'}${preview.material ? ' · material' : ''}. ${preview.summary || preview.impact || ''}`.trim();
    await base44.asServiceRole.entities.ChatMessage.create({
      conversation_id, role:'assistant', content:reply, blocked_by_gate:'material_action_preview',
      tool_calls_json:[{name:toolName,status:'requires_confirmation',input:{...toolInput,command_key:invokeResult.command_key},preview,command_key:invokeResult.command_key,risk_level:preview.risk_level??null}]
    });
    return Response.json({ok:true,assistant_text:reply,requires_confirmation:true,pending_tool:{name:toolName,input:{...toolInput,command_key:invokeResult.command_key},command_key:invokeResult.command_key},preview,blocked_by_gate:'material_action_preview',tool_calls:[{name:toolName,status:'requires_confirmation'}]});
  }

  // Build the assistant reply text
  let reply;
  if (invokeError) {
    reply = `Intenté lanzar ${tool.name}, pero falló: ${invokeError}`;
  } else if (tool.function === 'founderOSQuery' || tool.function === 'founderChiefOfStaff' || tool.function === 'founderOSSimulation') {
    reply = invokeResult?.brief?.headline || invokeResult?.summary || (tool.function === 'founderOSSimulation' ? 'Simulación completada. No se ha modificado producción.' : 'He consultado CAMBRA con evidencia actual.');
  } else if (tool.function === 'founderOSCommand') {
    reply = invokeResult?.status === 'executed' ? 'He ejecutado la acción gobernada y la he registrado en el audit trail.' : 'La acción ha pasado por Founder OS.';
  } else if (forcedDraft) {
    reply = approvalId
      ? `Preparé el draft con ${tool.name}. Está esperando tu aprobación en el Inbox.`
      : `Lancé ${tool.name} en modo draft. Cualquier acción externa pasará por el Inbox antes de salir.`;
  } else {
    reply = `Lancé ${tool.name}.${invokeResult?.summary ? " " + invokeResult.summary : ""} Mira la actividad reciente para los detalles.`;
  }

  await base44.asServiceRole.entities.ChatMessage.create({
    conversation_id,
    role: "assistant",
    content: reply,
    agent_task_ids: taskId ? [taskId] : [],
    approval_ids: approvalId ? [approvalId] : [],
    blocked_by_gate: forcedDraft ? "risk_l3_l4_forced_draft" : null,
    tool_calls_json: [{
      name: toolName,
      status: invokeError ? "failed" : (forcedDraft ? "drafted" : "executed"),
      input: effectiveInput,
      risk_level: tool.risk_level,
      forced_draft: forcedDraft,
      task_id: taskId,
      approval_id: approvalId,
      error: invokeError,
    }],
    tool_result_json: (!invokeError && (tool.function === 'founderOSQuery' || tool.function === 'founderChiefOfStaff' || tool.function === 'founderOSSimulation' || tool.function === 'founderOSCommand')) ? invokeResult : undefined,
  });

  return Response.json({
    ok: !invokeError,
    assistant_text: reply,
    tool_calls: [{
      name: toolName,
      status: invokeError ? "failed" : (forcedDraft ? "drafted" : "executed"),
      forced_draft: forcedDraft,
      task_id: taskId,
      approval_id: approvalId,
    }],
    tool_result: (tool.function === 'founderOSQuery' || tool.function === 'founderChiefOfStaff' || tool.function === 'founderOSSimulation' || tool.function === 'founderOSCommand') ? invokeResult : undefined,
    blocked_by_gate: forcedDraft ? "risk_l3_l4_forced_draft" : null,
  });
}