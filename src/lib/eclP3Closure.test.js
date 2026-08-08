// v62.6 — ECL P3 CLOSURE regression matrix.
//
// Covers the full closure invariants of the P3 lifecycle engine:
//   · inputsHash covers COMPLETE sibling envelopes (period, currency,
//     sourceType, importId, every metric),
//   · confidence_result_hash hashes EXACTLY the persisted snapshot,
//   · SavingsEvidence lifecycle + supersession persist/restore round-trips,
//   · the provisional window starts ONCE and is never renewed by replay,
//   · E-08 provenance fail-closed rule,
//   · positive comparability before any supersession,
//   · owner-only attestation / admin-only processing (handler source contract),
//   · SERVER-RESOLVED attestation evidence binding (v62.6 closure fix),
//   · expanded attestation idempotency identity,
//   · replay-safe createOnce semantics with NO exactly-once claim.
//
// Handler-level behavior (auth, checksum resolution wiring, createOnce) is
// verified as SOURCE CONTRACTS on the deployed entry.ts — the repo's
// established pattern (productionFunctions.static.test.js) — because the Deno
// handler cannot be imported into vitest and Base44 database uniqueness must
// never be faked with an in-memory stand-in.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  runEclEngine,
  classifyConfidence,
  buildPersistedEvidenceSnapshot,
  restoreLifecycleFromSnapshot,
  markSnapshotSuperseded,
} from "./eclEngine.js";
import { buildAttestationIntent, resolveAttestationChecksum } from "./eclLifecycle.js";
import { reconcileEvidence, comparableCore } from "./eclReconcile.js";
import { normalizePaymentsEvidence } from "./normalizedEvidence.js";
import { sha256Hex, stableSerialize } from "./eclSerialize.js";
import { ECL_POLICY } from "./generated/eclPolicy.js";

const NOW = "2026-08-07T12:00:00.000Z";
const DAY_MS = 86400000;
const WINDOW_MS = ECL_POLICY.windows.provisionalDays * DAY_MS;

const paymentsEvidence = (over = {}) => {
  const raw = {
    evidenceType: "statement_csv",
    sourceType: "provider_statement",
    checksum: "chk-new",
    importId: "imp-new",
    parserVersion: "p1",
    currency: "EUR",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    grossAmountMinor: 1000000,
    feesAmountMinor: 15000,
    feeRateBps: 150,
    ...over,
  };
  for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];
  return normalizePaymentsEvidence(raw);
};

const siblingEvidence = (over = {}) =>
  paymentsEvidence({ checksum: "chk-sib", importId: "imp-sib", periodStart: "2026-06-01", periodEnd: "2026-06-30", ...over });

const baseInput = (over = {}) => ({
  identity: { evidenceEntityType: "savings_evidence", evidenceId: "se-1", brandId: "brand-1", ownerEmail: "m@x.com" },
  evidence: paymentsEvidence(),
  existing: [],
  state: { status: "pending" },
  strikes: [],
  context: { now: NOW, hasAttestation: false, baselineLocked: false, hasBlockingReviewCase: false },
  actor: "system",
  ...over,
});

const hashWithSibling = (sibOver = {}) =>
  runEclEngine(baseInput({ existing: [{ id: "sib-1", status: "verified", evidence: siblingEvidence(sibOver) }] }), ECL_POLICY).inputsHash;

// ── 1-5. inputsHash covers COMPLETE sibling envelopes ─────────────────────
describe("inputsHash — complete sibling envelopes", () => {
  const base = hashWithSibling();

  it("is deterministic for identical sibling envelopes", () => {
    expect(hashWithSibling()).toBe(base);
  });
  it("changes when a sibling period changes", () => {
    expect(hashWithSibling({ periodStart: "2026-06-02" })).not.toBe(base);
    expect(hashWithSibling({ periodEnd: "2026-06-29" })).not.toBe(base);
  });
  it("changes when sibling currency changes", () => {
    expect(hashWithSibling({ currency: "USD" })).not.toBe(base);
  });
  it("changes when sibling sourceType changes", () => {
    expect(hashWithSibling({ sourceType: "bank_statement" })).not.toBe(base);
  });
  it("changes when sibling importId changes", () => {
    expect(hashWithSibling({ importId: "imp-sib-2" })).not.toBe(base);
  });
  it("changes when an economically relevant sibling metric changes", () => {
    expect(hashWithSibling({ grossAmountMinor: 1000001 })).not.toBe(base);
    expect(hashWithSibling({ feesAmountMinor: 15001 })).not.toBe(base);
  });
});

