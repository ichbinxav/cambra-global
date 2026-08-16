import { requireCriticalOperation } from './criticalExecution.ts';

export const API_USAGE_BILLING_VERSION = 'api-usage-billing-cas-2.0.0';
export const API_USAGE_BILLING_CLAIM_LEASE_MS = 30 * 60_000;
const MAX_PERIOD_ROWS = 5_000;
const MAX_ORGANIZATION_SHARDS = 100;

function mutationCounts(result: any): number[] {
  return [result?.updated, result?.modified_count, result?.matched_count]
    .filter((value) => value !== undefined && value !== null)
    .map(Number)
    .filter(Number.isFinite);
}

function mutationCountIs(result: any, expected: number): boolean {
  const counts = mutationCounts(result);
  return counts.length > 0 && counts.every((count) => count === expected);
}

function oldestFirst(rows: any[]): any[] {
  return [...rows].sort((a: any, b: any) =>
    String(a?.created_date || '').localeCompare(String(b?.created_date || '')) ||
    String(a?.id || '').localeCompare(String(b?.id || ''))
  );
}

function requireNonNegativeInteger(value: unknown, code: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function requireNonNegativeMoney(value: unknown, fallback: number, code: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(code);
  return parsed;
}

function executionKey(organizationId: string, periodMonth: string): string {
  return `api-overage-invoice:${organizationId}:${periodMonth}`;
}

async function readOrganizationRows(svc: any, organizationId: string, periodMonth: string) {
  const rows = await requireCriticalOperation(
    'api_usage_billing_group_read',
    () => svc.entities.ApiUsageRecord.filter(
      { organization_id: organizationId, period_month: periodMonth },
      'created_date',
      MAX_ORGANIZATION_SHARDS,
    ),
  );
  if (!Array.isArray(rows)) throw new Error('api_usage_billing_group_authority_invalid');
  // Base44 does not expose a total-count/continuation token on this API. An
  // exactly-full page is therefore ambiguous and must never be under-billed.
  if (rows.length >= MAX_ORGANIZATION_SHARDS) {
    throw new Error('api_usage_billing_group_read_truncated');
  }
  for (const row of rows) {
    if (
      !row?.id || String(row.organization_id || '') !== organizationId ||
      String(row.period_month || '') !== periodMonth
    ) throw new Error('api_usage_billing_group_binding_invalid');
    requireNonNegativeInteger(row.request_count ?? 0, 'api_usage_request_count_invalid');
  }
  return oldestFirst(rows);
}

async function readOrganization(svc: any, organizationId: string) {
  const organization = await requireCriticalOperation(
    'api_usage_billing_organization_read',
    () => svc.entities.Organization.get(organizationId),
  );
  if (!organization || String(organization.id || '') !== organizationId) {
    throw new Error('api_usage_billing_organization_authority_invalid');
  }
  return organization;
}

function economics(organization: any, rows: any[]) {
  const quota = requireNonNegativeInteger(
    organization.monthly_api_quota ?? 10_000,
    'api_usage_billing_quota_invalid',
  );
  const pricePerThousand = requireNonNegativeMoney(
    organization.overage_price_per_1k,
    0.5,
    'api_usage_billing_price_invalid',
  );
  const totalRequests = rows.reduce(
    (sum, row) => sum + requireNonNegativeInteger(
      row.request_count ?? 0,
      'api_usage_request_count_invalid',
    ),
    0,
  );
  if (!Number.isSafeInteger(totalRequests)) throw new Error('api_usage_total_overflow');
  const overageCount = Math.max(0, totalRequests - quota);
  const amountMinor = Math.round(pricePerThousand * 100 * overageCount / 1_000);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error('api_usage_billing_amount_invalid');
  }
  return {
    quota,
    price_per_1k_eur: pricePerThousand,
    total_requests: totalRequests,
    overage_count: overageCount,
    amount_minor: amountMinor,
    amount_eur: amountMinor / 100,
  };
}

