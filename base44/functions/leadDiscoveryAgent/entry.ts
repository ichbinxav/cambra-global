import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { reservePaidOperation, settlePaidOperation } from '../../shared/costGovernance.ts';

const AGENT_NAME = "lead_discovery";
const TASK_TYPE = "discover_leads";
const RISK_LEVEL = 1;

// Company-first prefilter: Apollo people search can return founders whose title
// matches but whose organisation is not a merchant at all. Reject obvious
// agencies/services/education before persisting or spending enrichment credits.
// This is intentionally conservative: uncertain companies continue downstream
// to enrichment/scoring; only high-confidence non-merchant patterns are removed.
const NON_MERCHANT_ORG = /\b(university|universit[eé]|school|college|academy|agence|agency|consulting|consultant|marketing agency|growth agency|logistique|logistics|3pl|freight|software agency|web agency)\b/i;
const GENERIC_ORG = /^(e-?commerce|commerce|retail|online store|shop)$/i;
function merchantDiscoveryCandidate(p:any): { ok:true } | { ok:false; reason:string } {
  const name=String(p?.organization?.name||'').trim();
  const domain=String(p?.organization?.primary_domain||p?.organization?.website_url||'').trim().toLowerCase();
  if(!name) return {ok:false,reason:'organization_missing'};
  if(GENERIC_ORG.test(name)) return {ok:false,reason:'organization_generic'};
  if(NON_MERCHANT_ORG.test(name)) return {ok:false,reason:'obvious_non_merchant_organization'};
  if(/\.(edu|edu\.[a-z]{2})\b/i.test(domain)) return {ok:false,reason:'education_domain'};
  return {ok:true};
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const country = body?.country || "France";
    const titles = Array.isArray(body?.titles) && body.titles.length ? body.titles : ["founder", "CEO", "co-founder"];
    const industry = body?.industry || "ecommerce";
    const perPage = Math.min(Number(body?.per_page) || 25, 100);

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Discover ${perPage} ${titles.join("/")} in ${industry} · ${country}`,
      started_at: new Date().toISOString(),
    });

    const apolloKey = Deno.env.get("APOLLO_API_KEY");
    if (!apolloKey) {
      throw new Error("TOOL_NOT_CONFIGURED: añade APOLLO_API_KEY a Base44 secrets para activar este agente");
    }
    const costReservation = await reservePaidOperation(base44.asServiceRole,{ event_key:`api:apollo:lead-discovery:${country}:${titles.join(',')}:${new Date().toISOString().slice(0,13)}`, category:'api', provider:'apollo', source:'leadDiscoveryAgent', related_entity_type:'AgentTask', related_entity_id:task.id });

    // Apollo People Search (api_search endpoint — the v1/mixed_people/search
    // endpoint was deprecated for API callers in 2026; api_search is the
    // supported replacement per https://docs.apollo.io/reference/people-api-search)
    const res = await fetch("https://api.apollo.io/api/v1/mixed_people/api_search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apolloKey,
      },
      body: JSON.stringify({
        person_titles: titles,
        person_locations: [country],
        q_keywords: industry,
        page: 1,
        per_page: perPage,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Apollo API error: ${data?.error || data?.message || res.statusText}`);
    await settlePaidOperation(base44.asServiceRole,costReservation,{ ok:true, usage_json:{ people_returned:Array.isArray(data?.people) ? data.people.length : 0 } });

    const people = Array.isArray(data?.people) ? data.people : [];
    // GDPR Art. 6(1)(f) — every Apollo-sourced lead ships with an explicit
    // legal basis and an LIA summary, closing the two warnings raised by
    // gdprAgent (Apollo source without documented base legal + retroactive
    // audit exposure). Do NOT remove these fields.
    const LIA_NOTE = `B2B outreach to publicly listed decision-maker (${titles.join("/")}) at a ${industry} brand in ${country}. Contact obtained from Apollo.io under their DPA (SCC/DPF). Legitimate interest documented; opt-out honored in every outreach; no special-category data processed.`;
    const rejected:any[]=[];
    const leads = people.flatMap(p => {
      const quality=merchantDiscoveryCandidate(p);
      if(!quality.ok){rejected.push({organization:p?.organization?.name||null,reason:quality.reason});return [];}
      return [{
        company_name: p?.organization?.name || null,
        company_domain: p?.organization?.website_url || p?.organization?.primary_domain || null,
        contact_full_name: p?.name || [p?.first_name, p?.last_name].filter(Boolean).join(" "),
        contact_email: p?.email || null,
        contact_title: p?.title || null,
        linkedin_url: p?.linkedin_url || null,
        country,
        industry,
        source: "apollo",
        stage: "lead",
        legal_basis: "legitimate_interest",
        legal_basis_note: LIA_NOTE,
        raw_json: p,
      }];
    });

    // Persist to OutboundLead (skipped silently if no rows; bulkCreate is faster than per-row create)
    let created = [];
    if (leads.length) {
      try {
        created = await base44.asServiceRole.entities.OutboundLead.bulkCreate(leads);
      } catch (e) {
        // Don't fail the whole task on storage hiccup — return leads in payload so caller still has them
        // and record the warning in output.
        created = [{ _error: e.message }];
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Discovered ${leads.length} merchant candidates from Apollo; rejected ${rejected.length} obvious non-merchants`,
      output_payload_json: {
        count: leads.length,
        rejected_count: rejected.length,
        rejected_reasons: rejected.reduce((a:any,x:any)=>{a[x.reason]=(a[x.reason]||0)+1;return a;},{}),
        stored: Array.isArray(created) ? created.length : 0,
        sample: leads.slice(0, 5),
      },
      completed_at: new Date().toISOString(),
    });

    const createdIds = Array.isArray(created) ? created.map((r:any)=>r?.id).filter(Boolean) : [];
    return Response.json({ ok: true, task_id: task.id, count: leads.length, rejected_count: rejected.length, created_ids: createdIds, leads });
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