// ── 6. persisted confidence_result_hash is the EXACT snapshot hash ────────
describe("persisted snapshot hash", () => {
  it("confidence_result_hash = sha256(stableSerialize(EXACT persisted snapshot))", () => {
    const ev = paymentsEvidence();
    const d = runEclEngine(baseInput({ evidence: ev }), ECL_POLICY);
    const lifecycle = { status: d.transition.toStatus, provisionalStartedAt: null, expiresAt: null, supersededById: null };
    const { snapshot, snapshotHash } = buildPersistedEvidenceSnapshot(d, ev, lifecycle);
    expect(snapshotHash).toBe(sha256Hex(stableSerialize(snapshot)));
    // The hash covers the WHOLE persisted object, never an inner sub-object.
    expect(snapshotHash).not.toBe(d.confidenceResultHash);
    expect(snapshot.inputsHash).toBe(d.inputsHash);
    expect(snapshot.lifecycle.status).toBe("verified");
  });
});

// ── 7-10. lifecycle persist → reload → process; provisional starts ONCE ───
describe("provisional window — persisted, restored, never renewed", () => {
  const attCtx = (now = NOW) => ({ now, hasAttestation: true, baselineLocked: false, hasBlockingReviewCase: false });
  const manual = () => paymentsEvidence({ sourceType: "manual_declaration" });

  it("SavingsEvidence lifecycle survives persist → reload → process (round-trip)", () => {
    const ev = manual();
    const d1 = runEclEngine(baseInput({ evidence: ev, context: attCtx() }), ECL_POLICY);
    expect(d1.outcome).toBe("accepted_provisionally");
    const lifecycle = { status: d1.transition.toStatus, provisionalStartedAt: d1.provisional.startedAt, expiresAt: d1.provisional.expiresAt, supersededById: null };
    const { snapshot } = buildPersistedEvidenceSnapshot(d1, ev, lifecycle);
    const restored = restoreLifecycleFromSnapshot(snapshot);
    expect(restored).toEqual({ status: "accepted_provisionally", provisionalStartedAt: NOW, expiresAt: d1.provisional.expiresAt, supersededById: null });
    const later = new Date(Date.parse(NOW) + DAY_MS).toISOString();
    const d2 = runEclEngine(baseInput({ evidence: ev, state: restored, context: attCtx(later) }), ECL_POLICY);
    expect(d2.outcome).toBe("no_change");
    expect(d2.provisional.startedAt).toBe(NOW);
    expect(d2.provisional.expiresAt).toBe(d1.provisional.expiresAt);
  });

  it("reprocessing keeps the ORIGINAL startedAt (never restarts the clock)", () => {
    const startedAt = "2026-08-06T00:00:00.000Z";
    const expiresAt = new Date(Date.parse(startedAt) + WINDOW_MS).toISOString();
    const d = runEclEngine(baseInput({ evidence: manual(), state: { status: "accepted_provisionally", provisionalStartedAt: startedAt, expiresAt }, context: attCtx() }), ECL_POLICY);
    expect(d.provisional.startedAt).toBe(startedAt);
  });

  it("reprocessing keeps the ORIGINAL expiresAt (never extends the window)", () => {
    const startedAt = "2026-08-06T00:00:00.000Z";
    const expiresAt = new Date(Date.parse(startedAt) + WINDOW_MS).toISOString();
    const d = runEclEngine(baseInput({ evidence: manual(), state: { status: "accepted_provisionally", provisionalStartedAt: startedAt, expiresAt }, context: attCtx() }), ECL_POLICY);
    expect(d.provisional.expiresAt).toBe(expiresAt);
  });

  it("expired provisional evidence can NEVER obtain a new window through replay", () => {
    const startedAt = "2026-01-01T00:00:00.000Z";
    const d1 = runEclEngine(baseInput({ evidence: manual(), state: { status: "accepted_provisionally", provisionalStartedAt: startedAt }, context: attCtx() }), ECL_POLICY);
    expect(d1.outcome).toBe("expired");
    expect(d1.provisional).toBe(null);
    // Replaying the (attested, medium) evidence against the EXPIRED state is an
    // illegal transition back to accepted_provisionally → review, no window.
    const d2 = runEclEngine(baseInput({ evidence: manual(), state: { status: "expired" }, context: attCtx() }), ECL_POLICY);
    expect(d2.outcome).toBe("under_review");
    expect(d2.provisional).toBe(null);
    expect(d2.reviewCaseIntents.some((r) => r.record.reason_code === "illegal_transition_requested")).toBe(true);
  });
});

