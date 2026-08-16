import { attemptFailClosedOperation, requireCriticalOperation } from './criticalExecution.ts';

export const API_USAGE_VERSION = 'api-usage-cas-2.0.0';
const MAX_CAS_ATTEMPTS = 8;
const MAX_USAGE_SHARDS = 100;

function exactlyOne(result: any) {
  const counts = [result?.updated, result?.modified_count, result?.matched_count]
    .filter((value) => value !== undefined && value !== null)
    .map(Number);
  return counts.length > 0 && counts.every((value) => value === 1);
}

export async function recordApiUsage(svc: any, principal: any, at = new Date()) {
  const organizationId = String(principal?.raw?.organization_id || '').trim();
  if (!organizationId) return { ok: true, tracked: false, reason: 'organization_not_applicable' };
  const periodMonth = at.toISOString().slice(0, 7);
  const organization = await requireCriticalOperation(
    'api_usage_organization_read',
    () => svc.entities.Organization.get(organizationId),
  );
  if (!organization || String(organization.id || '') !== organizationId) {
    throw new Error('api_usage_organization_authority_invalid');
  }
  const quota = Math.max(0, Number(organization.monthly_api_quota ?? 10000));
  const overagePerThousand = Math.max(0, Number(organization.overage_price_per_1k ?? 0.5));
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const rows = await requireCriticalOperation(
      'api_usage_record_read',
      () => svc.entities.ApiUsageRecord.filter(
        { organization_id: organizationId, period_month: periodMonth },
        'created_date',
        MAX_USAGE_SHARDS,
      ),
    );
    if (!Array.isArray(rows)) throw new Error('api_usage_record_authority_unavailable');
    // An exactly-full page may have been truncated by Base44. Counting it as
    // complete would understate both usage and invoice economics.
    if (rows.length >= MAX_USAGE_SHARDS) throw new Error('api_usage_record_read_truncated');
    if (rows.some((row: any) => row.billed === true || String(row.billing_run_id || '').trim())) {
      throw new Error('api_usage_period_closed');
    }
    const counts = rows.map((row: any) => Number(row.request_count || 0));
    if (counts.some((count: number) => !Number.isSafeInteger(count) || count < 0)) {
      throw new Error('api_usage_request_count_invalid');
    }
    const total = counts.reduce((sum: number, count: number) => sum + count, 0);
    if (!Number.isSafeInteger(total)) throw new Error('api_usage_total_overflow');
    const nextTotal = total + 1;
    const overageCount = Math.max(0, nextTotal - quota);
    const overageAmount = Math.round(overagePerThousand * (overageCount / 1000) * 100) / 100;
    if (!rows.length) {
      const created = await attemptFailClosedOperation(
        'api_usage_record_create',
        () => svc.entities.ApiUsageRecord.create({
          organization_id: organizationId,
          period_month: periodMonth,
          request_count: 1,
          included_quota: quota,
          overage_count: overageCount,
          overage_amount_eur: overageAmount,
          billing_claim_revision: 0,
          billed: false,
          last_updated_at: at.toISOString(),
        }),
      );
      if (created) return { ok: true, tracked: true, request_count: nextTotal, version: API_USAGE_VERSION };
      continue;
    }
    const target = [...rows].sort((a: any, b: any) =>
      String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id).localeCompare(String(b.id))
    )[0];
    const oldCount = Math.max(0, Number(target.request_count || 0));
    const rawRevision = target.billing_claim_revision;
    if (rawRevision === undefined || rawRevision === null) {
      // Historical rows pre-date the revision fence. billing_run_id:null and
      // request_count prevent this additive initialization from overwriting a
      // concurrent billing claim or API increment.
      await requireCriticalOperation(
        'api_usage_record_revision_initialize',
        () => svc.entities.ApiUsageRecord.updateMany({
          id: target.id,
          organization_id: organizationId,
          period_month: periodMonth,
          request_count: oldCount,
          billing_run_id: null,
        }, { $set: { billing_claim_revision: 0, billed: false } }),
      );
      continue;
    }
    const revision = Number(rawRevision);
    if (!Number.isSafeInteger(revision) || revision < 0) {
      throw new Error('api_usage_claim_revision_invalid');
    }
    const changed = await attemptFailClosedOperation(
      'api_usage_record_cas',
      () => svc.entities.ApiUsageRecord.updateMany(
        {
          id: target.id,
          organization_id: organizationId,
          period_month: periodMonth,
          request_count: oldCount,
          billed: false,
          billing_claim_revision: revision,
        },
        { $set: {
          request_count: oldCount + 1,
          included_quota: quota,
          // Aggregate overage is computed across all shards, then stored on the
          // canonical shard for deterministic billing reads.
          overage_count: overageCount,
          overage_amount_eur: overageAmount,
          billing_claim_revision: revision + 1,
          last_updated_at: at.toISOString(),
        } },
      ),
    );
    if (exactlyOne(changed)) return { ok: true, tracked: true, request_count: nextTotal, version: API_USAGE_VERSION };
  }
  throw new Error('api_usage_concurrency_exhausted');
}
