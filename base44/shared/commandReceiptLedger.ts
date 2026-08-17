// COMMAND-C1 (2026-08-17) — append-only hash-chained receipt ledger for CAMBRA
// Command (PROMPT_CAMBRA_COMMAND_V1 §7). Pure: the caller reads and writes rows,
// this module decides what a valid chain looks like and detects tampering.
//
// What this ledger is NOT: it is not the proof that a domain effect happened.
// Domain receipts (CostUsageEvent, provider receipts, AgentTask execution
// receipts) stay canonical and are referenced from here (spec §3.5, §7.3).
// A CommandReceipt records that Command believed something, with the evidence
// it points at — that distinction is the whole point of the design.

export const COMMAND_RECEIPT_LEDGER_VERSION = 'command-receipt-ledger-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

export const RECEIPT_KINDS = Object.freeze([
  'READ', 'PREPARE', 'EFFECT', 'DECISION', 'ESCALATION', 'ERROR', 'SUPERSESSION',
] as const);

/** Epistemic states (spec §3.3). Ordered weakest-claim-last for clarity only. */
export const RECEIPT_STATES = Object.freeze([
  'OBSERVED', 'DERIVED', 'INFERRED', 'UNVERIFIED', 'CONFLICTED', 'UNKNOWN', 'REVIEW_REQUIRED',
] as const);

/** States that may never be produced by promoting a weaker one. */
const NEVER_PROMOTABLE_TO = new Set(['OBSERVED', 'DERIVED']);

/**
 * The exact fields that are hashed. Anything outside this list is metadata and
 * cannot be used to smuggle a change past the chain — but equally, everything
 * that carries authority meaning MUST be in here.
 */
export function canonicalReceiptPayload(row: any) {
  return {
    sequence: Number(row?.sequence),
    chain_key: text(row?.chain_key),
    run_id: text(row?.run_id),
    conversation_id: text(row?.conversation_id),
    step_key: text(row?.step_key),
    actor: text(row?.actor),
    kind: text(row?.kind).toUpperCase(),
    state: text(row?.state).toUpperCase(),
    tool_id: text(row?.tool_id),
    tool_version: text(row?.tool_version),
    input_hash: text(row?.input_hash),
    output_hash: text(row?.output_hash),
    permit_id: text(row?.permit_id),
    permit_hash: text(row?.permit_hash),
    approval_id: text(row?.approval_id),
    emergency_control_revision: row?.emergency_control_revision ?? null,
    tenant_scope: text(row?.tenant_scope),
    market_scope: text(row?.market_scope),
    domain_receipt_refs: [...(Array.isArray(row?.domain_receipt_refs) ? row.domain_receipt_refs : [])].map(text).sort(),
    cost_event_refs: [...(Array.isArray(row?.cost_event_refs) ? row.cost_event_refs : [])].map(text).sort(),
    artifact_refs: [...(Array.isArray(row?.artifact_refs) ? row.artifact_refs : [])].map(text).sort(),
    source_refs: [...(Array.isArray(row?.source_refs) ? row.source_refs : [])].map(text).sort(),
    external_effect_performed: row?.external_effect_performed === true,
    ambiguity_state: text(row?.ambiguity_state),
    supersedes_receipt_id: text(row?.supersedes_receipt_id),
    occurred_at: text(row?.occurred_at),
    ledger_version: COMMAND_RECEIPT_LEDGER_VERSION,
  };
}

export type Sha256 = (value: unknown) => Promise<string>;

/**
 * Builds the next receipt in a chain. `previous` is the caller's last known row
 * for this chain, or null to open one.
 *
 * Refuses to build when the requested sequence does not follow the previous
 * row: a ledger that silently accepts a gap is not evidence of anything.
 */