// ── 11-12. supersession persistence + dead siblings ───────────────────────
describe("supersession — persisted and inert", () => {
  it("SavingsEvidence superseded lifecycle survives reload, hash recomputed", () => {
    const ev = paymentsEvidence();
    const d = runEclEngine(baseInput({ evidence: ev }), ECL_POLICY);
    const { snapshot } = buildPersistedEvidenceSnapshot(d, ev, { status: d.transition.toStatus, provisionalStartedAt: null, expiresAt: null, supersededById: null });
    const marked = markSnapshotSuperseded(snapshot, "se-new");
    expect(marked.snapshotHash).toBe(sha256Hex(stableSerialize(marked.snapshot)));
    const restored = restoreLifecycleFromSnapshot(marked.snapshot);
    expect(restored.status).toBe("superseded");
    expect(restored.supersededById).toBe("se-new");
    // Original snapshot is never mutated.
    expect(restoreLifecycleFromSnapshot(snapshot).status).toBe("verified");
  });

  it("a superseded sibling never competes as live evidence", () => {
    const sib = { id: "sib-1", status: "superseded", evidence: paymentsEvidence({ checksum: "chk-old", importId: "imp-old", grossAmountMinor: 999 }) };
    const d = runEclEngine(baseInput({ existing: [sib] }), ECL_POLICY);
    expect(d.outcome).toBe("verified");
    expect(d.reconciliation.contradictions).toEqual([]);
    expect(d.reconciliation.supersedes).toEqual([]);
    expect(d.supersessions).toEqual([]);
  });
});

// ── 13-15. E-08 provenance — fail closed ──────────────────────────────────
describe("E-08 provenance (independent documents must be auditable)", () => {
  const noRecon = (ev) => reconcileEvidence(ev, [], ECL_POLICY);

  it("independent_document without checksum fails E-08", () => {
    const ev = paymentsEvidence({ checksum: undefined });
    const c = classifyConfidence(ev, noRecon(ev), { hasAttestation: false });
    expect(c.failedRules.map((r) => r.id)).toContain("E-08_provenance_present");
    expect(c.confidenceLevel).toBe("low");
  });

  it("independent_document without importId fails E-08", () => {
    const ev = paymentsEvidence({ importId: undefined });
    const c = classifyConfidence(ev, noRecon(ev), { hasAttestation: false });
    expect(c.failedRules.map((r) => r.id)).toContain("E-08_provenance_present");
    expect(c.confidenceLevel).toBe("low");
  });

  it("a provenance failure can never produce high/verified", () => {
    const d = runEclEngine(baseInput({ evidence: paymentsEvidence({ checksum: undefined }) }), ECL_POLICY);
    expect(d.outcome).not.toBe("verified");
    expect(d.confidenceResult.confidenceLevel).toBe("low");
    expect(d.outcome).toBe("estimated");
  });
});