async function readExistingInvoice(
  svc: any,
  organizationId: string,
  periodMonth: string,
) {
  const key = executionKey(organizationId, periodMonth);
  const [canonical, legacy] = await Promise.all([
    requireCriticalOperation(
      'api_usage_billing_invoice_key_read',
      () => svc.entities.Invoice.filter({ execution_key: key }, 'created_date', 2),
    ),
    // v1 used a per-shard execution key and did not populate top-level
    // organization_id. The immutable billing snapshot is the migration-safe
    // authority for detecting those invoices before any new economic effect.
    requireCriticalOperation(
      'api_usage_billing_legacy_invoice_read',
      () => svc.entities.Invoice.filter({
        'billing_snapshot_json.organization_id': organizationId,
        'billing_snapshot_json.period_month': periodMonth,
      }, 'created_date', 20),
    ),
  ]);
  if (!Array.isArray(canonical) || !Array.isArray(legacy)) {
    throw new Error('api_usage_billing_invoice_authority_invalid');
  }
  if (canonical.length >= 2 || legacy.length >= 20) {
    throw new Error('api_usage_billing_invoice_read_ambiguous');
  }
  const byId = new Map<string, any>();
  for (const invoice of [...canonical, ...legacy]) {
    if (!invoice?.id) throw new Error('api_usage_billing_invoice_identity_invalid');
    byId.set(String(invoice.id), invoice);
  }
  if (byId.size > 1) throw new Error('duplicate_api_usage_invoices');
  const invoice = [...byId.values()][0] || null;
  if (!invoice) return null;
  const snapshot = invoice.billing_snapshot_json || {};
  if (
    String(snapshot.organization_id || invoice.organization_id || '') !== organizationId ||
    String(snapshot.period_month || '') !== periodMonth
  ) throw new Error('api_usage_billing_invoice_binding_mismatch');
  return invoice;
}

async function initializeClaimRevision(svc: any, row: any) {
  if (Number.isSafeInteger(Number(row.billing_claim_revision)) && Number(row.billing_claim_revision) >= 0) {
    return;
  }
  if (row.billing_claim_revision !== undefined && row.billing_claim_revision !== null) {
    throw new Error('api_usage_billing_claim_revision_invalid');
  }
  // billing_run_id:null matches historical rows where the additive field is
  // absent. request_count is the recorder fence; an API request racing this
  // migration cannot have its increment/revision overwritten.
  await requireCriticalOperation(
    'api_usage_billing_claim_revision_initialize',
    () => svc.entities.ApiUsageRecord.updateMany({
      id: row.id,
      organization_id: row.organization_id,
      period_month: row.period_month,
      request_count: Number(row.request_count || 0),
      billing_run_id: null,
    }, { $set: { billing_claim_revision: 0, billed: false } }),
  );
}

async function claimOrganizationPeriod(
  svc: any,
  rows: any[],
  runId: string,
  now: Date,
) {
  const claimable = oldestFirst(rows.filter((row) => row.billed !== true));
  if (!claimable.length) return { acquired: false, terminal: true, reason: 'already_billed' };
  let authority = claimable[0];
  await initializeClaimRevision(svc, authority);
  const refreshedRows = await readOrganizationRows(
    svc,
    String(authority.organization_id),
    String(authority.period_month),
  );
  authority = refreshedRows.find((row) => String(row.id) === String(authority.id));
  if (!authority) throw new Error('api_usage_billing_claim_authority_lost');
  const revision = requireNonNegativeInteger(
    authority.billing_claim_revision,
    'api_usage_billing_claim_revision_invalid',
  );
  const currentRun = String(authority.billing_run_id || '').trim();
  if (currentRun) {
    const claimedAtMs = new Date(authority.billing_claimed_at || '').getTime();
    if (!Number.isFinite(claimedAtMs)) throw new Error('api_usage_billing_claim_timestamp_invalid');
    if (now.getTime() - claimedAtMs < API_USAGE_BILLING_CLAIM_LEASE_MS) {
      return { acquired: false, in_progress: true, reason: 'claimed_elsewhere' };
    }
    // There is no unique constraint on Invoice.execution_key. A timed-out
    // process may still resume, so stealing its claim could produce two local
    // invoices. A stale claim is an explicit reconciliation task, never an
    // automatic retry of an economic effect.
    throw new Error('api_usage_billing_stale_claim_review_required');
  }
  const key = executionKey(String(authority.organization_id), String(authority.period_month));
  const changed = await requireCriticalOperation(
    'api_usage_billing_claim_cas',
    () => svc.entities.ApiUsageRecord.updateMany({
      id: authority.id,
      organization_id: authority.organization_id,
      period_month: authority.period_month,
      request_count: Number(authority.request_count || 0),
      billed: false,
      billing_claim_revision: revision,
    }, { $set: {
      billing_run_id: runId,
      billing_claimed_at: now.toISOString(),
      billing_execution_key: key,
      billing_claim_revision: revision + 1,
    } }),
  );
  const observed = await requireCriticalOperation(
    'api_usage_billing_claim_readback',
    () => svc.entities.ApiUsageRecord.get(String(authority.id)),
  );
  const owned = observed && String(observed.billing_run_id || '') === runId &&
    Number(observed.billing_claim_revision) === revision + 1;
  if (!owned) {
    if (!mutationCountIs(changed, 0) && mutationCounts(changed).length === 0) {
      throw new Error('api_usage_billing_claim_result_ambiguous');
    }
    return { acquired: false, in_progress: true, reason: 'claim_lost' };
  }
  return { acquired: true, authority_id: String(authority.id), key };
}