export async function buildNextReceipt(sha256: Sha256, input: {
  previous: any | null;
  chain_key: string;
  receipt: Record<string, unknown>;
  now: string;
}) {
  const chainKey = text(input.chain_key);
  if (!chainKey) return { ok: false as const, error: 'chain_key_required' };
  const kind = text(input.receipt?.kind).toUpperCase();
  const state = text(input.receipt?.state).toUpperCase();
  if (!(RECEIPT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false as const, error: 'unsupported_receipt_kind', kind };
  }
  if (!(RECEIPT_STATES as readonly string[]).includes(state)) {
    return { ok: false as const, error: 'unsupported_receipt_state', state };
  }

  const previous = input.previous;
  if (previous && text(previous.chain_key) !== chainKey) {
    return { ok: false as const, error: 'previous_receipt_belongs_to_another_chain' };
  }
  const sequence = previous ? Number(previous.sequence) + 1 : 1;
  if (!Number.isInteger(sequence) || sequence < 1) {
    return { ok: false as const, error: 'previous_receipt_sequence_invalid' };
  }

  // An EFFECT receipt that claims an external effect must point at a canonical
  // domain receipt. Command's own ledger is never sufficient proof (spec §3.4).
  const externalEffect = input.receipt?.external_effect_performed === true;
  const domainRefs = Array.isArray(input.receipt?.domain_receipt_refs) ? input.receipt.domain_receipt_refs : [];
  if (externalEffect && domainRefs.filter(Boolean).length === 0) {
    return { ok: false as const, error: 'external_effect_requires_domain_receipt_ref' };
  }

  const row: any = {
    ...input.receipt,
    receipt_id: text(input.receipt?.receipt_id) || `receipt:${chainKey}:${sequence}`,
    chain_key: chainKey,
    sequence,
    kind,
    state,
    previous_receipt_hash: previous ? text(previous.receipt_hash) : '',
    occurred_at: text(input.receipt?.occurred_at) || input.now,
    created_at: input.now,
  };
  row.receipt_hash = await sha256({
    payload: canonicalReceiptPayload(row),
    previous_receipt_hash: row.previous_receipt_hash,
  });
  return { ok: true as const, receipt: row };
}

/**
 * Verifies a whole chain. Returns the first break rather than a boolean, so an
 * operator can see exactly where evidence stops being trustworthy.
 */
export async function verifyReceiptChain(sha256: Sha256, rows: any[]) {
  const ordered = [...(Array.isArray(rows) ? rows : [])]
    .sort((left, right) => Number(left?.sequence) - Number(right?.sequence));
  if (!ordered.length) return { ok: true as const, verified: 0, break_at: null, reason: null };

  let previousHash = '';
  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    const expectedSequence = index + 1;
    if (Number(row?.sequence) !== expectedSequence) {
      return {
        ok: false as const, verified: index, break_at: Number(row?.sequence) || null,
        reason: index > 0 && Number(row?.sequence) === Number(ordered[index - 1]?.sequence)
          ? 'duplicate_sequence'
          : 'sequence_gap',
      };
    }
    if (text(row?.previous_receipt_hash) !== previousHash) {
      return { ok: false as const, verified: index, break_at: expectedSequence, reason: 'previous_hash_mismatch' };
    }
    const recomputed = await sha256({
      payload: canonicalReceiptPayload(row),
      previous_receipt_hash: text(row?.previous_receipt_hash),
    });
    if (recomputed !== text(row?.receipt_hash)) {
      return { ok: false as const, verified: index, break_at: expectedSequence, reason: 'receipt_hash_mismatch' };
    }
    previousHash = text(row.receipt_hash);
  }
  return { ok: true as const, verified: ordered.length, break_at: null, reason: null };
}

/**
 * Corrections are appended, never edited in place (spec §6.5). The superseding
 * row must be a SUPERSESSION and must name what it replaces.
 */
export function validateSupersession(input: { receipt: any; target: any | null }) {
  const blockers: string[] = [];
  if (text(input.receipt?.kind).toUpperCase() !== 'SUPERSESSION') blockers.push('supersession_kind_required');
  if (!text(input.receipt?.supersedes_receipt_id)) blockers.push('supersedes_receipt_id_required');
  if (!text(input.receipt?.superseded_reason)) blockers.push('superseded_reason_required');
  if (!input.target) blockers.push('superseded_receipt_not_found');
  else if (text(input.target.chain_key) !== text(input.receipt?.chain_key)) {
    blockers.push('cannot_supersede_across_chains');
  }
  return { allowed: blockers.length === 0, blockers };
}