// ── 16-19. positive comparability before supersession ─────────────────────
describe("positive comparability — supersession requires comparable evidence", () => {
  it("an unreadable same-import replacement cannot supersede (→ review)", () => {
    const sib = { id: "sib-1", status: "verified", evidence: paymentsEvidence({ checksum: "chk-old" }) };
    const unreadable = paymentsEvidence({ checksum: "chk-fix", grossAmountMinor: undefined, feesAmountMinor: undefined, feeRateBps: undefined });
    expect(comparableCore(unreadable)).toBe(null);
    const d = runEclEngine(baseInput({ evidence: unreadable, existing: [sib] }), ECL_POLICY);
    expect(d.supersessions).toEqual([]);
    expect(d.reconciliation.ambiguities.some((a) => a.code === "replacement_not_comparable")).toBe(true);
    expect(d.outcome).toBe("under_review");
  });

  it("same-period evidence with insufficient comparable core cannot supersede", () => {
    const sib = { id: "sib-1", status: "estimated", evidence: paymentsEvidence({ checksum: "chk-old", importId: "imp-old" }) };
    const thin = paymentsEvidence({ checksum: "chk-thin", importId: "imp-thin", feesAmountMinor: undefined, feeRateBps: undefined });
    const r = reconcileEvidence(thin, [sib], ECL_POLICY);
    expect(r.supersedes).toEqual([]);
    expect(r.ambiguities.some((a) => a.code === "insufficient_comparable_evidence")).toBe(true);
  });

  it("a legitimate comparable replacement still supersedes", () => {
    const sib = { id: "sib-1", status: "estimated", evidence: paymentsEvidence({ checksum: "chk-old", importId: "imp-old" }) };
    const d = runEclEngine(baseInput({ evidence: paymentsEvidence({ checksum: "chk-re", importId: "imp-re" }), existing: [sib] }), ECL_POLICY);
    expect(d.supersessions).toHaveLength(1);
    expect(d.supersessions[0].record.evidence_id).toBe("sib-1");
    expect(d.reconciliation.supersedes[0].reason).toBe("same_period_re_export");
  });

  it("verified evidence is protected against an incomparable replacement", () => {
    const sib = { id: "sib-1", status: "verified", evidence: paymentsEvidence({ checksum: "chk-old", importId: "imp-old" }) };
    const thin = paymentsEvidence({ checksum: "chk-thin", importId: "imp-thin", grossAmountMinor: undefined });
    const d = runEclEngine(baseInput({ evidence: thin, existing: [sib] }), ECL_POLICY);
    expect(d.supersessions).toEqual([]);
    expect(d.outcome).toBe("under_review");
  });
});

// ── 20-25. handler source contracts (auth + server-resolved binding) ──────
describe("eclProcessEvidence handler contracts (source)", () => {
  const SRC = fs.readFileSync("base44/functions/eclProcessEvidence/entry.ts", "utf8");
  const PROCESS_MARKER = "action: process (ADMIN-ONLY)";
  const processSection = SRC.slice(SRC.indexOf(PROCESS_MARKER));

  it("attest is OWNER-ONLY", () => {
    expect(SRC).toMatch(/user\.email !== ownerEmail/);
    expect(SRC).toMatch(/only the evidence owner may attest/);
  });
  it("process remains ADMIN-ONLY", () => {
    expect(SRC.indexOf(PROCESS_MARKER)).toBeGreaterThan(-1);
    expect(processSection).toMatch(/user\.role !== 'admin'/);
  });
  it("the processing admin is never written as attestor", () => {
    expect(SRC).toMatch(/attestorUserId: user\.id/);
    expect(processSection).not.toContain("buildAttestationIntent");
    expect(processSection).not.toContain("attestor_user_id");
  });
  it("attestation checksum is SERVER-RESOLVED only (no client fallback)", () => {
    expect(SRC).toMatch(/resolveAttestationChecksum\(record\.checksum, payload\.evidenceChecksum\)/);
    expect(SRC).toMatch(/evidenceChecksum: checksumResolution\.checksum/);
    expect(SRC).not.toMatch(/serverChecksum\s*\|\|\s*payload\.evidenceChecksum/);
    expect(SRC).not.toMatch(/evidenceChecksum:\s*payload\.evidenceChecksum/);
  });
  it("checksum resolution failure is returned before any intent is built", () => {
    expect(SRC.indexOf("resolveAttestationChecksum(")).toBeLessThan(SRC.indexOf("buildAttestationIntent({"));
    expect(SRC).toMatch(/checksumResolution\.ok !== true/);
    expect(SRC).toMatch(/status: checksumResolution\.status/);
  });
});

