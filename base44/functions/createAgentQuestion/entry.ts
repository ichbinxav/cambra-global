import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Helper called BY OTHER AGENTS when they need input to continue.
// Side effects:
//   1. Creates an AgentQuestion (pending)
//   2. Sets the agent_task_id task to status="waiting_input"
//   3. Emits Event "agent.question.raised" so the Inbox can react in real time
//
// NEVER aplica nada. Solo registra una pregunta. Idéntico patrón al
// gate de dos puertas: la ruta de "preguntar" no contiene ninguna
// lógica de "decidir por el founder".
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ ok: false, error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { brand_id, agent_task_id, agent_name, question_text, question_type, options, context_summary, access_link } = body;

    if (!brand_id) return Response.json({ ok: false, error: "brand_id required" }, { status: 400 });
    if (!agent_task_id) return Response.json({ ok: false, error: "agent_task_id required" }, { status: 400 });
    if (!agent_name) return Response.json({ ok: false, error: "agent_name required" }, { status: 400 });
    if (!question_text || typeof question_text !== "string" || question_text.trim().length < 3) {
      return Response.json({ ok: false, error: "question_text required (min 3 chars)" }, { status: 400 });
    }

    const qType = ["choice", "text", "access"].includes(question_type) ? question_type : "text";
    if (qType === "choice" && (!Array.isArray(options) || options.length < 2)) {
      return Response.json({ ok: false, error: "options[] (min 2) required when question_type='choice'" }, { status: 400 });
    }

    // 1. Verify the task exists and belongs to the same brand
    const task = await base44.asServiceRole.entities.AgentTask.get(agent_task_id).catch(() => null);
    if (!task) return Response.json({ ok: false, error: "AgentTask not found" }, { status: 404 });

    // 2. Create the question
    const question = await base44.asServiceRole.entities.AgentQuestion.create({
      brand_id,
      agent_task_id,
      agent_name,
      question_text: question_text.trim(),
      question_type: qType,
      options: qType === "choice" ? options : [],
      context_summary: context_summary || "",
      access_link: qType === "access" ? (access_link || "") : "",
      status: "pending",
    });

    // 3. Park the task in waiting_input
    await base44.asServiceRole.entities.AgentTask.update(agent_task_id, {
      status: "waiting_input",
      output_summary: `Waiting for founder input — question: ${question_text.slice(0, 80)}`,
    });

    // 4. Emit Event so the Inbox / Copilot can pick it up
    const ev = await base44.asServiceRole.entities.Event.create({
      brand_id,
      event_type: "agent.question.raised",
      source: agent_name,
      entity_type: "AgentQuestion",
      entity_id: question.id,
      agent_task_id,
      payload_json: {
        question_id: question.id,
        question_type: qType,
        question_text: question_text.slice(0, 200),
        agent_name,
        agent_task_id,
      },
      status: "pending",
    }).catch(() => null);

    return Response.json({
      ok: true,
      question_id: question.id,
      agent_task_id,
      task_status: "waiting_input",
      event_id: ev?.id || null,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});