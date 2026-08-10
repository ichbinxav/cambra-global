import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Called when the founder answers an AgentQuestion from the Inbox.
// Strict gate: only the same admin can answer, the question must be pending,
// and we MUST resume the parked task before declaring success.
//
// Side effects:
//   1. Marks the AgentQuestion as answered (records who + when + the answer)
//   2. Moves the parked AgentTask from "waiting_input" → "queued"
//   3. Emits Event "agent.question.answered" with the answer payload
//      so any orchestrator waiting on this task can resume.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ ok: false, error: "Forbidden — admin only" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { question_id, answer_text } = body;

    if (!question_id) return Response.json({ ok: false, error: "question_id required" }, { status: 400 });
    if (!answer_text || typeof answer_text !== "string" || answer_text.trim().length === 0) {
      return Response.json({ ok: false, error: "answer_text required" }, { status: 400 });
    }

    // Gate 1: question exists
    const q = await base44.asServiceRole.entities.AgentQuestion.get(question_id).catch(() => null);
    if (!q) return Response.json({ ok: false, error: "AgentQuestion not found", gate: "question_not_found" }, { status: 404 });

    // Gate 2: question must be pending — can't answer twice
    if (q.status !== "pending") {
      return Response.json({
        ok: false,
        error: `Question is '${q.status}', not 'pending' — cannot answer`,
        gate: "question_not_pending",
        current_status: q.status,
      }, { status: 409 });
    }

    // Gate 3: if question_type=choice, the answer must be one of the options
    if (q.question_type === "choice" && Array.isArray(q.options) && q.options.length > 0) {
      if (!q.options.includes(answer_text)) {
        return Response.json({
          ok: false,
          error: `Answer '${answer_text}' is not one of the allowed options: ${q.options.join(", ")}`,
          gate: "answer_not_in_options",
        }, { status: 400 });
      }
    }

    const answeredAt = new Date().toISOString();

    // 1. Mark the question as answered
    await base44.asServiceRole.entities.AgentQuestion.update(question_id, {
      status: "answered",
      answer_text: answer_text.trim(),
      answered_by: user.email,
      answered_at: answeredAt,
    });

    // 2. Resume the parked task: waiting_input → queued
    //    (we ONLY flip the status if it's still waiting_input — refuse to
    //    silently revive a completed/failed task)
    const task = await base44.asServiceRole.entities.AgentTask.get(q.agent_task_id).catch(() => null);
    let taskResumed = false;
    if (task && task.status === "waiting_input") {
      await base44.asServiceRole.entities.AgentTask.update(q.agent_task_id, {
        status: "queued",
        output_summary: `Resumed by founder answer to question ${question_id}: ${answer_text.slice(0, 80)}`,
      });
      taskResumed = true;
    }

    // 3. Emit Event so orchestrators / Copilot can react
    const ev = await base44.asServiceRole.entities.Event.create({
      brand_id: q.brand_id,
      event_type: "agent.question.answered",
      source: "answerAgentQuestion",
      entity_type: "AgentQuestion",
      entity_id: question_id,
      agent_task_id: q.agent_task_id,
      payload_json: {
        question_id,
        agent_name: q.agent_name,
        agent_task_id: q.agent_task_id,
        question_type: q.question_type,
        answer_text: answer_text.trim(),
        answered_by: user.email,
        answered_at: answeredAt,
        task_resumed: taskResumed,
      },
      status: "pending",
    });

    return Response.json({
      ok: true,
      question_id,
      task_id: q.agent_task_id,
      task_resumed: taskResumed,
      task_status: taskResumed ? "queued" : (task?.status || "unknown"),
      event_id: ev.id,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});