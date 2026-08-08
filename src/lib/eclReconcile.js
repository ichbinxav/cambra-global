// v62.5 — ECL P3: reconciliation of new vs existing evidence (canonical, pure).
//
// Deterministic deduplication + contradiction detection. This module states
// FACTS about how the new evidence relates to the existing set; the ENGINE
// (eclEngine.js) decides what those facts mean for the lifecycle. Tolerances
// come EXCLUSIVELY from the ECL policy — no fallback constant lives here, and
// an unreadable policy value is refused, never patched.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.

import { deepFreeze } from "./eclSerialize.js";

// v62.6 — reconcile-2: supersession now requires POSITIVE COMPARABILITY. "No
// detected difference" is NOT "evidence matches" when there was nothing
// comparable to inspect: an unreadable replacement can never silently
// supersede verified evidence — it routes to review instead.
export const ECL_RECONCILE_VERSION = "ecl-reconcile-2";

// Statuses whose records still SPEAK for the merchant. rejected/superseded
// evidence is history: it can still be recognized (checksum replay) but never
// contradicts or gets superseded again.
export const RECONCILE_LIVE_STATUSES = [
  "pending",
  "processing",
  "estimated",
  "accepted_provisionally",
  "verified",
  "under_review",
  "expired",
];

export class EclReconcileError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclReconcileError";
  }
}

const rcRequire = (cond, msg) => {
  if (!cond) throw new EclReconcileError(msg);
};

/** |a−b| relative to the larger magnitude, in percent. Both zero → 0. */
export function relativeDeltaPct(a, b) {
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return 0;
  return (Math.abs(a - b) / base) * 100;
}

const rcDateMs = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const t = Date.parse(`${String(v)}T00:00:00.000Z`);
  return Number.isNaN(t) ? null : t;
};

export function periodsEqual(a, b) {
  return (
    a.periodStart !== null && a.periodStart !== undefined &&
    a.periodEnd !== null && a.periodEnd !== undefined &&
    a.periodStart === b.periodStart && a.periodEnd === b.periodEnd
  );
}

export function periodsOverlap(a, b) {
  const aS = rcDateMs(a.periodStart);
  const aE = rcDateMs(a.periodEnd);
  const bS = rcDateMs(b.periodStart);
  const bE = rcDateMs(b.periodEnd);
  if (aS === null || aE === null || bS === null || bE === null) return false;
  return aS <= bE && bS <= aE;
}

const GROSS_FIELD_BY_DOMAIN = { payments: "grossAmountMinor", commerce: "grossSalesAmountMinor" };

// v62.6 — the core metric set each domain must expose for two records to be
// MEANINGFULLY comparable. Accounting has no aggregate contract, so its
// comparable core is derived from the readable ledger entries.
const CORE_COMPARABLE_BY_DOMAIN = { payments: ["grossAmountMinor", "feesAmountMinor"], commerce: ["grossSalesAmountMinor"] };

/**
 * The comparable core of an envelope, or null when the evidence cannot be
 * meaningfully compared (a core metric missing, or no readable entries).
 * Null NEVER means "matches" — the caller must route to review.
 */
export function comparableCore(env) {
  const e = env && typeof env === "object" ? env : {};
  if (e.domain === "accounting") {
    const entries = Array.isArray(e.entries) ? e.entries : [];
    if (entries.length === 0) return null;
    let total = 0;
    for (const it of entries) total += it && typeof it.amountMinor === "number" ? it.amountMinor : 0;
    return { entriesTotalMinor: total, entryCount: entries.length };
  }
  const core = CORE_COMPARABLE_BY_DOMAIN[e.domain] || [];
  if (core.length === 0) return null;
  const m = e.metrics || {};
  const out = {};
  for (const k of core) {
    if (typeof m[k] !== "number") return null;
    out[k] = m[k];
  }
  return out;
}

function rcSharedMetricDeltas(aMetrics, bMetrics) {
  const deltas = [];
  const a = aMetrics || {};
  const b = bMetrics || {};
  for (const key of Object.keys(a)) {
    if (b[key] === undefined) continue;
    const deltaPct = relativeDeltaPct(a[key], b[key]);
    if (deltaPct > 0) deltas.push({ field: key, a: a[key], b: b[key], deltaPct: Math.round(deltaPct * 100) / 100 });
  }
  return deltas;
}

/**
 * Reconcile ONE new normalized evidence against the existing set.
 *   evidence — a NormalizedEvidence envelope (domain, checksum, importId,
 *              periodStart/End, currency, metrics).
 *   existing — [{ id, status, evidence }] where `evidence` carries at least
 *              the same envelope fields for the prior record.
 * Returns deep-frozen FACTS:
 *   duplicates      [{ existingId, reason, live }]
 *   supersedes      [{ existingId, reason }]           (live records only)
 *   contradictions  [{ existingId, code, detail, deltaPct? }]
 *   crossChecks     [{ existingId, deltaPct, withinTolerance }]
 *   ambiguities     [{ existingId, code }]              (fail-closed → review)
 */
