// economicExecution.ts — CAMBRA v0.65.0 / ECL P6
//
// Shared execution/reconciliation primitives for Recover invoices. P6 starts
// AFTER P5 has authorized the economic effect. This module never decides
// whether money may be charged; it makes an already-authorized execution
// replay-safe and makes the local Invoice/PaymentEvent mirror converge on
// Stripe's authoritative state.
//
// Base44 currently exposes no unique constraint / atomic upsert. Therefore the
// local guarantee is named honestly: sequential retries are idempotent and
// concurrent duplicate drafts are deterministically collapsed on re-read. A
// crash can leave a transient duplicate draft, which the next issuer/reconciler
// heals. Stripe remains externally exactly-once through its idempotency keys.

export const RECOVER_EXECUTION_VERSION = 'recover-execution-1';

export function toMinor(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100);
}

export function expectedInvoiceTotalMinor(inv: any): number {
  const frozen = Number(inv?.billing_snapshot_json?.amounts_minor?.total);
  if (Number.isInteger(frozen) && frozen >= 0) return frozen;
  return toMinor(inv?.total_amount || 0);
}

export function recoverExecutionKey(reportId: unknown): string {
  const id = String(reportId || '').trim();
  if (!id) throw new Error('recover_execution_key_requires_report_id');
  return `recover-invoice:${id}`;
}

