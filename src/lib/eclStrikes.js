// v62.5 — ECL P3: functional strikes (canonical, pure).
//
// Strike ISSUANCE and COUNTING per the ECL policy. Scoped per domain (a
// payments strike never blocks accounting), time-boxed by policy.strikes
// .windowDays (no fallback constant), withdrawable (withdrawn_at makes a row
// inactive without deleting it). The two-strike CONSEQUENCE stays where P2 put
// it: the create_invoice gate reads activeStrikeCountByScope — this module
// only produces honest counts and record intents matching the P1 schema.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.

import { deepFreeze, sha256Hex, stableSerialize } from "./eclSerialize.js";

export const ECL_STRIKES_VERSION = "ecl-strikes-1";

export const STRIKE_SCOPES = ["payments", "commerce", "accounting"];

export class EclStrikeError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclStrikeError";
  }
}

const skRequire = (cond, msg) => {
  if (!cond) throw new EclStrikeError(msg);
};
const skNonEmpty = (v) => typeof v === "string" && v.length > 0;

export function strikeScopeForDomain(domain) {
  skRequire(STRIKE_SCOPES.includes(domain), `no strike scope for domain: ${String(domain)}`);
  return domain;
}

/**
 * A strike counts only while: not withdrawn AND expires_at is in the future.
 * An UNREADABLE expiry does NOT count — a sanction that cannot prove its own
 * validity window must never punish a merchant.
 */
export function isStrikeActive(strike, nowMs) {
  if (!strike || typeof strike !== "object") return false;
  if (strike.withdrawn_at) return false;
  const exp = Date.parse(String(strike.expires_at));
  if (Number.isNaN(exp)) return false;
  return exp > nowMs;
}

/** Counts by scope, every declared scope present (0 included) — the exact shape the gate context consumes. */
export function countActiveStrikesByScope(strikes, nowMs) {
  const counts = {};
  for (const scope of STRIKE_SCOPES) counts[scope] = 0;
  for (const s of Array.isArray(strikes) ? strikes : []) {
    if (!isStrikeActive(s, nowMs)) continue;
    const scope = s.scope;
    if (STRIKE_SCOPES.includes(scope)) counts[scope] += 1;
  }
  return deepFreeze(counts);
}

/** Strike expiry from the policy window ONLY — a missing windowDays is refused. */
export function deriveStrikeExpiry(now, policy) {
  const t = Date.parse(String(now));
  skRequire(!Number.isNaN(t), "now must be a parseable instant");
  const days = policy && policy.strikes ? policy.strikes.windowDays : undefined;
  skRequire(Number.isInteger(days) && days > 0, "policy.strikes.windowDays must be a positive integer (no fallback)");
  return new Date(t + days * 86400000).toISOString();
}

/**
 * Build one EvidenceStrike record intent (P1 schema, unchanged). Idempotency:
 * the key is derived from the INCIDENT (brand, scope, reason, evidence,
 * correlation), never from the instant — a replayed decision finds the same
 * key and must not produce a second strike.
 */
export function buildStrikeIntent(input, policy, context) {
  const i = input && typeof input === "object" ? input : {};
  skRequire(skNonEmpty(i.brandId), "brandId is required");
  skRequire(skNonEmpty(i.ownerEmail), "ownerEmail is required");
  skRequire(STRIKE_SCOPES.includes(i.scope), `scope must be one of ${STRIKE_SCOPES.join(", ")}`);
  skRequire(skNonEmpty(i.reasonCode), "reasonCode is required");
  skRequire(skNonEmpty(i.correlationId), "correlationId is required");

  const expiresAt = deriveStrikeExpiry(context && context.now, policy);
  const idempotencyKey = `eclp3:${sha256Hex(
    stableSerialize({
      kind: "strike",
      brandId: i.brandId,
      scope: i.scope,
      reasonCode: i.reasonCode,
      evidenceEntityType: i.evidenceEntityType || null,
      evidenceId: i.evidenceId || null,
      correlationId: i.correlationId,
    }),
  ).slice(0, 40)}`;

  const record = {
    brand_id: i.brandId,
    owner_email: i.ownerEmail,
    scope: i.scope,
    reason_code: i.reasonCode,
    expires_at: expiresAt,
    idempotency_key: idempotencyKey,
  };
  if (skNonEmpty(i.evidenceEntityType)) record.evidence_entity_type = i.evidenceEntityType;
  if (skNonEmpty(i.evidenceId)) record.evidence_id = i.evidenceId;

  return deepFreeze({ idempotencyKey, expiresAt, record });
}

/** Scopes whose active count has reached the policy threshold → human review. */
export function scopesRequiringEscalation(countsByScope, policy) {
  const threshold = policy && policy.strikes ? policy.strikes.threshold : undefined;
  skRequire(Number.isInteger(threshold) && threshold >= 1, "policy.strikes.threshold must be a positive integer (no fallback)");
  const counts = countsByScope && typeof countsByScope === "object" ? countsByScope : {};
  return deepFreeze(STRIKE_SCOPES.filter((scope) => Number(counts[scope] || 0) >= threshold));
}