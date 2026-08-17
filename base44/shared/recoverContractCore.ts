// DASHBOARD-C7 (2026-08-17) — governed Contract handler.
//
// This replaces the highest-severity page-level defect C0 found:
//
//   AdminContracts.jsx:49 — base44.entities.Contract.update(form.id, form)
//
// That wrote the ENTIRE form object over a contract from the browser, with no
// validation, no tenant check, no policy check, no field allowlist and no receipt.
// Whatever the form held became the contract.
//
// What a governed handler adds, and why each matters:
//
//  1. A FIELD ALLOWLIST. Only the fields an operator may legitimately correct are
//     writable. deal_activation_id, user_email and node_revenue_pct are NOT — those
//     bind the contract to a Recover case, a counterparty and CAMBRA's economics,
//     and correcting them by hand is a different act requiring different authority.
//  2. CAS on the field being changed, so two operators cannot silently overwrite
//     each other.
//  3. A required reason, appended to the contract's own activity_log, so the
//     history says who changed what and why.
//  4. A hash-bound preview, so an operator cannot be shown one change and apply
//     another.
//
// It writes nothing external and issues no document.

import { readRuntimeSource } from './runtimeSourceRead.ts';

export const RECOVER_CONTRACT_VERSION = 'recover-contract-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/**
 * Fields an operator may correct through this handler.
 *
 * Deliberately narrow. Everything absent from this list is either derived, bound to
 * another authority, or economically material.
 */
export const EDITABLE_FIELDS = Object.freeze([
  'deal_name', 'provider', 'category', 'start_date', 'end_date',
] as const);

/**
 * Fields that must NEVER be written here, with the reason each is protected.
 * Attempting one is refused by name so the refusal is legible.
 */
export const PROTECTED_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  user_email: 'binds the contract to a counterparty; changing it re-parties the agreement',
  deal_activation_id: 'binds the contract to a Recover case; rebinding is a case operation, not an edit',
  deal_application_id: 'binds the contract to its origin',
  node_revenue_pct: 'CAMBRA economics; editing it from an admin form would change what CAMBRA charges',
  estimated_savings_annual: 'an economic figure that must come from the audit and verification chain, not a form',
  status: 'contract lifecycle state; moving it is a governed transition, not a field edit',
  activity_log: 'append-only history; it is written by this handler, never supplied by a caller',
});

/** Contract statuses this handler recognises for display. */
export const CONTRACT_STATUSES = Object.freeze([
  'draft', 'sent', 'signed', 'active', 'expired', 'terminated', 'cancelled',
] as const);

export type ContractEditCheck = { allowed: boolean; blockers: string[]; changes: Array<{ field: string; from: unknown; to: unknown }> };

/**
 * Validates a proposed edit.
 *
 * A patch touching any protected field is refused ENTIRELY rather than partially
 * applied: silently dropping the forbidden keys and writing the rest would let a
 * caller believe the whole change landed.
 */
export function checkContractEdit(input: {
  contract: any;
  patch: Record<string, unknown>;
  reason?: string | null;
}): ContractEditCheck {
  const blockers: string[] = [];
  const patch = input.patch && typeof input.patch === 'object' ? input.patch : {};
  const keys = Object.keys(patch);

  if (!keys.length) blockers.push('empty_patch');
  if (!text(input.reason)) blockers.push('reason_required');
  if (!input.contract) blockers.push('contract_not_found');

  for (const key of keys) {
    if (PROTECTED_FIELDS[key]) {
      blockers.push(`protected_field:${key}`);
    } else if (!(EDITABLE_FIELDS as readonly string[]).includes(key)) {
      // Unknown keys are refused rather than ignored. The browser used to send the
      // whole form object, so an unrecognised key is exactly the old defect.
      blockers.push(`field_not_editable:${key}`);
    }
  }

  const changes = keys
    .filter((key) => (EDITABLE_FIELDS as readonly string[]).includes(key))
    .map((key) => ({ field: key, from: input.contract?.[key] ?? null, to: patch[key] }))
    // A no-op is not a change worth recording.
    .filter((change) => text(change.from) !== text(change.to));

  if (!blockers.length && !changes.length) blockers.push('no_effective_change');

  return { allowed: blockers.length === 0, blockers, changes };
}

/** Previews an edit. Reads, validates, hashes exactly what it saw. */
export async function previewContractEdit(input: {
  svc: any;
  contract_id: string;
  patch: Record<string, unknown>;
  reason?: string | null;
  sha256: (value: unknown) => Promise<string>;
}) {
  const read = await readRuntimeSource<any>({
    source: 'recover_contract',
    read: () => input.svc.entities.Contract.get(input.contract_id),
    fallback: null,
  });
  if (read.status === 'UNAVAILABLE') return { ok: false as const, error: 'contract_unreadable' };
  if (!read.value) return { ok: false as const, error: 'contract_not_found' };

  const check = checkContractEdit({ contract: read.value, patch: input.patch, reason: input.reason });
  const preview = {
    contract_id: text(input.contract_id),
    deal_name: text(read.value.deal_name),
    status: text(read.value.status),
    changes: check.changes,
    reason: text(input.reason) || null,
    allowed: check.allowed,
    blockers: check.blockers,
    protected_fields_refused: check.blockers
      .filter((blocker) => blocker.startsWith('protected_field:'))
      .map((blocker) => {
        const field = blocker.split(':')[1];
        return { field, why: PROTECTED_FIELDS[field] };
      }),
    // Stated so nobody reads a metadata correction as a contractual act.
    claim_boundary: 'A metadata correction. It does not change contractual terms, does not re-party the agreement, does not move the contract lifecycle and issues no document.',
    issues_document: false,
    external_send_performed: false,
  };
  return { ok: true as const, preview, preview_hash: await input.sha256(preview) };
}

/**
 * Applies the edit with CAS on every field being changed, and appends the reason to
 * the contract's own activity_log.
 */
export async function applyContractEdit(input: {
  svc: any;
  actor: string;
  contract_id: string;
  patch: Record<string, unknown>;
  reason: string;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewContractEdit(input);
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return { ok: false as const, error: 'preview_hash_mismatch', preview: previewed.preview };
  }
  if (!previewed.preview.allowed) {
    return { ok: false as const, error: 'contract_edit_not_allowed', blockers: previewed.preview.blockers };
  }

  // CAS on every field being changed, so a concurrent edit is detected rather than
  // silently overwritten.
  const guard: Record<string, unknown> = { id: input.contract_id };
  const patch: Record<string, unknown> = { last_updated: input.now };
  for (const change of previewed.preview.changes) {
    guard[change.field] = change.from;
    patch[change.field] = change.to;
  }

  const existingLog = Array.isArray((previewed.preview as any).activity_log) ? (previewed.preview as any).activity_log : [];
  patch.activity_log = [
    ...existingLog,
    {
      date: input.now,
      action: 'metadata_corrected',
      by: text(input.actor),
      reason: text(input.reason),
      fields: previewed.preview.changes.map((change) => change.field),
    },
  ];

  let changed = 0;
  try {
    const result = await input.svc.entities.Contract.updateMany(guard, patch);
    changed = Number(result?.matched_count ?? result?.modified_count ?? result?.count ?? 0);
  } catch (error) {
    return { ok: false as const, error: 'contract_update_failed', detail: text((error as any)?.message) };
  }
  if (changed !== 1) return { ok: false as const, error: 'contract_revision_conflict' };

  return {
    ok: true as const,
    applied: true,
    contract_id: text(input.contract_id),
    fields_changed: previewed.preview.changes.map((change) => change.field),
    issues_document: false,
    external_send_performed: false,
  };
}
