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

// Whitelist of tools the chat can invoke. Each tool maps to a real
// backend function. risk_level decides whether we force draft mode.
const CHAT_TOOLS = [
  {
    name: "discover_leads",
    description: "Search for outbound leads matching a topic/industry/country. Read-only — never contacts anyone. Use for 'find me leads' / 'search prospects' requests.",
    function: "leadDiscoveryAgent",
    risk_level: 1,
    bulk_field: "limit",
    input_schema: {
      type: "object",
      properties: {
        topic:    { type: "string", description: "Industry, segment or product (e.g. 'fashion DTC France')." },
        country:  { type: "string", description: "Country filter (e.g. 'France')." },
        limit:    { type: "number", description: "Max leads to return. Default 20." },
      },
      required: ["topic"],
    },
  },
  {
    name: "draft_linkedin_post",
    description: "Drafts a LinkedIn post about a topic. Always a draft — never published. L2: produces an Approval.",
    function: "linkedinAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What the post is about." },
        angle: { type: "string", description: "Optional angle/hook for the post." },
      },
      required: ["topic"],
    },
  },
  {
    name: "draft_newsletter",
    description: "Drafts a newsletter on a topic. Always a draft — never sent. L2: produces an Approval.",
    function: "newsletterAgent",
    risk_level: 2,
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string" },
      },
      required: ["topic"],
    },
  },
  {
    name: "draft_outreach_emails",
    description: "Drafts cold outreach emails for a set of leads. L3 — ALWAYS produces drafts in the Approval queue. Never sends. If founder asks to send N emails, this drafts N emails for review.",
    function: "outreachAgent",
    risk_level: 3,
    bulk_field: "lead_count",
    input_schema: {
      type: "object",
      properties: {
        lead_count: { type: "number", description: "How many leads to draft emails for." },
        angle:      { type: "string", description: "Optional pitch angle." },
      },
      required: ["lead_count"],
    },
  },
  {
    name: "generate_founder_brief",
    description: "Asks Founder Copilot to generate a fresh strategic brief on the current state of the business. Read-only.",
    function: "founderCopilotAgent",
    risk_level: 1,
    input_schema: { type: "object", properties: {} },
  },
];

const BULK_THRESHOLD = 5;
const SYSTEM_PROMPT = `You are CAMBRA's Chief Orchestrator chat. You help the founder run the business by deciding which agents to launch.

Strict rules you must follow:
1. NEVER claim to have sent, emailed, contacted, published, or paid. You can only DRAFT — actual sending is a separate human step in the Approval Inbox.
2. If you are not sure what the founder wants, ASK ONE concise clarifying question instead of guessing.
3. Pick AT MOST one tool per turn. Prefer reading state and explaining over launching tools.
4. For lists/counts ("how many approvals?", "show pending questions?") answer from your knowledge of the system — do not invoke tools.
5. If the founder asks for something we do not have a tool for, say so honestly. Do not invent capabilities.`;

async function callClaude(messages, tools) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
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
        toolInput: pending_tool.input,
        userMessage: message || "(confirmed bulk action)",
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

  // Build the assistant reply text
  let reply;
  if (invokeError) {
    reply = `Intenté lanzar ${tool.name}, pero falló: ${invokeError}`;
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
    blocked_by_gate: forcedDraft ? "risk_l3_l4_forced_draft" : null,
  });
}