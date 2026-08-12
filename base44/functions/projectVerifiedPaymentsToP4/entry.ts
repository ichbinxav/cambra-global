import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { P3_SCHEMA_VERSION, sha256 } from '../../shared/p3RateIntelligence.ts';
import { P4_BRIDGE_VERSION, p4ObservationFromVerifiedPayment, p4Pseudonym } from '../../shared/p4Bridge.ts';

async function first(s: any, entity: string, query: any) { return (await s.entities[entity].filter(query, '-created_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'projectVerifiedPaymentsToP4',fallback:[],severity:'secondary'})))[0] || null; }

export async function handleProjectVerifiedPaymentsToP4(req: Request) {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body); if (!gate.ok) return gate.response;
    const sourceId = String(body.payments_analysis_verified_id || '');
    if (!sourceId) return Response.json({ ok: false, error: 'payments_analysis_verified_id_required' }, { status: 400 });
    const verified = await base44.asServiceRole.entities.PaymentsAnalysisVerified.get(sourceId).catch((error:any)=>safeBestEffort(error,{operation:'projectVerifiedPaymentsToP4',fallback:null,severity:'secondary'}));
    if (!verified) return Response.json({ ok: false, error: 'verified_payment_measurement_not_found' }, { status: 404 });
    const integration = await base44.asServiceRole.entities.Integration.get(verified.integration_id).catch((error:any)=>safeBestEffort(error,{operation:'projectVerifiedPaymentsToP4',fallback:null,severity:'secondary'}));
    if (!integration || integration.brand_id !== verified.brand_id) return Response.json({ ok: false, error: 'integration_provenance_invalid' }, { status: 409 });
    const sourceFingerprint = await sha256({ sourceId: verified.id, sourceChargesHash: verified.source_charges_hash, engineVersion: verified.engine_version, measurementWindow: verified.measurement_window, measuredCurrentBps: verified.measured_current_bps });
    const projectionKey = `p4-projection:${sourceFingerprint}`;
    const prior = await first(base44.asServiceRole, 'P4EvidenceProjection', { projection_key: projectionKey });
    if (prior) return Response.json({ ok: true, created: false, projection_id: prior.id, projection_key: projectionKey });
    const [tenantPseudonym, merchantPseudonym, contractPseudonym] = await Promise.all([p4Pseudonym('merchant', `tenant:${verified.brand_id}`), p4Pseudonym('merchant', verified.brand_id), p4Pseudonym('contract', verified.integration_id)]);
    const observation = p4ObservationFromVerifiedPayment({ verified, context: body.context, projectionKey, tenantPseudonym, merchantPseudonym, contractPseudonym });
    const row = await base44.asServiceRole.entities.P4EvidenceProjection.create({ projection_key: projectionKey, source_type: 'PAYMENTS_ANALYSIS_VERIFIED', source_id: verified.id, source_fingerprint: sourceFingerprint, brand_id: verified.brand_id, integration_id: verified.integration_id, observation_json: observation, observed_at: observation.observed_at, known_at: new Date().toISOString(), p3_schema_version: P3_SCHEMA_VERSION, projection_version: P4_BRIDGE_VERSION, status: 'CURRENT' });
    return Response.json({ ok: true, created: true, projection_id: row.id, projection_key: projectionKey, note: 'P4 private evidence projection created; no P3 truth was modified.' });
  } catch (error) { console.error('projectVerifiedPaymentsToP4 failed', error); return Response.json({ ok: false, error: 'p4_projection_failed' }, { status: 400 }); }
}
