import { safeBestEffort } from '../../shared/bestEffort.ts';
// purgeInactiveLeads — LEGAL-2 (2026-07-31). Scheduled monthly job that
// deletes lead personal data we no longer have a reason to keep.
//
// Two retention windows, deliberately different because the legal basis is
// different:
//
//   OutboundLead (Apollo-sourced, legitimate interest) — 12 months.
//     Only rows that were NEVER engaged are purged: stage in
//     {lead, enriched, scored}. Once a lead reaches 'contacted' or beyond
//     there is an active commercial relationship / record to keep.
//
//   Lead (inbound waitlist signups, consent-based) — 24 months.
//     Consent goes stale; after two years with no conversion we drop the row.
//
// Runs as service role (both entities are admin-only RLS). Idempotent and
// batched, same shape as purgePaymentsAnalysisSessions.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { retentionCutoff,retentionEvidenceComplete,retentionEvidenceStart } from '../../shared/retentionPolicy.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

const BATCH_SIZE = 200;
const MAX_BATCHES = 25;

const UNENGAGED_STAGES = ['lead', 'enriched', 'scored'];

async function purge(entity: any, query: Record<string, unknown>) {
  let deleted = 0,failed=0,candidates=0;
  let batches = 0;
  let lastSize = -1;
  while (batches < MAX_BATCHES && lastSize !== 0) {
    const stale = await entity.filter(query, 'created_date', BATCH_SIZE);
    lastSize = stale.length;
    candidates += lastSize;
    if (lastSize === 0) break;
    for (const row of stale) {
      try {
        await entity.delete(row.id);
        deleted += 1;
      } catch (e) {
        failed += 1;
        console.warn('purgeInactiveLeads delete failed:', row.id, (e as any)?.message);
      }
    }
    batches += 1;
  }
  return { deleted, failed, candidates, batches };
}

guardedScheduledServe({"worker_key":"purgeInactiveLeads","cadence_seconds":2592000},createClientFromRequest,async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const gate = await requireAdminOrInternal(req, base44, null);
    if (!gate.ok) return gate.response;

    const outboundPolicy = retentionCutoff('unengaged_outbound_leads');
    const leadPolicy = retentionCutoff('inbound_leads');
    if(!outboundPolicy.ok||!leadPolicy.ok)return Response.json({ok:false,error:'retention_policy_unavailable'},{status:503});
    const outboundCutoff = outboundPolicy.cutoff;
    const leadCutoff = leadPolicy.cutoff;
    const now=new Date().toISOString();
    const outboundStart=retentionEvidenceStart({run_key:`unengaged-outbound:${now}:${crypto.randomUUID()}`,policy_key:'unengaged_outbound_leads',action:'DELETE',cutoff_at:outboundCutoff,scope:'OutboundLead:unengaged'});
    const inboundStart=retentionEvidenceStart({run_key:`inbound-leads:${now}:${crypto.randomUUID()}`,policy_key:'inbound_leads',action:'DELETE',cutoff_at:leadCutoff,scope:'Lead'});
    if(!outboundStart.ok||!inboundStart.ok)return Response.json({ok:false,error:'retention_policy_not_executable'},{status:503});
    const outboundEvidence=await base44.asServiceRole.entities.RetentionExecutionEvidence.create(outboundStart.row).catch((error:any)=>safeBestEffort(error,{operation:'purgeInactiveLeads',fallback:null,severity:'secondary'}));
    const inboundEvidence=await base44.asServiceRole.entities.RetentionExecutionEvidence.create(inboundStart.row).catch((error:any)=>safeBestEffort(error,{operation:'purgeInactiveLeads',fallback:null,severity:'secondary'}));
    if(!outboundEvidence||!inboundEvidence)return Response.json({ok:false,error:'retention_audit_evidence_unavailable'},{status:503});

    const outbound = await purge(
      base44.asServiceRole.entities.OutboundLead,
      { created_date: { $lt: outboundCutoff }, stage: { $in: UNENGAGED_STAGES } },
    );

    const inbound = await purge(
      base44.asServiceRole.entities.Lead,
      { created_date: { $lt: leadCutoff } },
    );
    await base44.asServiceRole.entities.RetentionExecutionEvidence.update(outboundEvidence.id,retentionEvidenceComplete(outboundStart,{candidate_count:outbound.candidates,succeeded_count:outbound.deleted,failed_count:outbound.failed,batches_processed:outbound.batches}));
    await base44.asServiceRole.entities.RetentionExecutionEvidence.update(inboundEvidence.id,retentionEvidenceComplete(inboundStart,{candidate_count:inbound.candidates,succeeded_count:inbound.deleted,failed_count:inbound.failed,batches_processed:inbound.batches}));

    const summary = {
      ok: true,
      retention_policy_version: outboundPolicy.policy_version,
      outbound_leads: { retention_days: outboundPolicy.retention_days, cutoff: outboundCutoff, ...outbound },
      inbound_leads: { retention_days: leadPolicy.retention_days, cutoff: leadCutoff, ...inbound },
    };
    console.info('purgeInactiveLeads:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (error) {
    console.error('purgeInactiveLeads:', (error as any)?.message, (error as any)?.stack);
    return internalErrorResponse(error, 'purgeInactiveLeads');
  }
});