async function assertClaimOwned(svc: any, authorityId: string, runId: string) {
  const observed = await requireCriticalOperation(
    'api_usage_billing_fence_read',
    () => svc.entities.ApiUsageRecord.get(authorityId),
  );
  if (
    !observed || observed.billed === true ||
    String(observed.billing_run_id || '') !== runId
  ) throw new Error('api_usage_billing_fence_lost');
  return observed;
}

async function closeUsageRows(
  svc: any,
  rows: any[],
  input: {
    organization_id: string;
    period_month: string;
    run_id: string;
    key: string;
    invoice_id?: string | null;
    at: string;
  },
) {
  const unbilled = rows.filter((row) => row.billed !== true);
  if (!unbilled.length) return;
  const changed = await requireCriticalOperation(
    'api_usage_billing_rows_close',
    () => svc.entities.ApiUsageRecord.updateMany({
      organization_id: input.organization_id,
      period_month: input.period_month,
      billed: false,
    }, { $set: {
      billed: true,
      billed_at: input.at,
      billing_run_id: input.run_id,
      billing_execution_key: input.key,
      invoice_id: input.invoice_id || null,
    } }),
  );
  const readback = await readOrganizationRows(svc, input.organization_id, input.period_month);
  const settled = readback.length === rows.length && readback.every((row) =>
    row.billed === true && String(row.billing_execution_key || '') === input.key &&
    String(row.invoice_id || '') === String(input.invoice_id || '')
  );
  if (!settled || (!mutationCountIs(changed, unbilled.length) && mutationCounts(changed).length === 0)) {
    throw new Error('api_usage_billing_rows_close_ambiguous');
  }
}

function validateExistingEconomics(invoice: any, expected: ReturnType<typeof economics>) {
  const snapshot = invoice?.billing_snapshot_json || {};
  const invoiceMinor = Math.round(Number(invoice?.total_amount || 0) * 100);
  if (
    Number(snapshot.total_requests) !== expected.total_requests ||
    Number(snapshot.included_quota) !== expected.quota ||
    Number(snapshot.overage_count) !== expected.overage_count ||
    invoiceMinor !== expected.amount_minor
  ) throw new Error('api_usage_existing_invoice_economics_mismatch');
}

export async function listApiUsageOrganizationIds(svc: any, periodMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) throw new Error('api_usage_billing_period_invalid');
  const rows = await requireCriticalOperation(
    'api_usage_billing_period_read',
    () => svc.entities.ApiUsageRecord.filter(
      { period_month: periodMonth },
      'created_date',
      MAX_PERIOD_ROWS,
    ),
  );
  if (!Array.isArray(rows)) throw new Error('api_usage_billing_period_authority_invalid');
  if (rows.length >= MAX_PERIOD_ROWS) throw new Error('api_usage_billing_period_read_truncated');
  const ids = new Set<string>();
  for (const row of rows) {
    const id = String(row?.organization_id || '').trim();
    if (!id || String(row?.period_month || '') !== periodMonth) {
      throw new Error('api_usage_billing_period_binding_invalid');
    }
    ids.add(id);
  }
  return [...ids].sort();
}

