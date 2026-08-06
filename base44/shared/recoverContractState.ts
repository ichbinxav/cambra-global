// recoverContractState — RECOVER-3 (2026-08-03).
//
// The delivery state machine of the contractual PDF and its email: error
// classification, backoff ladder, leases, idempotency key and the log helpers.
// It lives here, once, because generateRecoverContractPdf,
// sendRecoverContractEmail and retryPendingRecoverContracts must agree exactly on
// what "retryable" means and when an abandoned job may be reclaimed — three
// copies of that judgement is how a document gets generated twice.
//
// NOTHING in this module ever writes Mandate.status or DealActivation.status. The
// contract exists from the moment of a valid acceptance; delivery is a separate,
// failure-tolerant concern.

/** Retry ladder in minutes. Applied to both PDF and email. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720, 1440];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length;

/** A 'generating' / 'sending' claim older than this is considered abandoned. */
export const LEASE_MINUTES = 10;

/** Permanent PDF failures: retrying cannot change the outcome. */
export const PERMANENT_PDF_ERRORS = [
  'acceptance_snapshot_missing',
  'source_snapshot_integrity_mismatch',
  'legal_identity_missing',
  'template_invalid',
  'template_version_unknown',
  'mandate_not_acceptable',
  'unsupported_language',
];

/** Permanent email failures. 'recipient_invalid' is not worth a second attempt. */
export const PERMANENT_EMAIL_ERRORS = ['recipient_invalid', 'sender_not_configured'];

export function nextRetryAt(attemptCount: number, now: Date = new Date()): string {
  const idx = Math.min(Math.max(attemptCount, 1), BACKOFF_MINUTES.length) - 1;
  const base = BACKOFF_MINUTES[idx] * 60_000;
  // Jitter spreads a burst of simultaneous failures so they do not all retry
  // in the same reconciler tick.
  const jitter = Math.floor(Math.random() * Math.min(base * 0.2, 60_000));
  return new Date(now.getTime() + base + jitter).toISOString();
}

export function leaseExpired(lastAttemptAt: unknown, now: Date = new Date()): boolean {
  if (!lastAttemptAt) return true;
  const t = new Date(String(lastAttemptAt)).getTime();
  if (!Number.isFinite(t)) return true;
  return now.getTime() - t > LEASE_MINUTES * 60_000;
}

/**
 * Maps a thrown error onto a NORMALIZED code. Anything unrecognized is treated as
 * retryable: an unknown transient fault must not permanently deny a merchant the
 * copy of a contract they legitimately accepted.
 */
export function classifyError(err: unknown, permanentCodes: string[]): { code: string; retryable: boolean } {
  const raw = String((err as Error)?.message || err || 'unknown_error');
  const code = raw.split(':')[0].trim().slice(0, 64) || 'unknown_error';
  return { code, retryable: !permanentCodes.includes(code) };
}

/** Stable delivery claim: one canonical document + one email per accepted terms. */
export function deliveryIdempotencyKey(parts: {
  mandateId: string;
  snapshotHash: string;
  templateVersion: string;
  language: string;
}): string {
  return `recover-contract:${parts.mandateId}:${parts.snapshotHash}:${parts.templateVersion}:${parts.language}`;
}

/** Opaque, non-guessable storage path. Carries no email, company or person name. */
export function storageFileName(mandateId: string): string {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return `recover-contract-${mandateId.slice(0, 8)}-${suffix}.pdf`;
}

/** Short, human-quotable reference. Never the full mandate id. */
export function safeReference(mandateId: string): string {
  return `RM-${String(mandateId).slice(0, 8).toUpperCase()}`;
}

/** Masks an address for UI/admin display: j***@example.com */
export function maskEmail(email: unknown): string {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '';
  return `${s[0]}***${s.slice(at)}`;
}

export type ContractEvent =
  | 'recover_contract_pdf_queued'
  | 'recover_contract_pdf_generation_started'
  | 'recover_contract_pdf_generated'
  | 'recover_contract_pdf_generation_failed'
  | 'recover_contract_pdf_integrity_failed'
  | 'recover_contract_pdf_downloaded'
  | 'recover_contract_email_queued'
  | 'recover_contract_email_sent'
  | 'recover_contract_email_failed'
  | 'recover_contract_email_suppressed'
  | 'recover_contract_email_resent_by_admin';

/**
 * Appends to OperationalLog, reusing the existing 'status_changed' event_type
 * because the entity's enum is closed and RECOVER-3 deliberately does not widen
 * it (the specific event name lives in data_json.event). Best-effort: a log write
 * must never be the reason a generated document is not recorded as generated.
 */
export async function logContractEvent(
  svc: any,
  event: ContractEvent,
  mandate: any,
  data: Record<string, unknown> = {},
  actorEmail = 'internal',
): Promise<void> {
  await svc.entities.OperationalLog.create({
    deal_activation_id: mandate?.deal_activation_id || '',
    brand_id: mandate?.brand_id || '',
    provider_id: mandate?.provider_id || '',
    event_type: 'status_changed',
    message: event,
    data_json: { event, mandate_id: mandate?.id, ...data },
    actor_email: actorEmail,
    created_at: new Date().toISOString(),
  }).catch(() => null);
}