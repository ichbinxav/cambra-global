import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const AGENT_NAME = "fix_validator";
const TASK_TYPE = "fix_validation";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Validación asistida por IA. Revísala antes de cerrar el ticket. El validador NO confía en lo que dice Base44 — re-escanea y revisa la respuesta.";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 2500, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

// Lookup the original finding by id across source agent tasks
async function findOriginalFinding(base44, findingId) {
  const sourceAgents = ["code_review", "security", "qa_monitor"];
  const tasks = await base44.asServiceRole.entities.AgentTask
    .filter({ status: "completed" }, "-completed_at", 300).catch(() => []);
  for (const t of tasks) {
    if (!sourceAgents.includes(t.agent_name)) continue;
    const findings = t.output_payload_json?.findings;
    if (!Array.isArray(findings)) continue;
    const match = findings.find(f => f.id === findingId);
    if (match) return { finding: match, source_task: t };
  }
  return null;
}

// Map source agent → its function name, so rescan calls the SAME detector
// that produced the original finding. The validator does NOT re-implement
// detection logic — it delegates to the original agent.
const SOURCE_AGENT_TO_FUNCTION = {
  code_review: "codeReviewAgent",
  security: "securityAgent",
  qa_monitor: "qaMonitorAgent",
};

// L1 — valida fixes ya aplicados por Base44, en DOS modos.
// Ningún modo modifica código.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    const findingId = body?.finding_id;

    if (!["rescan", "review_response"].includes(mode)) {
      return Response.json({ ok: false, error: "mode must be 'rescan' or 'review_response'" }, { status: 400 });
    }
    if (!findingId) {
      return Response.json({ ok: false, error: "finding_id required" }, { status: 400 });
    }

    // Look up original finding
    const original = await findOriginalFinding(base44, findingId);
    if (!original) {
      return Response.json({ ok: false, error: `Original finding ${findingId} not found in detection history` }, { status: 404 });
    }
    const { finding: originalFinding, source_task: originalTask } = original;

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Validate fix (${mode}) for finding ${findingId} from ${originalFinding.source_agent}`,
      started_at: new Date().toISOString(),
    });

    // ─────────────────────────────────────────────────────────
    // MODE: rescan
    // Re-invokes the SAME detection agent on the (presumably now
    // updated) code or runtime. Compares old vs new findings.
    // The validator does NOT trust Base44's "done" — it asks the
    // original detector to look again.
    // ─────────────────────────────────────────────────────────
    if (mode === "rescan") {
      const detectorFunctionName = SOURCE_AGENT_TO_FUNCTION[originalFinding.source_agent];
      if (!detectorFunctionName) {
        throw new Error(`Unknown source_agent '${originalFinding.source_agent}' — cannot rescan`);
      }

      // Build payload for the detector. For code_review/security, the founder
      // can pass updated code_snippets in body.code_snippets. For qa_monitor,
      // we just call it (it reads runtime by itself).
      const rescanPayload = {};
      if (detectorFunctionName === "codeReviewAgent" || detectorFunctionName === "securityAgent") {
        const snippets = Array.isArray(body?.code_snippets) ? body.code_snippets : [];
        if (snippets.length === 0) {
          return Response.json({
            ok: false,
            error: `rescan for ${originalFinding.source_agent} requires code_snippets[] in body (the updated file content after Base44 applied the fix)`,
          }, { status: 400 });
        }
        rescanPayload.code_snippets = snippets;
      } else if (detectorFunctionName === "qaMonitorAgent") {
        rescanPayload.window_hours = Number(body?.window_hours) || 2;
      }

      // CRITICAL: this is a real invocation of the original detector, not a mock.
      const rescanRes = await base44.functions.invoke(detectorFunctionName, rescanPayload);
      const rescanData = rescanRes?.data || rescanRes;

      // Fetch the rescan task to inspect its findings
      const rescanTaskId = rescanData?.task_id;
      let rescanFindings = [];
      if (rescanTaskId) {
        const rescanTask = await base44.asServiceRole.entities.AgentTask.get(rescanTaskId).catch(() => null);
        rescanFindings = rescanTask?.output_payload_json?.findings || [];
      }

      // Determine status: is the original problem still detected?
      // We look for findings that match the original by file + location + problem keyword.
      const originalFile = originalFinding.file || originalFinding.affected_function || "";
      const originalLocation = originalFinding.location || "";
      const originalProblemKey = (originalFinding.problem_description || originalFinding.pattern || "").toLowerCase().slice(0, 60);

      const stillPresent = rescanFindings.filter(f => {
        const sameFile = (f.file === originalFile) || (f.affected_function === originalFile);
        const sameLoc = !originalLocation || (f.location || "").includes(originalLocation);
        const similarProblem = originalProblemKey && (f.problem_description || f.pattern || "").toLowerCase().includes(originalProblemKey.slice(0, 30));
        return sameFile && (sameLoc || similarProblem);
      });

      const status = stillPresent.length === 0 ? "resolved"
        : stillPresent.some(f => f.severity === originalFinding.severity) ? "still_present"
        : "partial";

      // Emit validated event
      const ev = await base44.asServiceRole.entities.Event.create({
        brand_id: "_platform",
        event_type: "engineering.fix.validated",
        source: AGENT_NAME,
        entity_type: "AgentTask",
        entity_id: task.id,
        agent_task_id: task.id,
        payload_json: {
          mode: "rescan",
          original_finding_id: findingId,
          original_source_agent: originalFinding.source_agent,
          status,
          rescan_task_id: rescanTaskId,
          still_present_count: stillPresent.length,
          disclaimer: ENG_DISCLAIMER,
        },
        status: "pending",
      }).catch(() => null);

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `Rescan validation (${originalFinding.source_agent}): status=${status}`,
        output_payload_json: {
          disclaimer: ENG_DISCLAIMER,
          mode: "rescan",
          original_finding_id: findingId,
          original_finding: originalFinding,
          original_task_id: originalTask.id,
          detector_invoked: detectorFunctionName,
          rescan_task_id: rescanTaskId,
          rescan_findings_count: rescanFindings.length,
          still_present_evidence: stillPresent,
          status,
          validated_event_id: ev?.id || null,
        },
        completed_at: new Date().toISOString(),
      });

      return Response.json({
        ok: true,
        task_id: task.id,
        mode: "rescan",
        original_finding_id: findingId,
        status,
        detector_invoked: detectorFunctionName,
        rescan_task_id: rescanTaskId,
        still_present_count: stillPresent.length,
        disclaimer: ENG_DISCLAIMER,
      });
    }

    // ─────────────────────────────────────────────────────────
    // MODE: review_response
    // Founder pastes Base44's reply after applying the fix.
    // Claude analyses: did Base44 do what the original prompt asked?
    // Verdict: correct | incomplete | risky.
    // ─────────────────────────────────────────────────────────
    if (mode === "review_response") {
      const base44Response = body?.base44_response;
      if (!base44Response || typeof base44Response !== "string" || base44Response.trim().length < 20) {
        return Response.json({ ok: false, error: "base44_response required (min 20 chars) — paste Base44's reply text" }, { status: 400 });
      }

      const prompt = [
        "Eres revisor de cambios de código aplicados por Base44 builder.",
        "Recibes:",
        "1. El problema ORIGINAL detectado por un agente del cluster engineering.",
        "2. El fix PROPUESTO (diff + prompt que el founder envió a Base44).",
        "3. La RESPUESTA de Base44 tras aplicar el fix.",
        "",
        "Tu trabajo: decidir si Base44 hizo lo correcto.",
        "Veredictos posibles:",
        "- 'correct': Base44 aplicó exactamente lo pedido, problema resuelto.",
        "- 'incomplete': Base44 hizo parte pero falta algo (ej. arregló un sitio pero hay otros similares).",
        "- 'risky': Base44 introdujo un cambio que puede romper algo, o cambió más de lo necesario, o malinterpretó.",
        "",
        "IMPORTANTE:",
        "- NO confíes en frases tipo 'hecho' o '✅ done'. Mira lo que realmente dice que hizo.",
        "- Si la respuesta no menciona el archivo o el cambio concreto, marca 'incomplete'.",
        "- Si menciona haber tocado más cosas de las pedidas, marca 'risky' y di qué tocó de más.",
        "",
        "Devuelve SOLO JSON con shape:",
        `{"verdict":"<correct|incomplete|risky>","explanation":"<3-4 líneas razonando>","follow_up_if_needed":"<próximo prompt para Base44 si verdict no es 'correct', o null>"}`,
        "",
        "─── PROBLEMA ORIGINAL ───",
        `Source agent: ${originalFinding.source_agent}`,
        `Severity: ${originalFinding.severity}`,
        `File: ${originalFinding.file || originalFinding.affected_function || "n/a"}`,
        `Description: ${originalFinding.problem_description || originalFinding.pattern || ""}`,
        "",
        "─── FIX PROPUESTO (lo que el founder pidió) ───",
        `Diff propuesto:\n${(originalFinding.proposed_fix_diff || "").slice(0, 2000)}`,
        "",
        `Prompt enviado a Base44:\n${(originalFinding.ready_to_paste_prompt || "(no prompt)").slice(0, 1500)}`,
        "",
        "─── RESPUESTA DE BASE44 ───",
        base44Response.slice(0, 6000),
      ].join("\n");

      const text = await callClaude(prompt);
      const parsed = safeParseJSON(text);
      if (!parsed) throw new Error(`Failed to parse review verdict: ${text.slice(0, 200)}`);

      const verdict = ["correct", "incomplete", "risky"].includes(parsed.verdict) ? parsed.verdict : "incomplete";

      const ev = await base44.asServiceRole.entities.Event.create({
        brand_id: "_platform",
        event_type: "engineering.fix.validated",
        source: AGENT_NAME,
        entity_type: "AgentTask",
        entity_id: task.id,
        agent_task_id: task.id,
        payload_json: {
          mode: "review_response",
          original_finding_id: findingId,
          original_source_agent: originalFinding.source_agent,
          verdict,
          explanation: parsed.explanation,
          follow_up_if_needed: parsed.follow_up_if_needed || null,
          disclaimer: ENG_DISCLAIMER,
        },
        status: "pending",
      }).catch(() => null);

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `Review-response validation: verdict=${verdict}`,
        output_payload_json: {
          disclaimer: ENG_DISCLAIMER,
          mode: "review_response",
          original_finding_id: findingId,
          original_finding: originalFinding,
          base44_response_excerpt: base44Response.slice(0, 1000),
          verdict,
          explanation: parsed.explanation,
          follow_up_if_needed: parsed.follow_up_if_needed || null,
          validated_event_id: ev?.id || null,
          recommendation: "Recomendado además invocar mode=rescan para doble verificación (re-escanear el código actualizado).",
        },
        completed_at: new Date().toISOString(),
      });

      return Response.json({
        ok: true,
        task_id: task.id,
        mode: "review_response",
        original_finding_id: findingId,
        verdict,
        explanation: parsed.explanation,
        follow_up_if_needed: parsed.follow_up_if_needed || null,
        disclaimer: ENG_DISCLAIMER,
      });
    }
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "failed", error: error.message, completed_at: new Date().toISOString() });
      } catch (_) { /* swallow */ }
    }
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});