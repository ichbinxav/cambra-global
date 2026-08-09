import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { deterministicMerchantOpportunity } from '../../shared/merchantOpportunity.ts';

const AGENT_NAME = "lead_scoring";
const TASK_TYPE = "score_leads";
const RISK_LEVEL = 1;

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

function safeParseJSON(text) {
  if (!text) return null;
  // Strip markdown fences if present
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  // Try to extract the first JSON array/object substring
  const match = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const leadIds = Array.isArray(body?.lead_ids) ? body.lead_ids : null;
    const limit = Math.min(Number(body?.limit) || 25, 50);

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: leadIds ? `Score ${leadIds.length} leads` : `Score latest ${limit} unscored leads`,
      started_at: new Date().toISOString(),
    });

    let leads = [];
    if (leadIds && leadIds.length) {
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ id: { $in: leadIds } }, "-created_date", leadIds.length).catch(() => []);
    } else {
      // Prefer enriched, fall back to any unscored
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ score: null }, "-created_date", limit).catch(() => []);
      if (!leads.length) {
        leads = await base44.asServiceRole.entities.OutboundLead
          .list("-created_date", limit).catch(() => []);
      }
    }

    if (!leads.length) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "No leads to score",
        output_payload_json: { count: 0 },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, count: 0 });
    }

    // Compact lead payload for Claude
    const compact = leads.map(l => ({
      id: l.id,
      company: l.company_name,
      domain: l.company_domain,
      contact: l.contact_full_name,
      title: l.contact_title,
      country: l.country,
      industry: l.industry,
      enrichment: l.enrichment_json || null,
    }));

    const prompt = [
      "Eres el motor de priorización de merchants de CAMBRA. No inventes datos ausentes: una señal no observada vale 0, no una suposición.",
      "Objetivo: priorizar merchants FR/ES con suficiente infraestructura de pagos para que un análisis de CAMBRA tenga ROI real.",
      "Puntúa 0-100 con esta rúbrica explícita:",
      "- Commerce/payment fit: 25 pts. Ecommerce/DTC/omnichannel real, retail físico, checkout propio, Shopify/WooCommerce/BigCommerce u otra evidencia de comercio.",
      "- Economic potential: 25 pts. Tamaño/empleados/revenue/traffic/store count/funding u otras señales verificables que sugieran volumen de pagos material. No inventar GMV.",
      "- Payments complexity/overpayment signals: 20 pts. PSP/TPV detectado, múltiples canales/países/tiendas, stack de payments visible, expansión internacional. No afirmar fees sin evidencia.",
      "- Decision-maker quality: 15 pts. Founder/CEO/CFO/COO/Head of Ecommerce/Finance/Payments u otro decisor relevante y alcanzable.",
      "- Timing/growth signal: 10 pts. Funding, hiring, expansión, nuevas tiendas/mercados, crecimiento o cambio de stack verificable.",
      "- Data/contact confidence: 5 pts. Email corporativo y datos suficientemente completos/provenance clara.",
      "Hard penalties: -40 si no hay evidencia de commerce; -25 si parece micro-negocio sin señal de volumen material; -20 si el contacto no tiene relación con decisión económica/commerce; score máximo 59 si falta email corporativo utilizable.",
      "Devuelve SOLO JSON array con shape:",
      `[{"id":"<lead_id>","score":<0-100>,"breakdown":{"commerce_fit":<0-25>,"economic_potential":<0-25>,"payments_complexity":<0-20>,"decision_maker":<0-15>,"timing":<0-10>,"data_confidence":<0-5>,"penalties":<0-negative>},"signals":{"commerce_platform":null,"payment_provider":null,"physical_retail":null,"store_count":null,"employee_range":null,"revenue_signal":null,"funding_signal":null,"international_signal":null},"reasoning":"<1 línea basada solo en evidencia>","next_action":"<acción concreta>"}]`,
      "Leads:", JSON.stringify(compact),
    ].join("\n");

    const text = await callClaude(prompt);
    const scored = safeParseJSON(text);

    if (!Array.isArray(scored)) {
      throw new Error(`Claude returned unparseable response: ${text.slice(0, 200)}`);
    }

    // Apply scores back to OutboundLead
    const byId = new Map(leads.map((l:any)=>[l.id,l]));
    const updates = scored.filter(s=>s?.id&&typeof s.score==='number').map(s=>{const lead:any=byId.get(s.id)||{};const det=deterministicMerchantOpportunity(lead);const llm=Math.max(0,Math.min(100,Math.round(s.score)));const final=Math.round(det.opportunity_score*0.7+llm*0.3);return {id:s.id,score:final,score_breakdown_json:{breakdown:det.breakdown,llm_breakdown:s.breakdown,reasoning:s.reasoning,opportunity_score:det.opportunity_score,evidence_confidence:det.evidence_confidence,evidence_count:det.evidence_count,signals:det.signals,scoring_version:'merchant-opportunity-v2',weights:{deterministic:0.7,llm:0.3}},next_action:s.next_action||null,stage:'scored'};});

    if (updates.length) {
      try {
        await base44.asServiceRole.entities.OutboundLead.bulkUpdate(updates);
      } catch (e) {
        for (const u of updates) {
          const { id, ...patch } = u;
          await base44.asServiceRole.entities.OutboundLead.update(id, patch).catch(() => null);
        }
      }
    }

    // Sort by score desc for the response
    const ranked = [...scored].sort((a, b) => (b.score || 0) - (a.score || 0));

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Scored ${updates.length} of ${leads.length} leads`,
      output_payload_json: {
        count: leads.length,
        scored: updates.length,
        top: ranked.slice(0, 10),
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, count: leads.length, scored: updates.length, ranked });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "failed",
          error: error.message,
          completed_at: new Date().toISOString(),
        });
      } catch (_) { /* swallow */ }
    }
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});