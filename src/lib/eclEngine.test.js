// v62.5 — ECL P3: engine tests — determinism, fail-closed routing, intents.
import { describe, it, expect } from "vitest";
import { runEclEngine, classifyConfidence, EclEngineError, ECL_ENGINE_VERSION } from "./eclEngine.js";
import { normalizePaymentsEvidence } from "./normalizedEvidence.js";
import { reconcileEvidence } from "./eclReconcile.js";
import { ECL_POLICY } from "./generated/eclPolicy.js";

const NOW = "2026-08-07T12:00:00.000Z";

const paymentsEvidence = (over = {}) =>
  normalizePaymentsEvidence({
    evidenceType: "statement_csv",
    sourceType: "provider_statement",
    checksum: "chk-1",
    importId: "imp-1",
    parserVersion: "p1",
    currency: "EUR",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    grossAmountMinor: 1000000,
    feesAmountMinor: 15000,
    feeRateBps: 150,
    ...over,
  });

const baseInput = (over = {}) => ({
  identity: { evidenceEntityType: "statement_import", evidenceId: "si-1", brandId: "brand-1", ownerEmail: "m@x.com" },
  evidence: paymentsEvidence(),
  existing: [],
  state: { status: "pending" },
  strikes: [],
  context: { now: NOW, hasAttestation: false, baselineLocked: false, hasBlockingReviewCase: false },
  actor: "system",
  ...over,
});

describe("input doctrine (fail-closed, injected clock)", () => {
  it("refuses a missing clock, missing context facts, or missing identity", () => {
    expect(() => runEclEngine(baseInput({ context: { hasAttestation: false, baselineLocked: false, hasBlockingReviewCase: false } }), ECL_POLICY)).toThrow(/injected/);
    expect(() => runEclEngine(baseInput({ context: { now: NOW, baselineLocked: false, hasBlockingReviewCase: false } }), ECL_POLICY)).toThrow(EclEngineError);
    expect(() => runEclEngine(baseInput({ identity: { evidenceEntityType: "statement_import" } }), ECL_POLICY)).toThrow(EclEngineError);
  });
});

describe("happy path — independent document", () => {
  it("verifies, emits one pending→verified event intent, and is fully traceable", () => {
    const d = runEclEngine(baseInput(), ECL_POLICY);
    expect(d.engineVersion).toBe(ECL_ENGINE_VERSION);
    expect(d.outcome).toBe("verified");
    expect(d.confidenceResult.confidenceLevel).toBe("high");
    expect(d.confidenceResult.verificationMethod).toBe("independent_document");
    expect(d.transition.changed).toBe(true);
    expect(d.transition.record.to_status).toBe("verified");
    expect(d.reviewCaseIntents).toEqual([]);
    expect(d.strikeIntents).toEqual([]);
    expect(d.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.decisionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.confidenceResultHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(d)).toBe(true);
  });

  it("is DETERMINISTIC: same inputs → byte-identical hashes", () => {
    const a = runEclEngine(baseInput(), ECL_POLICY);
    const b = runEclEngine(baseInput(), ECL_POLICY);
    expect(a.inputsHash).toBe(b.inputsHash);
    expect(a.decisionHash).toBe(b.decisionHash);
    expect(a.correlationId).toBe(b.correlationId);
  });
});

describe("duplicate replay", () => {
  it("recognizes an exact checksum replay and produces ZERO intents", () => {
    const d = runEclEngine(
      baseInput({ existing: [{ id: "old", status: "verified", evidence: paymentsEvidence() }] }),
      ECL_POLICY,
    );
    expect(d.outcome).toBe("duplicate_replay");
    expect(d.duplicateOf).toEqual(["old"]);
    expect(d.transition).toBe(null);
    expect(d.reviewCaseIntents).toEqual([]);
    expect(d.strikeIntents).toEqual([]);
  });
});

describe("attested vs unattested manual declarations", () => {
  const manual = () => paymentsEvidence({ sourceType: "manual_declaration" });

  it("attested → medium → accepted_provisionally with the policy window", () => {
    const d = runEclEngine(baseInput({ evidence: manual(), context: { now: NOW, hasAttestation: true, baselineLocked: false, hasBlockingReviewCase: false } }), ECL_POLICY);
    expect(d.outcome).toBe("accepted_provisionally");
    expect(d.confidenceResult.verificationMethod).toBe("attested_only");
    expect(d.provisional.startedAt).toBe(NOW);
    expect(Date.parse(d.provisional.expiresAt) - Date.parse(NOW)).toBe(ECL_POLICY.windows.provisionalDays * 86400000);
  });

  it("unattested → none → low → estimated, never provisionally accepted", () => {
    const d = runEclEngine(baseInput({ evidence: manual() }), ECL_POLICY);
    expect(d.outcome).toBe("estimated");
    expect(d.confidenceResult.verificationMethod).toBe("none");
    expect(d.confidenceResult.confidenceLevel).toBe("low");
    expect(d.provisional).toBe(null);
  });
});