describe("resolveAttestationChecksum — server-resolved evidence binding", () => {
  it("A. stored checksum + matching payload → accepted with the stored checksum", () => {
    const r = resolveAttestationChecksum("abc", "abc");
    expect(r.ok).toBe(true);
    expect(r.checksum).toBe("abc");
  });
  it("B. stored checksum + mismatching payload → 409, never recorded", () => {
    const r = resolveAttestationChecksum("abc", "zzz");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.code).toBe("attestation_checksum_mismatch");
    expect(r.checksum).toBe(null);
  });
  it("C. stored checksum + omitted payload checksum → accepted using stored checksum", () => {
    expect(resolveAttestationChecksum("abc", undefined).checksum).toBe("abc");
    expect(resolveAttestationChecksum("abc", null).checksum).toBe("abc");
    expect(resolveAttestationChecksum("abc", "").checksum).toBe("abc");
  });
  it("D. no stored checksum → fails CLOSED; a client checksum is NEVER trusted", () => {
    for (const claimed of [undefined, null, "", "zzz"]) {
      const r = resolveAttestationChecksum(null, claimed);
      expect(r.ok).toBe(false);
      expect(r.status).toBe(422);
      expect(r.code).toBe("attestation_checksum_unresolvable");
      expect(r.checksum).toBe(null);
    }
    expect(resolveAttestationChecksum("", "zzz").ok).toBe(false);
  });
});

// ── 26-32. expanded attestation idempotency identity ──────────────────────
describe("attestation idempotency identity", () => {
  const attBase = (over = {}) => ({
    attestorUserId: "u1",
    brandId: "b1",
    ownerEmail: "m@x.com",
    evidenceEntityType: "statement_import",
    evidenceId: "si-1",
    declaredMetrics: { grossAmountMinor: 1000 },
    legalTextVersion: "v1",
    legalText: "I declare these figures true.",
    language: "en",
    declaredSource: "provider dashboard",
    declaredPeriodStart: "2026-07-01",
    declaredPeriodEnd: "2026-07-31",
    evidenceChecksum: "chk-1",
    ...over,
  });
  const key = (over) => buildAttestationIntent(attBase(over)).idempotencyKey;
  const base = key({});

  it("is deterministic for identical declarations", () => {
    expect(key({})).toBe(base);
  });
  it("changes with legalTextVersion", () => expect(key({ legalTextVersion: "v2" })).not.toBe(base));
  it("changes with the legal text itself", () => expect(key({ legalText: "I declare these figures true!" })).not.toBe(base));
  it("changes with language", () => expect(key({ language: "fr" })).not.toBe(base));
  it("changes with declaredMetrics", () => expect(key({ declaredMetrics: { grossAmountMinor: 2000 } })).not.toBe(base));
  it("changes with declaredSource", () => expect(key({ declaredSource: "accountant export" })).not.toBe(base));
  it("changes with declaredPeriodStart/End", () => {
    expect(key({ declaredPeriodStart: "2026-07-02" })).not.toBe(base);
    expect(key({ declaredPeriodEnd: "2026-07-30" })).not.toBe(base);
  });
  it("changes with evidenceChecksum", () => expect(key({ evidenceChecksum: "chk-2" })).not.toBe(base));
});

// ── 33-34. createOnce — replay-safe, explicitly NOT exactly-once ──────────
describe("createOnce concurrency contract (handler source)", () => {
  const SRC = fs.readFileSync("base44/functions/eclProcessEvidence/entry.ts", "utf8");

  it("sequential replay finds the persisted claim and never creates a second logical claim", () => {
    // Pre-read on the persisted idempotency key returns the existing row…
    expect(SRC).toMatch(/filter\(\{ idempotency_key: idempotencyKey \}, 'created_date', 1\)/);
    expect(SRC).toMatch(/return \{ created: false, id: existing\[0\]\.id \}/);
    // …and the post-create re-read collapses concurrent losers to the OLDEST row.
    expect(SRC).toMatch(/filter\(\{ idempotency_key: idempotencyKey \}, 'created_date', 5\)/);
    expect(SRC).toMatch(/delete\(row\.id\)/);
  });

  it("the contract remains explicitly non-transactional / not exactly-once", () => {
    expect(SRC).toContain("NOT database-enforced exactly-once");
    expect(SRC).toMatch(/replay-safe/);
    expect(SRC).toMatch(/Do not describe this anywhere as transactional/);
  });
});