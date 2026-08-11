import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { sha256 } from '../../shared/p3RateIntelligence.ts';
import { p4Fetch, tenantSafeP4Estimate } from '../../shared/p4Bridge.ts';

async function first(s: any, entity: string, query: any) { return (await s.entities[entity].filter(query, '-created_date', 1).catch(() => []))[0] || null; }

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body); if (!gate.ok) return gate.response;
    const brandId = String(body.brand_id || ''); const context = body.context;
    if (!brandId || !context || typeof context !== 'object') return Response.json({ ok: false, error: 'brand_id_and_p4_context_required' }, { status: 400 });
    const p4Response = tenantSafeP4Estimate(await p4Fetch('/v1/p4/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context }) }));
    const knownAt = new Date().toISOString(); const estimateKey = `p4-estimate:${await sha256({ brandId, estimateId: p4Response.estimate_id, lineage: p4Response.lineage_hash })}`;
    const existing = await first(base44.asServiceRole, 'P4StatisticalEstimate', { estimate_key: estimateKey });
    const row = existing || await base44.asServiceRole.entities.P4StatisticalEstimate.create({ estimate_key: estimateKey, brand_id: brandId, p4_estimate_id: p4Response.estimate_id, target_spec_id: p4Response.target_spec_id, model_version_id: p4Response.model_version_id, lineage_hash: p4Response.lineage_hash, as_of: p4Response.as_of, known_at: knownAt, training_cutoff: p4Response.training_cutoff || null, expires_at: p4Response.expires_at || null, status: p4Response.status, ood_status: p4Response.ood?.status || 'UNKNOWN', estimate_json: p4Response, source_projection_refs: body.source_projection_refs || [] });
    return Response.json({ ok: true, created: !existing, estimate_id: row.id, estimate_key: estimateKey, p4_status: p4Response.status, ood_status: p4Response.ood?.status || 'UNKNOWN' });
  } catch (error) { console.error('requestP4Estimate failed', error); return Response.json({ ok: false, error: 'p4_estimate_unavailable' }, { status: 503 }); }
});