/**
 * Guards the one promotion that must never happen: a weaker epistemic state
 * being restated as a stronger one for the same assertion (spec §3.3).
 */
export function validateStateTransition(input: { from: string; to: string }) {
  const from = text(input.from).toUpperCase();
  const to = text(input.to).toUpperCase();
  if (!(RECEIPT_STATES as readonly string[]).includes(to)) {
    return { allowed: false, reason: 'unsupported_target_state' };
  }
  const weak = ['INFERRED', 'UNVERIFIED', 'CONFLICTED', 'UNKNOWN'];
  if (weak.includes(from) && NEVER_PROMOTABLE_TO.has(to)) {
    return {
      allowed: false,
      reason: 'weak_evidence_cannot_be_promoted_to_observed',
      detail: 'A fresh canonical read produces a NEW receipt; it does not upgrade an old inference in place.',
    };
  }
  return { allowed: true, reason: null };
}

/**
 * COMMAND-C3 (2026-08-17) — resolves the rows a receipt cites.
 *
 * `buildNextReceipt` only checks that `domain_receipt_refs` is non-empty when an
 * external effect is claimed. It checks that a STRING exists — never that the row
 * does. A receipt citing `CostUsageEvent:does-not-exist` passes chain verification
 * today, and the chain verifying cleanly makes it look proven.
 *
 * Refs use the `entity:id` convention already established by
 * CommandArtifact.source_refs. Anything that does not parse is reported rather
 * than skipped: a malformed citation is a failed citation, not an absent one.
 *
 * Returns the same shape family as verifyReceiptChain so an operator reads one
 * vocabulary, not two.
 */
export async function resolveSourceRefs(
  refs: unknown,
  readRow: (entity: string, id: string) => Promise<any>,
) {
  const list = [...(Array.isArray(refs) ? refs : [])].map(text).filter(Boolean);
  const resolved: string[] = [];
  const unresolved: Array<{ ref: string; reason: string }> = [];

  for (const ref of list) {
    const separator = ref.indexOf(':');
    if (separator <= 0 || separator === ref.length - 1) {
      unresolved.push({ ref, reason: 'malformed_ref_expected_entity_colon_id' });
      continue;
    }
    const entity = ref.slice(0, separator).trim();
    const id = ref.slice(separator + 1).trim();
    if (!entity || !id) {
      unresolved.push({ ref, reason: 'malformed_ref_expected_entity_colon_id' });
      continue;
    }
    let row: any = null;
    try {
      row = await readRow(entity, id);
    } catch {
      // A failed lookup is NOT a missing row. Saying "this citation is fake"
      // when the store was merely down would be its own false claim.
      unresolved.push({ ref, reason: 'referent_unreadable' });
      continue;
    }
    if (!row) { unresolved.push({ ref, reason: 'referent_not_found' }); continue; }
    resolved.push(ref);
  }

  return {
    ok: unresolved.length === 0 && list.length > 0,
    cited: list.length,
    resolved,
    unresolved,
    // A claim with no citations at all is not "clean" — it is uncited, and the
    // caller must not present it as backed.
    reason: list.length === 0
      ? 'no_source_refs'
      : (unresolved.length ? 'unresolved_source_refs' : null),
  };
}

/**
 * The epistemic ceiling a set of citations permits.
 *
 * Demote-only by construction: this can lower a proposed state but never raise
 * it, so an INFERRED claim with perfect citations stays INFERRED.
 */
export function stateForCitations(
  proposed: string,
  resolution: { ok: boolean; cited: number; unresolved: Array<unknown> },
): string {
  const state = text(proposed).toUpperCase();
  if (!(RECEIPT_STATES as readonly string[]).includes(state)) return 'UNKNOWN';
  // Nothing cited: cannot be presented as observed or derived from evidence.
  if (!resolution || resolution.cited === 0) {
    return NEVER_PROMOTABLE_TO.has(state) ? 'UNVERIFIED' : state;
  }
  // Some citation did not resolve: the claim and its evidence disagree.
  if (resolution.unresolved?.length) return 'CONFLICTED';
  return state;
}