describe("contradictions — fail-closed", () => {
  const contradictingExisting = [{ id: "old", status: "verified", evidence: paymentsEvidence() }];
  const contradictingEvidence = () => paymentsEvidence({ checksum: "chk-2", importId: "imp-2", grossAmountMinor: 2000000, feesAmountMinor: 30000 });

  it("routes to under_review with an ECONOMIC review case and a scoped strike intent", () => {
    const d = runEclEngine(baseInput({ evidence: contradictingEvidence(), existing: contradictingExisting }), ECL_POLICY);
    expect(d.outcome).toBe("under_review");
    expect(d.transition.record.to_status).toBe("under_review");
    expect(d.confidenceResult.reviewRequired).toBe(true);
    const rc = d.reviewCaseIntents.find((r) => r.record.reason_code === "evidence_contradiction");
    expect(rc.record.severity).toBe("economic");
    expect(rc.record.status).toBe("open");
    expect(d.strikeIntents).toHaveLength(1);
    expect(d.strikeIntents[0].record.scope).toBe("payments");
  });

  it("hitting the strike threshold escalates with a dedicated review case", () => {
    const t = ECL_POLICY.strikes.threshold;
    const priorStrikes = Array.from({ length: t - 1 }, (_, k) => ({ scope: "payments", expires_at: "2027-01-01T00:00:00.000Z", idempotency_key: `k${k}` }));
    const d = runEclEngine(baseInput({ evidence: contradictingEvidence(), existing: contradictingExisting, strikes: priorStrikes }), ECL_POLICY);
    expect(d.reviewCaseIntents.some((r) => r.record.reason_code === "strike_threshold_reached:payments")).toBe(true);
  });
});

describe("supersession and terminal states", () => {
  it("a corrected re-import supersedes the old record via a legal transition intent", () => {
    const d = runEclEngine(
      baseInput({
        evidence: paymentsEvidence({ checksum: "chk-2" }),
        existing: [{ id: "old", status: "estimated", evidence: paymentsEvidence() }],
      }),
      ECL_POLICY,
    );
    expect(d.outcome).toBe("verified");
    expect(d.supersessions).toHaveLength(1);
    expect(d.supersessions[0].record.evidence_id).toBe("old");
    expect(d.supersessions[0].record.to_status).toBe("superseded");
  });

  it("a terminal (superseded) record never moves", () => {
    const d = runEclEngine(baseInput({ state: { status: "superseded" } }), ECL_POLICY);
    expect(d.transition.changed).toBe(false);
    expect(d.outcome).toBe("no_change");
  });
});

describe("provisional expiry at the injected instant", () => {
  it("a lapsed provisional window expires the evidence", () => {
    const started = "2026-01-01T00:00:00.000Z";
    const d = runEclEngine(
      baseInput({ state: { status: "accepted_provisionally", provisionalStartedAt: started } }),
      ECL_POLICY,
    );
    expect(d.outcome).toBe("expired");
    expect(d.transition.record.event).toBe("provisional_expired");
  });

  it("a provisional state with NO recoverable window is ambiguous → review", () => {
    const d = runEclEngine(baseInput({ state: { status: "accepted_provisionally" } }), ECL_POLICY);
    expect(d.outcome).toBe("under_review");
    expect(d.reviewCaseIntents.some((r) => r.record.reason_code === "provisional_window_unrecoverable")).toBe(true);
  });
});

describe("classifyConfidence rules", () => {
  const noRecon = (ev) => reconcileEvidence(ev, [], ECL_POLICY);

  it("flags incoherent declared fee rates (E-06) and caps confidence at low", () => {
    const ev = paymentsEvidence({ feeRateBps: 500 }); // implied is 150
    const c = classifyConfidence(ev, noRecon(ev), { hasAttestation: false });
    expect(c.failedRules.map((r) => r.id)).toContain("E-06_fee_rate_coherent");
    expect(c.confidenceLevel).toBe("low");
  });

  it("runs the plausibility rule ONLY with an injected reference and the policy multiple", () => {
    const ev = paymentsEvidence();
    const none = classifyConfidence(ev, noRecon(ev), { hasAttestation: false });
    expect(none.passedRules.concat(none.failedRules.map((r) => r.id))).not.toContain("E-07_fee_plausible");
    const withRef = classifyConfidence(ev, noRecon(ev), {
      hasAttestation: false,
      referenceFeeRateBps: 30,
      feeVsRateTableMaxMultiple: ECL_POLICY.plausibility.feeVsRateTableMaxMultiple,
    });
    expect(withRef.failedRules.map((r) => r.id)).toContain("E-07_fee_plausible");
    expect(() => classifyConfidence(ev, noRecon(ev), { hasAttestation: false, referenceFeeRateBps: 30 })).toThrow(/policy/);
  });

  it("evidence with nothing readable is unknown → the engine routes it to review", () => {
    const ev = normalizePaymentsEvidence({ sourceType: "provider_statement" });
    const d = runEclEngine(baseInput({ evidence: ev }), ECL_POLICY);
    expect(d.outcome).toBe("under_review");
    expect(d.confidenceResult.confidenceLevel).toBe("unknown");
    expect(d.reviewCaseIntents.some((r) => r.record.reason_code === "evidence_unreadable")).toBe(true);
  });
});