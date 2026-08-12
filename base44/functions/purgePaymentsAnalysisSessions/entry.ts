import { safeBestEffort } from '../../shared/bestEffort.ts';
// purgePaymentsAnalysisSessions — scheduled daily job that deletes
// PaymentsAnalysisSession rows whose created_date is older than 90 days.
//
// Runs as service role (bypasses admin-only RLS on the entity). The 90-day
// TTL is the retention window we committed to in Chunk 3 — anonymous audit
// sessions are ephemeral: they exist so the anonymous /PaymentsResults
// teaser can render the audit right after the user submits, and to allow
// them to share the link short-term. After 90 days the URL naturally 404s.
//
// This job is intentionally idempotent and cheap: it filters by
// created_date < cutoff, deletes in batches, and returns a summary. Safe to
// re-run any time (rows already deleted just don't match the filter).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { retentionCutoff,retentionEvidenceComplete,retentionEvidenceStart } from '../../shared/retentionPolicy.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

const BATCH_SIZE = 200;

guardedScheduledServe({"worker_key":"purgePaymentsAnalysisSessions","cadence_seconds":86400},createClientFromRequest,async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // SECURITY-2 (2026-07-24) — canonical gate replacing the inverted pattern.
    // The scheduler authenticates as the app-owner admin (verified), so the
    // daily TTL purge keeps running; anonymous callers are denied.
    const gate = await requireAdminOrInternal(req, base44, null);
    if (!gate.ok) return gate.response;

    const policy=retentionCutoff('anonymous_analyzer_sessions');
    if(!policy.ok)return Response.json({ok:false,error:policy.error},{status:503});
    const cutoff = policy.cutoff;
    const evidenceStart=retentionEvidenceStart({run_key:`anonymous-analyzer:${new Date().toISOString()}:${crypto.randomUUID()}`,policy_key:'anonymous_analyzer_sessions',action:'DELETE',cutoff_at:cutoff,scope:'PaymentsAnalysisSession'});
    if(!evidenceStart.ok)return Response.json({ok:false,error:evidenceStart.error},{status:503});
    const evidence=await base44.asServiceRole.entities.RetentionExecutionEvidence.create(evidenceStart.row).catch((error:any)=>safeBestEffort(error,{operation:'purgePaymentsAnalysisSessions',fallback:null,severity:'secondary'}));
    if(!evidence)return Response.json({ok:false,error:'retention_audit_evidence_unavailable'},{status:503});

    let totalDeleted = 0;
    let totalCandidates = 0;
    let totalFailed = 0;
    let batchesProcessed = 0;
    let lastBatchSize = -1;

    // Loop until we get an empty batch. Cap at 50 batches (10k rows) per run
    // to keep any single invocation bounded — the daily cadence catches up
    // even if a backlog exists.
    while (batchesProcessed < 50 && lastBatchSize !== 0) {
      const stale = await base44.asServiceRole.entities.PaymentsAnalysisSession.filter(
        { created_date: { $lt: cutoff } },
        'created_date',
        BATCH_SIZE,
      );
      lastBatchSize = stale.length;
      totalCandidates += lastBatchSize;
      if (lastBatchSize === 0) break;

      for (const row of stale) {
        try {
          await base44.asServiceRole.entities.PaymentsAnalysisSession.delete(row.id);
          totalDeleted += 1;
        } catch (e) {
          totalFailed += 1;
          console.warn('purgePaymentsAnalysisSessions delete failed:', row.id, (e as any)?.message);
        }
      }
      batchesProcessed += 1;
    }

    const summary = {
      ok: true,
      retention_days: policy.retention_days,
      retention_policy_version: policy.policy_version,
      cutoff,
      deleted: totalDeleted,
      batches_processed: batchesProcessed,
    };
    const complete=retentionEvidenceComplete(evidenceStart,{candidate_count:totalCandidates,succeeded_count:totalDeleted,failed_count:totalFailed,batches_processed:batchesProcessed});
    await base44.asServiceRole.entities.RetentionExecutionEvidence.update(evidence.id,complete);
    console.info('purgePaymentsAnalysisSessions:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (error) {
    console.error('purgePaymentsAnalysisSessions:', (error as any)?.message, (error as any)?.stack);
    return internalErrorResponse(error, 'purgePaymentsAnalysisSessions');
  }
});
