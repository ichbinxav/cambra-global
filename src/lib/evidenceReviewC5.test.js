// DASHBOARD-C5 (2026-08-17) — evidence review and opportunity decisions.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyDecision, checkDecision, DECISIONS_REQUIRING_REASON, DECISION_TARGET,
  OPPORTUNITY_DECISIONS, previewDecision, readEvidenceFor, TERMINAL_OPPORTUNITY_STATUSES,
} from "../../base44/shared/evidenceReviewCore.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      get rows() { return stores[name]; },
      async get(id) { if (broken.includes(name)) throw new Error("down"); const r = stores[name].find((x) => String(x.id) === String(id)); return r ? { ...r } : null; },
      async filter(q) { if (broken.includes(name)) throw new Error("down"); return stores[name].filter((r) => Object.entries(q).every(([k, v]) => String(r[k]) === String(v))).map((r) => ({ ...r })); },
      async create(v) { const r = { id: `${name}-${stores[name].length + 1}`, ...v }; stores[name].push(r); return { ...r }; },
      async updateMany(q, patch) {
        const m = stores[name].filter((r) => Object.entries(q).every(([k, v]) => String(r[k]) === String(v)));
        for (const r of m) Object.assign(r, patch);
        return { matched_count: m.length, modified_count: m.length };
      },
    };
    return built[name];
  };
  return { stores, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const READY = {
  id: "o1", opportunity_key: "k1", status: "QUALIFIED", evidence_completeness: "COMPLETE",
  merchant_context_reference: "brand-1", expected_recoverable_savings_minor: 200000,
  blockers: [], evidence_references: ["e1"],
};

describe("C5 — a decision is validated against real state", () => {
  it("allows qualifying a candidate", () => {
    expect(checkDecision({ decision: "QUALIFY", opportunity: { status: "CANDIDATE" } }).allowed).toBe(true);
  });

  it("refuses a decision on a settled opportunity", () => {
    for (const status of TERMINAL_OPPORTUNITY_STATUSES) {
      const out = checkDecision({ decision: "QUALIFY", opportunity: { status } });
      expect(out.allowed, status).toBe(false);
      expect(out.blockers.some((b) => b.startsWith("opportunity_already_settled"))).toBe(true);
    }
  });

  it("requires a reason for every refusing decision", () => {
    for (const decision of DECISIONS_REQUIRING_REASON) {
      expect(checkDecision({ decision, opportunity: { status: "CANDIDATE" } }).blockers, decision)
        .toContain("reason_code_required");
      expect(checkDecision({ decision, opportunity: { status: "CANDIDATE" }, reason_code: "no_budget" }).allowed, decision)
        .toBe(true);
    }
  });

  it("refuses an unknown decision", () => {
    expect(checkDecision({ decision: "APPROVE_EVERYTHING", opportunity: { status: "CANDIDATE" } }).blockers)
      .toContain("unknown_decision");
  });

  it("reports an unreadable status rather than assuming a default", () => {
    expect(checkDecision({ decision: "QUALIFY", opportunity: {} }).blockers)
      .toContain("opportunity_status_unreadable");
  });

  it("maps every decision to a target status", () => {
    for (const decision of OPPORTUNITY_DECISIONS) expect(DECISION_TARGET[decision], decision).toBeTruthy();
  });
});

describe("C5 — approving for Recover reuses the read-side rules", () => {
  it("allows a fully evidenced opportunity", () => {
    expect(checkDecision({ decision: "APPROVE_FOR_RECOVER", opportunity: READY }).allowed).toBe(true);
  });

  it("refuses when evidence completeness is not recorded", () => {
    const out = checkDecision({ decision: "APPROVE_FOR_RECOVER", opportunity: { ...READY, evidence_completeness: "" } });
    expect(out.allowed).toBe(false);
    expect(out.blockers).toContain("recover_evidence_completeness_unknown");
  });

  it("refuses when expected recoverable savings are unknown", () => {
    expect(checkDecision({ decision: "APPROVE_FOR_RECOVER", opportunity: { ...READY, expected_recoverable_savings_minor: null } }).blockers)
      .toContain("recover_expected_recoverable_savings_unknown");
  });

  it("refuses when the opportunity declares blockers", () => {
    expect(checkDecision({ decision: "APPROVE_FOR_RECOVER", opportunity: { ...READY, blockers: ["awaiting_statement"] } }).blockers)
      .toContain("recover_opportunity_declares_blockers");
  });
});

describe("C5 — a decision is hash-bound and changes nothing until applied", () => {
  it("previews without moving the status", async () => {
    const svc = makeSvc({ MerchantOpportunity: [READY] });
    const out = await previewDecision({ svc, opportunity_id: "o1", decision: "APPROVE_FOR_RECOVER", sha256 });
    expect(out.ok).toBe(true);
    expect(out.preview.to_status).toBe("APPROVED_FOR_RECOVER");
    expect(out.preview.creates_recover_case).toBe(false);
    expect(out.preview.claim_boundary).toContain("does not verify them");
    expect(svc.stores.MerchantOpportunity[0].status).toBe("QUALIFIED");
  });

  it("applies exactly what was previewed", async () => {
    const svc = makeSvc({ MerchantOpportunity: [READY] });
    const p = await previewDecision({ svc, opportunity_id: "o1", decision: "APPROVE_FOR_RECOVER", sha256 });
    const out = await applyDecision({
      svc, reviewer: "founder@cambra.global", opportunity_id: "o1",
      decision: "APPROVE_FOR_RECOVER", expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    expect(svc.stores.MerchantOpportunity[0].status).toBe("APPROVED_FOR_RECOVER");
    // Approving changes a status. It does not open a Recover case.
    expect(out.creates_recover_case).toBe(false);
    expect(svc.stores.DealActivation).toBeUndefined();
  });

  it("refuses when the row moved between preview and apply", async () => {
    const svc = makeSvc({ MerchantOpportunity: [READY] });
    const p = await previewDecision({ svc, opportunity_id: "o1", decision: "QUALIFY", sha256 });
    svc.stores.MerchantOpportunity[0].status = "DEFERRED";
    const out = await applyDecision({
      svc, reviewer: "f", opportunity_id: "o1", decision: "QUALIFY",
      expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("preview_hash_mismatch");
  });

  it("opens a review case for a refusing decision", async () => {
    const svc = makeSvc({ MerchantOpportunity: [{ ...READY, status: "CANDIDATE" }] });
    const p = await previewDecision({ svc, opportunity_id: "o1", decision: "REJECT", reason_code: "no_saving", sha256 });
    const out = await applyDecision({
      svc, reviewer: "f", opportunity_id: "o1", decision: "REJECT", reason_code: "no_saving",
      expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.review_case_recorded).toBe(true);
    const rc = svc.stores.ReviewCase[0];
    expect(rc.brand_id).toBe("brand-1");
    expect(rc.reason_code).toBe("no_saving");
    // Money at stake means ECONOMIC severity, which must not be triaged as QUALITY.
    expect(rc.severity).toBe("ECONOMIC");
  });

  it("refuses to invent a brand_id when the merchant reference is absent", async () => {
    const svc = makeSvc({ MerchantOpportunity: [{ ...READY, status: "CANDIDATE", merchant_context_reference: "" }] });
    const p = await previewDecision({ svc, opportunity_id: "o1", decision: "REJECT", reason_code: "x", sha256 });
    expect(p.preview.review_case_brand_id).toBeNull();
    const out = await applyDecision({
      svc, reviewer: "f", opportunity_id: "o1", decision: "REJECT", reason_code: "x",
      expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    // The decision took effect; the paperwork could not. Writing the opportunity
    // key into brand_id would put a wrong identifier into the review ledger.
    expect(out.ok).toBe(true);
    expect(out.review_case_recorded).toBe(false);
    expect(svc.stores.ReviewCase).toBeUndefined();
  });

  it("reports a real decision whose review case failed to persist", async () => {
    const svc = makeSvc({ MerchantOpportunity: [{ ...READY, status: "CANDIDATE" }] });
    const p = await previewDecision({ svc, opportunity_id: "o1", decision: "DEFER", reason_code: "later", sha256 });
    svc.entities.ReviewCase.create = async () => { throw new Error("store down"); };
    const out = await applyDecision({
      svc, reviewer: "f", opportunity_id: "o1", decision: "DEFER", reason_code: "later",
      expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.review_case_recorded).toBe(false);
    expect(svc.stores.MerchantOpportunity[0].status).toBe("DEFERRED");
  });

  it("reports an unreadable opportunity rather than assuming absence", async () => {
    const out = await previewDecision({
      svc: makeSvc({ MerchantOpportunity: [READY] }, ["MerchantOpportunity"]),
      opportunity_id: "o1", decision: "QUALIFY", sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("opportunity_unreadable");
  });
});

describe("C5 — evidence that cannot be read is unknown, not absent", () => {
  it("reports UNKNOWN when the assertion store fails", async () => {
    const out = await readEvidenceFor({
      svc: makeSvc({ EvidenceAssertion: [] }, ["EvidenceAssertion"]), opportunity: READY,
    });
    expect(out.readable).toBe(false);
    expect(out.evidence_state).toBe("UNKNOWN");
    expect(out.claim_boundary).toContain("unknown, not absent");
  });

  it("reports ABSENT when the store is readable and empty", async () => {
    const out = await readEvidenceFor({ svc: makeSvc({ EvidenceAssertion: [] }), opportunity: READY });
    expect(out.readable).toBe(true);
    expect(out.evidence_state).toBe("ABSENT");
  });

  it("surfaces a contradiction instead of preferring the newer row", async () => {
    const svc = makeSvc({
      EvidenceAssertion: [
        { id: "a1", subject_id: "o1", assertion_key: "k1", predicate: "rate", assertion_status: "SUPPORTS", verification_status: "VERIFIED" },
        { id: "a2", subject_id: "o1", assertion_key: "k2", predicate: "rate", assertion_status: "CONTRADICTS", verification_status: "VERIFIED" },
      ],
    });
    const out = await readEvidenceFor({ svc, opportunity: READY });
    expect(out.evidence_state).toBe("CONFLICTED");
    expect(out.contradicting_count).toBe(1);
    expect(out.claim_boundary).toContain("not resolved by preferring the newer row");
  });
});