function oldestFirst(rows: any[]): any[] {
  return [...(rows || [])].sort((a, b) => {
    const at = new Date(a?.created_date || 0).getTime();
    const bt = new Date(b?.created_date || 0).getTime();
    if (at !== bt) return at - bt;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
}

async function collapseInvoiceClaims(svc: any, rows: any[]) {
  const claims = oldestFirst((rows || []).filter((r) => r?.id));
  if (!claims.length) return null;

  const committed = claims.filter((r) => r.status !== 'draft' || r.stripe_invoice_id || r.invoice_number);
  if (committed.length > 1) {
    throw new Error(`duplicate_committed_recover_invoices:${committed.map((r) => r.id).join(',')}`);
  }
  const winner = committed[0] || claims[0];
  for (const duplicate of claims) {
    if (duplicate.id === winner.id) continue;
    // Never delete an economically committed row automatically. Multiple
    // committed rows are a hard conflict above and require operator review.
    if (duplicate.status !== 'draft' || duplicate.stripe_invoice_id || duplicate.invoice_number) {
      throw new Error(`duplicate_committed_recover_invoice:${duplicate.id}`);
    }
    await svc.entities.Invoice.delete(duplicate.id);
  }
  return winner;
}

export async function claimRecoverInvoiceDraft(svc: any, executionKey: string, record: any) {
  const before = await svc.entities.Invoice.filter({ execution_key: executionKey }, 'created_date', 10);
  const prior = await collapseInvoiceClaims(svc, before);
  if (prior) return { created: false, invoice: prior };

  const created = await svc.entities.Invoice.create({ ...record, execution_key: executionKey });
  const after = await svc.entities.Invoice.filter({ execution_key: executionKey }, 'created_date', 10);
  const winner = await collapseInvoiceClaims(svc, after);
  if (!winner) throw new Error('recover_invoice_claim_unreadable_after_create');
  return { created: winner.id === created.id, invoice: winner };
}

export async function appendPaymentEventOnce(svc: any, eventHash: string, record: any) {
  if (!eventHash) throw new Error('payment_event_hash_required');
  const before = await svc.entities.PaymentEvent.filter({ invoice_id: record.invoice_id, event_hash: eventHash }, 'created_date', 5);
  const existing = oldestFirst(before || [])[0];
  if (existing) return { created: false, event: existing };

  const created = await svc.entities.PaymentEvent.create({ ...record, event_hash: eventHash });
  const after = oldestFirst(await svc.entities.PaymentEvent.filter({ invoice_id: record.invoice_id, event_hash: eventHash }, 'created_date', 5));
  if (!after.length) throw new Error('payment_event_unreadable_after_create');
  const winner = after[0];
  for (const duplicate of after.slice(1)) {
    if (duplicate.id !== winner.id) await svc.entities.PaymentEvent.delete(duplicate.id);
  }
  return { created: winner.id === created.id, event: winner };
}

export function validateStripeInvoiceBinding(inv: any, remote: any) {
  const reasons: string[] = [];
  const remoteId = String(remote?.id || '');
  const remoteCustomer = typeof remote?.customer === 'string' ? remote.customer : String(remote?.customer?.id || '');
  const remoteCurrency = String(remote?.currency || '').toUpperCase();
  const expectedCurrency = String(inv?.currency || 'EUR').toUpperCase();
  const metadata = remote?.metadata || {};
  const expectedTotalMinor = expectedInvoiceTotalMinor(inv);
  const remoteTotalMinor = Number(remote?.total);

  if (!inv?.stripe_invoice_id || remoteId !== String(inv.stripe_invoice_id)) reasons.push('stripe_invoice_id_mismatch');
  if (inv?.processor_customer_id && remoteCustomer !== String(inv.processor_customer_id)) reasons.push('stripe_customer_mismatch');
  if (remoteCurrency && remoteCurrency !== expectedCurrency) reasons.push('stripe_currency_mismatch');
  if (!Number.isInteger(remoteTotalMinor) || remoteTotalMinor !== expectedTotalMinor) reasons.push('stripe_total_mismatch');
  if (String(metadata.local_invoice_id || '') !== String(inv?.id || '')) reasons.push('stripe_metadata_local_invoice_mismatch');
  if (inv?.monthly_savings_report_id && String(metadata.monthly_savings_report_id || '') !== String(inv.monthly_savings_report_id)) reasons.push('stripe_metadata_report_mismatch');
  if (inv?.deal_activation_id && String(metadata.deal_activation_id || '') !== String(inv.deal_activation_id)) reasons.push('stripe_metadata_activation_mismatch');

  return {
    ok: reasons.length === 0,
    reasons,
    expectedTotalMinor,
    remoteTotalMinor: Number.isInteger(remoteTotalMinor) ? remoteTotalMinor : null,
    remotePaidMinor: Number.isInteger(Number(remote?.amount_paid)) ? Number(remote.amount_paid) : 0,
    remoteDueMinor: Number.isInteger(Number(remote?.amount_due)) ? Number(remote.amount_due) : Math.max(0, expectedTotalMinor - (Number(remote?.amount_paid) || 0)),
  };
}

export function stripeStatusProjection(inv: any, remote: any, nowIso = new Date().toISOString()) {
  const remoteStatus = String(remote?.status || '');
  const paidMinor = Number.isInteger(Number(remote?.amount_paid)) ? Number(remote.amount_paid) : 0;
  const dueMinor = Number.isInteger(Number(remote?.amount_due)) ? Number(remote.amount_due) : Math.max(0, expectedInvoiceTotalMinor(inv) - paidMinor);
  const totalMinor = expectedInvoiceTotalMinor(inv);
  const current = String(inv?.status || 'draft');

  // Dispute/refund are stronger states than a normal paid/open invoice and must
  // never be erased by a late invoice.* webhook.
  let target = current;
  if (!['disputed', 'refunded'].includes(current)) {
    if (remoteStatus === 'paid') target = 'paid';
    else if (remoteStatus === 'void') target = 'void';
    else if (remoteStatus === 'uncollectible') target = 'failed';
    else if (remoteStatus === 'open') {
      if (paidMinor > 0 && dueMinor > 0) target = 'partially_paid';
      else if (dueMinor > 0) target = current === 'overdue' ? 'overdue' : 'due';
    } else if (remoteStatus === 'draft' && current === 'draft') target = 'draft';
  }

  const patch: Record<string, unknown> = {
    stripe_invoice_status: remoteStatus || inv?.stripe_invoice_status || '',
    amount_paid: Math.round(paidMinor) / 100,
    balance_due: Math.max(0, Math.round(dueMinor) / 100),
    reconciliation_status: 'ok',
    reconciliation_error: '',
    last_reconciled_at: nowIso,
  };
  if (target !== current) patch.status = target;
  if (target === 'paid') {
    patch.balance_due = 0;
    patch.amount_paid = Math.round(totalMinor) / 100;
    patch.paid_at = inv?.paid_at || (remote?.status_transitions?.paid_at ? new Date(remote.status_transitions.paid_at * 1000).toISOString() : nowIso);
  }
  if (target === 'void') patch.void_reason = inv?.void_reason || 'voided_in_stripe';

  const changed = Object.entries(patch).some(([key, value]) => {
    if (key === 'last_reconciled_at') return false;
    return JSON.stringify(inv?.[key] ?? null) !== JSON.stringify(value ?? null);
  });
  return { targetStatus: target, patch, changed };
}

export function reconciliationEventHash(inv: any, remote: any, kind = 'reconciled'): string {
  return [
    'p6', kind, String(inv?.id || ''), String(remote?.id || ''), String(remote?.status || ''),
    String(remote?.total ?? ''), String(remote?.amount_paid ?? ''), String(remote?.amount_due ?? ''),
  ].join(':');
}