export function reconcileEvidence(evidence, existing, policy) {
  rcRequire(evidence && typeof evidence === "object" && typeof evidence.domain === "string", "evidence must be a normalized envelope with a domain");
  rcRequire(Array.isArray(existing), "existing must be an array (pass [] when there is none)");
  const tolerancePct = policy && policy.reconciliation ? policy.reconciliation.commerceVsPaymentsMaxDeltaPct : undefined;
  rcRequire(
    typeof tolerancePct === "number" && Number.isFinite(tolerancePct) && tolerancePct >= 0 && tolerancePct <= 100,
    "policy.reconciliation.commerceVsPaymentsMaxDeltaPct must be a number in [0,100] (no fallback)",
  );

  const duplicates = [];
  const supersedes = [];
  const contradictions = [];
  const crossChecks = [];
  const ambiguities = [];

  for (const ex of existing) {
    if (!ex || typeof ex !== "object" || !ex.id || !ex.evidence || typeof ex.evidence !== "object") {
      ambiguities.push({ existingId: (ex && ex.id) || null, code: "existing_entry_unreadable" });
      continue;
    }
    const live = RECONCILE_LIVE_STATUSES.includes(ex.status);
    const old = ex.evidence;
    const sameDomain = old.domain === evidence.domain;

    // Exact byte-identity replay — recognized against live AND historical rows.
    if (sameDomain && evidence.checksum && old.checksum && evidence.checksum === old.checksum) {
      duplicates.push({ existingId: ex.id, reason: "checksum_match", live });
      continue;
    }

    if (sameDomain && live) {
      // A corrected re-import of the same logical source: supersede, never edit.
      // v62.6 — only when the replacement itself is readable enough to compare;
      // an unreadable correction routes to review instead of replacing anything.
      if (evidence.importId && old.importId && evidence.importId === old.importId && evidence.checksum !== old.checksum) {
        if (comparableCore(evidence)) supersedes.push({ existingId: ex.id, reason: "same_import_corrected" });
        else ambiguities.push({ existingId: ex.id, code: "replacement_not_comparable" });
        continue;
      }
      if (periodsEqual(evidence, old) && evidence.sourceType && evidence.sourceType === old.sourceType) {
        if (evidence.currency && old.currency && evidence.currency !== old.currency) {
          contradictions.push({
            existingId: ex.id,
            code: "currency_mismatch",
            detail: `${old.currency} vs ${evidence.currency} for the same period and source`,
          });
          continue;
        }
        // v62.6 — POSITIVE COMPARABILITY required before an empty delta set may
        // mean "same figures": both sides must expose the full comparable core.
        const mineCore = comparableCore(evidence);
        const theirsCore = comparableCore(old);
        if (!mineCore || !theirsCore) {
          ambiguities.push({ existingId: ex.id, code: "insufficient_comparable_evidence" });
          continue;
        }
        const deltas = evidence.domain === "accounting" ? rcSharedMetricDeltas(mineCore, theirsCore) : rcSharedMetricDeltas(evidence.metrics, old.metrics);
        if (deltas.length === 0) {
          supersedes.push({ existingId: ex.id, reason: "same_period_re_export" });
        } else {
          const worst = deltas.reduce((m, d) => (d.deltaPct > m.deltaPct ? d : m), deltas[0]);
          contradictions.push({
            existingId: ex.id,
            code: "same_period_metric_mismatch",
            detail: `${worst.field}: ${worst.b} vs ${worst.a}`,
            deltaPct: worst.deltaPct,
          });
        }
        continue;
      }
      if (periodsOverlap(evidence, old) && evidence.sourceType && evidence.sourceType === old.sourceType && !periodsEqual(evidence, old)) {
        // A partial overlap cannot be resolved deterministically — review it.
        ambiguities.push({ existingId: ex.id, code: "overlapping_period_ambiguous" });
        continue;
      }
    }

    // Cross-domain check: commerce gross vs payments gross for the same period.
    if (!sameDomain && live && GROSS_FIELD_BY_DOMAIN[evidence.domain] && GROSS_FIELD_BY_DOMAIN[old.domain]) {
      if (periodsEqual(evidence, old)) {
        if (evidence.currency && old.currency && evidence.currency !== old.currency) {
          ambiguities.push({ existingId: ex.id, code: "cross_domain_currency_mismatch" });
          continue;
        }
        const mine = (evidence.metrics || {})[GROSS_FIELD_BY_DOMAIN[evidence.domain]];
        const theirs = (old.metrics || {})[GROSS_FIELD_BY_DOMAIN[old.domain]];
        if (typeof mine === "number" && typeof theirs === "number") {
          const deltaPct = Math.round(relativeDeltaPct(mine, theirs) * 100) / 100;
          const withinTolerance = deltaPct <= tolerancePct;
          crossChecks.push({ existingId: ex.id, deltaPct, withinTolerance });
          if (!withinTolerance) {
            contradictions.push({
              existingId: ex.id,
              code: "commerce_vs_payments_delta_exceeded",
              detail: `gross delta ${deltaPct}% exceeds tolerance ${tolerancePct}%`,
              deltaPct,
            });
          }
        }
      }
    }
  }

  return deepFreeze({
    reconcileVersion: ECL_RECONCILE_VERSION,
    duplicates,
    supersedes,
    contradictions,
    crossChecks,
    ambiguities,
  });
}