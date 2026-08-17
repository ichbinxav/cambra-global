// COMMAND-C3 (2026-08-17) — a model that cites something it was never given must
// be caught, and a claim with no citation must not pass as backed.
import { describe, expect, it } from "vitest";
import {
  briefEpistemicCeiling,
  citableRefsFromEvidence,
  citationRef,
  guardBriefCitations,
  judgeClaim,
} from "../../base44/shared/commandCitationGuard.ts";
import {
  epistemicStateForRead,
  epistemicStateForReads,
} from "../../base44/shared/runtimeSourceRead.ts";
import {
  resolveSourceRefs,
  stateForCitations,
} from "../../base44/shared/commandReceiptLedger.ts";

const EVIDENCE = {
  generated_at: "2026-08-17T12:00:00.000Z",
  metrics: { collected_revenue: { value: 100 }, company_health: { value: 80 } },
  attention: [
    { id: "approval:a1", approval_id: "a1", related_entity_type: "Brand", related_entity_id: "b1" },
    { id: "incident:i1", related_entity_type: "AutonomyIncident", related_entity_id: "i1" },
  ],
  opportunities: [{ evidence: [{ entity: "AggregatePool", id: "p1" }] }],
  risks: [{ evidence: [{ entity: "MigrationTask", id: "m1" }] }],
  upcoming_founder_meetings: [{ thread_id: "t1" }],
};

describe("C3 — the citable set is exactly what the model was shown", () => {
  it("collects refs from attention, opportunities, risks, metrics and meetings", () => {
    const citable = citableRefsFromEvidence(EVIDENCE);
    for (const ref of [
      "approval:a1", "Approval:a1", "Brand:b1", "incident:i1", "AutonomyIncident:i1",
      "AggregatePool:p1", "MigrationTask:m1", "metric:collected_revenue", "CommunicationThread:t1",
    ]) expect(citable.has(ref), ref).toBe(true);
  });

  it("does not include something that was never in the evidence", () => {
    expect(citableRefsFromEvidence(EVIDENCE).has("Invoice:i-999")).toBe(false);
  });

  it("survives a malformed or empty evidence object without inventing refs", () => {
    expect(citableRefsFromEvidence(null).size).toBe(0);
    expect(citableRefsFromEvidence({ attention: "not-an-array" }).size).toBe(0);
  });

  it("refuses to build a ref from a half-missing pair", () => {
    expect(citationRef("Brand", "")).toBe("");
    expect(citationRef("", "b1")).toBe("");
    expect(citationRef("Brand", "b1")).toBe("Brand:b1");
  });
});

describe("C3 — a fabricated citation is caught", () => {
  const citable = citableRefsFromEvidence(EVIDENCE);

  it("marks a claim CONFLICTED when it cites something it was not given", () => {
    const verdict = judgeClaim("Revenue rose", ["Invoice:i-999"], citable);
    expect(verdict.epistemic_state).toBe("CONFLICTED");
    expect(verdict.unresolved).toEqual(["Invoice:i-999"]);
    expect(verdict.resolved).toEqual([]);
  });

  it("marks a well-cited claim DERIVED — never OBSERVED", () => {
    const verdict = judgeClaim("An approval is pending", ["Approval:a1"], citable);
    expect(verdict.epistemic_state).toBe("DERIVED");
    expect(verdict.resolved).toEqual(["Approval:a1"]);
  });

  it("marks an uncited claim UNVERIFIED rather than treating silence as agreement", () => {
    expect(judgeClaim("Things look fine", [], citable).epistemic_state).toBe("UNVERIFIED");
    expect(judgeClaim("Things look fine", undefined, citable).epistemic_state).toBe("UNVERIFIED");
  });

  it("catches a partially fabricated citation list", () => {
    const verdict = judgeClaim("Two things", ["Approval:a1", "Invoice:i-999"], citable);
    expect(verdict.epistemic_state).toBe("CONFLICTED");
    expect(verdict.resolved).toEqual(["Approval:a1"]);
    expect(verdict.unresolved).toEqual(["Invoice:i-999"]);
  });
});

describe("C3 — the whole brief is audited, and bad claims are annotated not deleted", () => {
  const BRIEF = {
    headline: "Attention needed",
    changed_since_last_view: [
      { text: "An approval is pending", evidence_refs: ["Approval:a1"] },
      { text: "Revenue rose 20%", evidence_refs: ["Invoice:i-999"] },
    ],
    founder_actions: [
      { title: "Review the pool", why: "…", evidence_refs: ["AggregatePool:p1"] },
      { title: "Trust me on this", why: "…", evidence_refs: [] },
    ],
  };

  it("reports exactly which refs were fabricated", () => {
    const { citation_audit } = guardBriefCitations(BRIEF, EVIDENCE);
    expect(citation_audit.claims_checked).toBe(4);
    expect(citation_audit.claims_backed).toBe(2);
    expect(citation_audit.claims_with_unresolved_refs).toBe(1);
    expect(citation_audit.claims_uncited).toBe(1);
    expect(citation_audit.unresolved_refs).toEqual(["Invoice:i-999"]);
    expect(citation_audit.all_claims_backed).toBe(false);
  });

  it("keeps the badly-cited claim in the brief, annotated", () => {
    const { brief } = guardBriefCitations(BRIEF, EVIDENCE);
    const fabricated = brief.changed_since_last_view.find((row) => row.text === "Revenue rose 20%");
    // Not deleted — silently dropping it would hide that the model invented a ref.
    expect(fabricated).toBeTruthy();
    expect(fabricated.epistemic_state).toBe("CONFLICTED");
    expect(fabricated.unresolved_evidence_refs).toEqual(["Invoice:i-999"]);
  });

  it("passes a fully-backed brief", () => {
    const clean = {
      changed_since_last_view: [{ text: "An approval is pending", evidence_refs: ["Approval:a1"] }],
      founder_actions: [{ title: "Review the pool", evidence_refs: ["AggregatePool:p1"] }],
    };
    const { citation_audit } = guardBriefCitations(clean, EVIDENCE);
    expect(citation_audit.all_claims_backed).toBe(true);
    expect(citation_audit.claims_with_unresolved_refs).toBe(0);
  });

  it("does not call an empty brief 'backed'", () => {
    expect(guardBriefCitations({}, EVIDENCE).citation_audit.all_claims_backed).toBe(false);
  });

  it("caps the brief at UNKNOWN when the snapshot itself was degraded", () => {
    expect(briefEpistemicCeiling({ data_complete: false })).toBe("UNKNOWN");
    expect(briefEpistemicCeiling({ data_complete: true })).toBe("OBSERVED");
  });
});

