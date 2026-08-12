import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { buildResilientLeadScore, validLeadModelRow, type LeadModelStatus } from '../../shared/leadScoringResilience.ts';
import { leadOutcomeCalibration } from '../../shared/leadOutcomeCalibration.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

const AGENT_NAME = "lead_scoring";
const TASK_TYPE = "score_leads";
const RISK_LEVEL = 1;

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:4096, svc, eventKey, source:'leadScoringAgent' })).text; }

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
    const deterministicOnly = body?.deterministic_only === true;

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
        .filter({ id: { $in: leadIds } }, "-created_date", leadIds.length).catch((error:any)=>safeBestEffort(error,{operation:'leadScoringAgent',fallback:[],severity:'secondary'}));
    } else {
      // Prefer enriched, fall back to any unscored
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ score: null }, "-created_date", limit).catch((error:any)=>safeBestEffort(error,{operation:'leadScoringAgent',fallback:[],severity:'secondary'}));
      if (!leads.length) {
        leads = await base44.asServiceRole.entities.OutboundLead
          .list("-created_date", limit).catch((error:any)=>safeBestEffort(error,{operation:'leadScoringAgent',fallback:[],severity:'secondary'}));
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

    let text='';
    let parsed:any=null;
    let modelErrorCode:string|null=null;
    if(!deterministicOnly){
      try{
        text=await callClaude(base44.asServiceRole,prompt,task?.id||crypto.randomUUID());
        parsed=safeParseJSON(text);
        if(!Array.isArray(parsed)) modelErrorCode='model_output_unparseable';
      }catch(error){
        modelErrorCode=String((error as Error)?.message||'model_call_failed').split(':')[0].slice(0,80);
      }
    }
    const validRows=Array.isArray(parsed)?parsed.filter(validLeadModelRow):[];
    const validById=new Map(validRows.map((row:any)=>[String(row.id),row]));
    const matchedCount=leads.filter((lead:any)=>validById.has(String(lead.id))).length;
    const modelStatus:LeadModelStatus=deterministicOnly
      ?'SKIPPED_DETERMINISTIC_ONLY'
      :matchedCount===leads.length
        ?'PARSED'
        :matchedCount>0?'PARTIAL':'UNAVAILABLE_OR_UNPARSEABLE';
    const degraded=modelStatus==='PARTIAL'||modelStatus==='UNAVAILABLE_OR_UNPARSEABLE';

    // Every requested lead receives a deterministic result. A missing or malformed
    // model row can reduce confidence, but it must never strand the whole P6 chain.
    const outcomeAggregates=await base44.asServiceRole.entities.AnonymizedIntelligenceAggregate.filter({aggregate_type:'verified_outcomes'},'-period',500).catch((error:any)=>safeBestEffort(error,{operation:'leadScoringAgent',fallback:[],severity:'secondary'}));
    const calibrations=new Map(leads.map((lead:any)=>[String(lead.id),leadOutcomeCalibration(lead,outcomeAggregates)]));
    const updates=leads.map((lead:any)=>buildResilientLeadScore(lead,validById.get(String(lead.id)),modelStatus,calibrations.get(String(lead.id))));

    if (updates.length) {
      try {
        await base44.asServiceRole.entities.OutboundLead.bulkUpdate(updates);
      } catch (e) {
        for (const u of updates) {
          const { id, ...patch } = u;
          await base44.asServiceRole.entities.OutboundLead.update(id, patch).catch((error:any)=>safeBestEffort(error,{operation:'leadScoringAgent',fallback:null,severity:'secondary'}));
        }
      }
    }

    const ranked=updates.map((row:any)=>({id:row.id,score:row.score,reasoning:row.score_breakdown_json.reasoning,next_action:row.next_action,model_status:row.score_breakdown_json.model_status})).sort((a:any,b:any)=>b.score-a.score);

    if(degraded){
      await base44.asServiceRole.entities.OperationalLog.create({
        event_type:'lead_scoring_model_degraded',
        message:modelStatus,
        data_json:{task_id:task.id,lead_count:leads.length,model_rows_matched:matchedCount,model_error_code:modelErrorCode||'partial_or_missing_rows',deterministic_fallback:true,raw_model_output_persisted:false},
        actor_email:'lead_scoring_agent',
        created_at:new Date().toISOString(),
      }).catch((error:any)=>safeBestEffort(error,{operation:'leadScoringAgent',fallback:null,severity:'secondary'}));
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Scored ${updates.length} of ${leads.length} leads${degraded?' with deterministic fallback':''}`,
      output_payload_json: {
        count: leads.length,
        scored: updates.length,
        model_status:modelStatus,
        degraded,
        model_error_code:modelErrorCode,
        deterministic_fallback:modelStatus!=='PARSED',
        privacy_safe_outcome_calibrations:Array.from(calibrations.values()).filter((x:any)=>x.applied).length,
        top: ranked.slice(0, 10),
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ok:true,task_id:task.id,count:leads.length,scored:updates.length,model_status:modelStatus,degraded,model_error_code:modelErrorCode,deterministic_fallback:modelStatus!=='PARSED',ranked});
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
    return internalErrorResponse(error, 'leadScoringAgent');
  }
});
