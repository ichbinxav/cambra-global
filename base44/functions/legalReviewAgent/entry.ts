import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';

const AGENT_NAME = "legal_review";
const TASK_TYPE = "legal_review";
const RISK_LEVEL = 1;
const LEGAL_DISCLAIMER = "⚠️ Análisis asistido por IA. NO es asesoramiento legal. Requiere revisión por un abogado humano antes de firmar o aceptar este documento.";

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'high_reasoning', maxTokens:4000, svc, eventKey, source:'legalReviewAgent' })).text; }

function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

// L1 — analiza un documento legal y marca cláusulas de riesgo. NUNCA firma, aprueba ni acepta nada.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const contractText = body?.contract_text;
    const documentType = body?.document_type || "provider_agreement";
    const counterparty = body?.counterparty || "unknown";

    if (!contractText || typeof contractText !== "string" || contractText.trim().length < 100) {
      return Response.json({ ok: false, error: "contract_text required (min 100 chars)" }, { status: 400 });
    }

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Legal review: ${documentType} from ${counterparty} (${contractText.length} chars)`,
      started_at: new Date().toISOString(),
    });

    const prompt = [
      "Eres analista legal asistente. Revisa este documento y marca cláusulas que un abogado humano debería mirar.",
      "",
      "IMPORTANTE:",
      "- NO firmas, NO apruebas, NO recomiendas aceptar o rechazar.",
      "- Solo IDENTIFICAS riesgos y términos inusuales.",
      "- Tu output es input para un humano, no una decisión.",
      "",
      "Áreas a revisar:",
      "- Lock-in / exclusividad / duración",
      "- Penalizaciones por salida / terminación",
      "- Limitación de responsabilidad / indemnización",
      "- Propiedad intelectual / cesión de derechos",
      "- Procesamiento de datos / GDPR / transferencias internacionales",
      "- Cambios unilaterales de términos",
      "- Ley aplicable / jurisdicción",
      "- Auto-renovación con preaviso largo",
      "- Cláusulas inusuales o ambiguas",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"document_summary":"<2-3 líneas qué es el documento>","clauses_flagged":[{"severity":"<info|warning|critical>","area":"<lock_in|liability|ip|data|term_changes|jurisdiction|renewal|unusual|other>","clause_text_excerpt":"<máximo 200 chars del texto exacto>","analysis":"<2-3 líneas explicando el riesgo>","question_for_lawyer":"<pregunta concreta para revisar con abogado>"}],"unusual_terms":["<término inusual breve>"],"overall_risk_level":"<low|medium|high>","next_steps":"<2-3 líneas, neutral, qué un humano debería hacer>"}`,
      "",
      "Si el documento parece estándar y limpio, devuelve clauses_flagged: [] y overall_risk_level: 'low'.",
      "NO inventes riesgos. Si no estás seguro de un término, márcalo como 'info' o 'unusual_term'.",
      "",
      `Tipo: ${documentType}`,
      `Contraparte: ${counterparty}`,
      "",
      "DOCUMENTO:",
      contractText.slice(0, 25000), // hard cap for token budget
    ].join("\n");

    const text = await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID());
    const parsed = safeParseJSON(text);
    if (!parsed) throw new Error(`Failed to parse legal analysis: ${text.slice(0, 200)}`);

    const flagged = Array.isArray(parsed.clauses_flagged) ? parsed.clauses_flagged : [];

    // Emit flag for warning/critical clauses
    const flagsEmitted = [];
    for (const c of flagged) {
      if (c.severity === "warning" || c.severity === "critical") {
        const ev = await base44.asServiceRole.entities.Event.create({
          brand_id: "_platform",
          event_type: "legal.flag.raised",
          source: AGENT_NAME,
          entity_type: "AgentTask",
          entity_id: task.id,
          agent_task_id: task.id,
          payload_json: {
            cluster: "legal_review",
            severity: c.severity,
            area: c.area,
            document_type: documentType,
            counterparty,
            clause_excerpt: c.clause_text_excerpt,
            analysis: c.analysis,
            question_for_lawyer: c.question_for_lawyer,
            disclaimer: LEGAL_DISCLAIMER,
          },
          status: "pending",
        }).catch(() => null);
        if (ev) flagsEmitted.push(ev.id);
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Legal review: ${flagged.length} clauses flagged · overall risk ${parsed.overall_risk_level || "unknown"} · ${flagsEmitted.length} flags raised`,
      output_payload_json: {
        disclaimer: LEGAL_DISCLAIMER,
        document_type: documentType,
        counterparty,
        document_summary: parsed.document_summary,
        clauses_flagged: flagged,
        unusual_terms: parsed.unusual_terms || [],
        overall_risk_level: parsed.overall_risk_level,
        next_steps: parsed.next_steps,
        flags_emitted: flagsEmitted,
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, clauses_flagged: flagged.length, overall_risk_level: parsed.overall_risk_level, flags_emitted: flagsEmitted.length, disclaimer: LEGAL_DISCLAIMER });
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
