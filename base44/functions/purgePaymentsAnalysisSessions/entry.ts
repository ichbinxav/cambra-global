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

const RETENTION_DAYS = 90;
const BATCH_SIZE = 200;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // SECURITY-2 (2026-07-24) — canonical gate replacing the inverted pattern.
    // The scheduler authenticates as the app-owner admin (verified), so the
    // daily TTL purge keeps running; anonymous callers are denied.
    const gate = await requireAdminOrInternal(req, base44, null);
    if (!gate.ok) return gate.response;

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    let totalDeleted = 0;
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
      if (lastBatchSize === 0) break;

      for (const row of stale) {
        try {
          await base44.asServiceRole.entities.PaymentsAnalysisSession.delete(row.id);
          totalDeleted += 1;
        } catch (e) {
          console.warn('purgePaymentsAnalysisSessions delete failed:', row.id, (e as any)?.message);
        }
      }
      batchesProcessed += 1;
    }

    const summary = {
      ok: true,
      retention_days: RETENTION_DAYS,
      cutoff,
      deleted: totalDeleted,
      batches_processed: batchesProcessed,
    };
    console.info('purgePaymentsAnalysisSessions:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (error) {
    console.error('purgePaymentsAnalysisSessions:', (error as any)?.message, (error as any)?.stack);
    return Response.json({ ok: false, error: (error as any)?.message || 'internal_error' }, { status: 500 });
  }
});