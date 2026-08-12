import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

const AGENT_NAME = "contract_ip";
const TASK_TYPE = "contract_ip_review";
const RISK_LEVEL = 1;
const LEGAL_DISCLAIMER = "⚠️ Análisis asistido por IA. NO es asesoramiento legal. Requiere revisión por un abogado humano para confirmar el estado contractual y de IP.";

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'high_reasoning', maxTokens:2500, svc, eventKey, source:'contractIPAgent' })).text; }

function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

// L1 — checklist de qué falta en agreements y asignación de IP. NUNCA crea ni firma nada.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: "Contract & IP checklist: missing agreements scan",
      started_at: new Date().toISOString(),
    });

    // Collect providers referenced in the platform
    const providers = await base44.asServiceRole.entities.Provider
      .list("-created_date", 200).catch((error:any)=>safeBestEffort(error,{operation:'contractIPAgent',fallback:[],severity:'critical'}));
    const dealActivations = await base44.asServiceRole.entities.DealActivation
      .list("-created_date", 200).catch((error:any)=>safeBestEffort(error,{operation:'contractIPAgent',fallback:[],severity:'critical'}));
    const contracts = await base44.asServiceRole.entities.Contract
      .list("-created_date", 200).catch((error:any)=>safeBestEffort(error,{operation:'contractIPAgent',fallback:[],severity:'critical'}));
    const mandates = await base44.asServiceRole.entities.Mandate
      .list("-created_date", 200).catch((error:any)=>safeBestEffort(error,{operation:'contractIPAgent',fallback:[],severity:'critical'}));

    // Deterministic structural signals
    const providersWithoutContract = providers.filter(p => {
      const hasContract = contracts.some(c =>
        c.provider_id === p.id || c.provider_name === p.name
      );
      return !hasContract;
    }).map(p => ({ id: p.id, name: p.name, category: p.category }));

    const activationsWithoutMandate = dealActivations.filter(da => {
      if (da.status !== "activated" && da.status !== "active") return false;
      const hasMandate = mandates.some(m =>
        (m.deal_activation_id === da.id || m.brand_id === da.brand_id) && m.status === "active"
      );
      return !hasMandate;
    }).map(da => ({ id: da.id, brand_id: da.brand_id, status: da.status }));

    const structural = {
      total_providers: providers.length,
      providers_without_contract: providersWithoutContract,
      total_active_activations: dealActivations.filter(da => da.status === "activated" || da.status === "active").length,
      activations_without_mandate: activationsWithoutMandate,
      total_contracts: contracts.length,
      total_mandates: mandates.length,
    };

    const prompt = [
      "Eres analista de revisión contractual e IP. Revisa estas señales estructurales del sistema CAMBRA y produce un checklist de lo que falta.",
      "",
      "IMPORTANTE:",
      "- NO creas contratos. NO firmas nada. NO asignas nada.",
      "- Solo ALERTAS de gaps que un humano debería cerrar.",
      "",
      "Áreas a vigilar:",
      "- Proveedores referidos sin agreement formal",
      "- Activaciones de deal sin mandato firmado",
      "- IP: ¿hay assignment claro sobre datos/insights generados?",
      "- Términos pendientes con counterparties",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"checklist":[{"severity":"<info|warning|critical>","item":"<qué falta, 1 línea>","affected_count":<num>,"affected_ids_sample":["<id>"],"recommendation":"<acción humana sugerida>"}],"summary":"<2-3 líneas, neutral>"}`,
      "",
      "Si count=0 en una categoría, NO la incluyas (no inventes problemas).",
      "",
      "SEÑALES ESTRUCTURALES:",
      JSON.stringify(structural, null, 2),
    ].join("\n");

    const text = await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID());
    const parsed = safeParseJSON(text) || { checklist: [], summary: "Could not parse analysis" };
    const checklist = Array.isArray(parsed.checklist) ? parsed.checklist : [];

    const flagsEmitted = [];
    for (const item of checklist) {
      if (item.severity === "warning" || item.severity === "critical") {
        const ev = await base44.asServiceRole.entities.Event.create({
          brand_id: "_platform",
          event_type: "legal.flag.raised",
          source: AGENT_NAME,
          entity_type: "AgentTask",
          entity_id: task.id,
          agent_task_id: task.id,
          payload_json: {
            cluster: "contract_ip",
            severity: item.severity,
            item: item.item,
            affected_count: item.affected_count,
            affected_ids_sample: item.affected_ids_sample,
            recommendation: item.recommendation,
            disclaimer: LEGAL_DISCLAIMER,
          },
          status: "pending",
        }).catch((error:any)=>safeBestEffort(error,{operation:'contractIPAgent',fallback:null,severity:'critical'}));
        if (ev) flagsEmitted.push(ev.id);
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Contract/IP: ${checklist.length} items · ${flagsEmitted.length} flags raised`,
      output_payload_json: {
        disclaimer: LEGAL_DISCLAIMER,
        checklist,
        summary: parsed.summary,
        structural_signals: structural,
        flags_emitted: flagsEmitted,
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, checklist_count: checklist.length, flags_emitted: flagsEmitted.length, disclaimer: LEGAL_DISCLAIMER });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "failed", error: error.message, completed_at: new Date().toISOString() });
      } catch (_) { /* swallow */ }
    }
    return internalErrorResponse(error, 'contractIPAgent');
  }
});