describe("C3 — read status projects one way into the Command vocabulary", () => {
  it("maps the three read statuses without ever upgrading", () => {
    expect(epistemicStateForRead({ status: "COMPLETE" })).toBe("OBSERVED");
    expect(epistemicStateForRead({ status: "INCOMPLETE" })).toBe("DERIVED");
    expect(epistemicStateForRead({ status: "UNAVAILABLE" })).toBe("UNKNOWN");
  });

  it("treats an absent or unrecognised status as UNKNOWN, never optimistically", () => {
    expect(epistemicStateForRead(null)).toBe("UNKNOWN");
    expect(epistemicStateForRead({})).toBe("UNKNOWN");
    expect(epistemicStateForRead({ status: "PROBABLY_FINE" })).toBe("UNKNOWN");
  });

  it("folds several reads to the weakest", () => {
    expect(epistemicStateForReads([{ status: "COMPLETE" }, { status: "COMPLETE" }])).toBe("OBSERVED");
    expect(epistemicStateForReads([{ status: "COMPLETE" }, { status: "INCOMPLETE" }])).toBe("DERIVED");
    expect(epistemicStateForReads([{ status: "COMPLETE" }, { status: "UNAVAILABLE" }])).toBe("UNKNOWN");
    // No inputs cannot be an observation of anything.
    expect(epistemicStateForReads([])).toBe("UNKNOWN");
  });
});

describe("C3 — the ledger resolves referents, not just strings", () => {
  const store = { CostUsageEvent: { "cost-1": { id: "cost-1" } } };
  const readRow = async (entity, id) => store[entity]?.[id] || null;

  it("accepts a ref that points at a row that exists", async () => {
    const result = await resolveSourceRefs(["CostUsageEvent:cost-1"], readRow);
    expect(result.ok).toBe(true);
    expect(result.resolved).toEqual(["CostUsageEvent:cost-1"]);
  });

  it("catches a well-formed ref whose row does not exist", async () => {
    const result = await resolveSourceRefs(["CostUsageEvent:nope"], readRow);
    expect(result.ok).toBe(false);
    expect(result.unresolved).toEqual([{ ref: "CostUsageEvent:nope", reason: "referent_not_found" }]);
    expect(result.reason).toBe("unresolved_source_refs");
  });

  it("rejects a malformed ref instead of skipping it", async () => {
    const result = await resolveSourceRefs(["no-separator", ":no-entity", "no-id:"], readRow);
    expect(result.unresolved).toHaveLength(3);
    expect(result.unresolved.every((row) => row.reason === "malformed_ref_expected_entity_colon_id")).toBe(true);
  });

  it("distinguishes an unreadable store from a missing row", async () => {
    const result = await resolveSourceRefs(["CostUsageEvent:cost-1"], async () => { throw new Error("down"); });
    expect(result.unresolved).toEqual([{ ref: "CostUsageEvent:cost-1", reason: "referent_unreadable" }]);
  });

  it("does not call an uncited receipt clean", async () => {
    const result = await resolveSourceRefs([], readRow);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_source_refs");
  });

  it("stateForCitations demotes but never promotes", () => {
    const clean = { ok: true, cited: 1, unresolved: [] };
    const broken = { ok: false, cited: 1, unresolved: [{}] };
    const none = { ok: false, cited: 0, unresolved: [] };

    // Perfect citations do not upgrade a weak claim.
    expect(stateForCitations("INFERRED", clean)).toBe("INFERRED");
    expect(stateForCitations("OBSERVED", clean)).toBe("OBSERVED");
    // A broken citation conflicts, whatever was proposed.
    expect(stateForCitations("OBSERVED", broken)).toBe("CONFLICTED");
    // Nothing cited cannot stay OBSERVED or DERIVED.
    expect(stateForCitations("OBSERVED", none)).toBe("UNVERIFIED");
    expect(stateForCitations("DERIVED", none)).toBe("UNVERIFIED");
    expect(stateForCitations("INFERRED", none)).toBe("INFERRED");
    // An unknown proposed state is never accepted.
    expect(stateForCitations("DEFINITELY_TRUE", clean)).toBe("UNKNOWN");
  });
});
