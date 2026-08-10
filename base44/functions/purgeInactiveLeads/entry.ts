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

const OUTBOUND_RETENTION_DAYS = 365;
const LEAD_RETENTION_DAYS = 730;
const BATCH_SIZE = 200;
const MAX_BATCHES = 25;

const UNENGAGED_STAGES = ['lead', 'enriched', 'scored'];

function cutoffIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function purge(entity: any, query: Record<string, unknown>) {
  let deleted = 0;
  let batches = 0;
  let lastSize = -1;
  while (batches < MAX_BATCHES && lastSize !== 0) {
    const stale = await entity.filter(query, 'created_date', BATCH_SIZE);
    lastSize = stale.length;
    if (lastSize === 0) break;
    for (const row of stale) {
      try {
        await entity.delete(row.id);
        deleted += 1;
      } catch (e) {
        console.warn('purgeInactiveLeads delete failed:', row.id, (e as any)?.message);
      }
    }
    batches += 1;
  }
  return { deleted, batches };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const gate = await requireAdminOrInternal(req, base44, null);
    if (!gate.ok) return gate.response;

    const outboundCutoff = cutoffIso(OUTBOUND_RETENTION_DAYS);
    const leadCutoff = cutoffIso(LEAD_RETENTION_DAYS);

    const outbound = await purge(
      base44.asServiceRole.entities.OutboundLead,
      { created_date: { $lt: outboundCutoff }, stage: { $in: UNENGAGED_STAGES } },
    );

    const inbound = await purge(
      base44.asServiceRole.entities.Lead,
      { created_date: { $lt: leadCutoff } },
    );

    const summary = {
      ok: true,
      outbound_leads: { retention_days: OUTBOUND_RETENTION_DAYS, cutoff: outboundCutoff, ...outbound },
      inbound_leads: { retention_days: LEAD_RETENTION_DAYS, cutoff: leadCutoff, ...inbound },
    };
    console.info('purgeInactiveLeads:', JSON.stringify(summary));
    return Response.json(summary);
  } catch (error) {
    console.error('purgeInactiveLeads:', (error as any)?.message, (error as any)?.stack);
    return Response.json({ ok: false, error: (error as any)?.message || 'internal_error' }, { status: 500 });
  }
});