export async function billApiUsageOrganization(
  svc: any,
  input: {
    organization_id: string;
    period_month: string;
    run_id: string;
    now?: Date;
    assert_before_invoice?: () => Promise<any>;
    assert_after_invoice?: () => Promise<any>;
  },
) {
  const organizationId = String(input.organization_id || '').trim();
  const periodMonth = String(input.period_month || '').trim();
  const runId = String(input.run_id || '').trim();
  if (!organizationId || !runId || !/^\d{4}-\d{2}$/.test(periodMonth)) {
    throw new Error('api_usage_billing_input_invalid');
  }
  const now = input.now || new Date();
  let rows = await readOrganizationRows(svc, organizationId, periodMonth);
  if (!rows.length) return { status: 'no_usage', organization_id: organizationId };
  let organization = await readOrganization(svc, organizationId);
  let expected = economics(organization, rows);
  let existingInvoice = await readExistingInvoice(svc, organizationId, periodMonth);

  if (rows.every((row) => row.billed === true)) {
    if (expected.amount_minor > 0 && !existingInvoice) {
      throw new Error('api_usage_billed_without_invoice');
    }
    if (existingInvoice) validateExistingEconomics(existingInvoice, expected);
    return {
      status: 'already_billed',
      organization_id: organizationId,
      invoice_id: existingInvoice?.id || null,
    };
  }
  if (rows.some((row) => row.billed === true) && !existingInvoice) {
    throw new Error('api_usage_partial_billing_without_invoice');
  }

  const claim = await claimOrganizationPeriod(svc, rows, runId, now);
  if (!claim.acquired) {
    return { status: claim.reason || 'claimed_elsewhere', organization_id: organizationId };
  }
  const claimKey = String(claim.key || '');
  if (!claimKey || !claim.authority_id) throw new Error('api_usage_billing_claim_identity_invalid');

  // The recorder increments the same claim revision. Once our CAS succeeds it
  // can no longer add usage to this period; this read is the frozen aggregate.
  rows = await readOrganizationRows(svc, organizationId, periodMonth);
  const authority = rows.find((row) => String(row.id) === claim.authority_id);
  if (!authority || String(authority.billing_run_id || '') !== runId) {
    throw new Error('api_usage_billing_fence_lost');
  }
  organization = await readOrganization(svc, organizationId);
  expected = economics(organization, rows);
  existingInvoice = await readExistingInvoice(svc, organizationId, periodMonth);

  let invoice = existingInvoice;
  if (invoice) validateExistingEconomics(invoice, expected);
  if (!invoice && expected.amount_minor > 0) {
    await assertClaimOwned(svc, String(claim.authority_id), runId);
    if (input.assert_before_invoice) await input.assert_before_invoice();
    const record = {
      execution_key: claimKey,
      organization_id: organizationId,
      status: 'issued',
      currency: 'EUR',
      issued_at: now.toISOString(),
      due_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1_000).toISOString(),
      subtotal_amount: expected.amount_eur,
      total_amount: expected.amount_eur,
      balance_due: expected.amount_eur,
      notes: `API overage · ${periodMonth} · ${expected.overage_count} requests above quota`,
      billing_snapshot_json: {
        billing_kind: 'api_overage',
        billing_version: API_USAGE_BILLING_VERSION,
        organization_id: organizationId,
        organization_name: organization.name,
        period_month: periodMonth,
        included_quota: expected.quota,
        overage_price_per_1k_eur: expected.price_per_1k_eur,
        total_requests: expected.total_requests,
        overage_count: expected.overage_count,
        overage_amount_eur: expected.amount_eur,
        overage_amount_minor: expected.amount_minor,
      },
    };
    try {
      invoice = await requireCriticalOperation(
        'api_usage_billing_invoice_create',
        () => svc.entities.Invoice.create(record),
      );
    } catch (error) {
      // A create response may be lost after commit. Never release the claim or
      // retry the effect blindly; prove the deterministic invoice first.
      invoice = await readExistingInvoice(svc, organizationId, periodMonth);
      if (!invoice) throw error;
      validateExistingEconomics(invoice, expected);
    }
  }

  let epochError: any = null;
  if (invoice && input.assert_after_invoice) {
    try {
      await input.assert_after_invoice();
    } catch (error) {
      epochError = error;
      await requireCriticalOperation(
        'api_usage_billing_invoice_reconciliation_hold',
        () => svc.entities.Invoice.update(invoice.id, {
          reconciliation_status: 'error',
          last_error: 'emergency_control_changed_during_invoice_creation',
          last_failed_at: now.toISOString(),
        }),
      );
    }
  }

  await assertClaimOwned(svc, String(claim.authority_id), runId);

  await closeUsageRows(svc, rows, {
    organization_id: organizationId,
    period_month: periodMonth,
    run_id: runId,
    key: claimKey,
    invoice_id: invoice?.id || null,
    at: now.toISOString(),
  });

  return {
    status: epochError ? 'review_required' : (invoice ? 'invoiced' : 'closed_no_charge'),
    organization_id: organizationId,
    organization_name: organization.name,
    amount_eur: expected.amount_eur,
    overage_count: expected.overage_count,
    total_requests: expected.total_requests,
    invoice_id: invoice?.id || null,
    review_required: Boolean(epochError),
    error: epochError ? String(epochError?.message || 'emergency_control_changed') : undefined,
    version: API_USAGE_BILLING_VERSION,
  };
}
