// DASHBOARD-C6 (2026-08-17) — Recover root, phases, and the open-case path.
//
// DealActivation IS the root. No new entity. The new work is the production
// creator it never had, and these tests cover the failure injection section 10.25
// requires: idempotency, eligibility, CAS, and post-effect ambiguity.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  billingEligibility, buildRecoverKpis, buildRecoverPortfolio, FORBIDDEN_ROOTS,
  openRecoverCase, phaseFor, previewOpenCase, projectRecoverCase,
  RECOVER_PHASES, RECOVER_ROOT_ENTITY, TERMINAL_PHASES,
} from "../../base44/shared/recoverCore.ts";
import { buildSourceHealth } from "../../base44/shared/workspaceContract.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      get rows() { return stores[name]; },
      async list() { if (broken.includes(name)) throw new Error("down"); return stores[name].map((r) => ({ ...r })); },
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

const APPROVED = {
  id: "o1", opportunity_key: "opp-1", status: "APPROVED_FOR_RECOVER",
  evidence_completeness: "COMPLETE", merchant_context_reference: "brand-1",
  expected_recoverable_savings_minor: 200000, blockers: [], evidence_references: ["e1"],
};

describe("C6 — the root is DealActivation and no new entity is created", () => {
  it("names the canonical root", () => {
    expect(RECOVER_ROOT_ENTITY).toBe("DealActivation");
  });

  it("forbids the three aggregates C0 ruled out", () => {
    expect([...FORBIDDEN_ROOTS]).toEqual(["RecoverCase", "RecoverAggregate", "RecoverStageEvent"]);
  });

  it("maps every DealActivation status to a phase", () => {
    for (const status of ["detected", "proposed", "activated", "awaiting_authorization", "authorized", "migrating", "live", "monetizing", "paused", "revoked", "closed"]) {
      expect(phaseFor(status), status).toBeTruthy();
      expect([...RECOVER_PHASES], status).toContain(phaseFor(status));
    }
  });

  it("maps revoked to BLOCKED, not COMPLETED", () => {
    expect(phaseFor("revoked")).toBe("BLOCKED");
    expect(phaseFor("closed")).toBe("COMPLETED");
  });

  it("returns null for an unmappable status rather than guessing", () => {
    expect(phaseFor("brand_new")).toBeNull();
    expect(projectRecoverCase({ id: "d1", status: "brand_new" }).attention_reasons).toContain("phase_unmappable");
  });
});

describe("C6 — billing eligibility defaults to ineligible", () => {
  const eligible = {
    status: "monetizing", active_mandate_id: "m1", realized_savings_yearly: 5000,
    payment_method_status: "ready", verification_access_status: "granted", economic_right_status: "active",
  };

  it("allows a fully qualified case", () => {
    expect(billingEligibility(eligible).eligible).toBe(true);
  });

  it("refuses when there is no verified figure", () => {
    // A case with nothing verified has not proven anything to bill for.
    expect(billingEligibility({ ...eligible, realized_savings_yearly: null }).blockers)
      .toContain("verified_savings_unknown");
  });

  it("refuses without an active mandate", () => {
    expect(billingEligibility({ ...eligible, active_mandate_id: "", recovery_mandate_id: "" }).blockers)
      .toContain("no_active_mandate");
  });

  it("refuses when verification access was revoked", () => {
    expect(billingEligibility({ ...eligible, verification_access_status: "revoked" }).blockers)
      .toContain("verification_access_revoked");
  });

  it("refuses when the economic right was cancelled", () => {
    expect(billingEligibility({ ...eligible, economic_right_status: "cancelled" }).blockers)
      .toContain("economic_right_cancelled");
  });

  it("refuses an empty row rather than defaulting through", () => {
    expect(billingEligibility({}).eligible).toBe(false);
  });
});

describe("C6 — projected and verified figures never merge", () => {
  it("keeps both, separately", () => {
    const row = projectRecoverCase({ id: "d1", status: "live", projected_savings_annual: 4000, realized_savings_yearly: 1500 });
    expect(row.expected_recoverable_savings_minor).toBe(400000);
    expect(row.verified_savings_minor).toBe(150000);
    expect(row.claim_boundary).toContain("verified figure governs");
  });

  it("says a projection-only case has no billable savings", () => {
    const row = projectRecoverCase({ id: "d1", status: "live", projected_savings_annual: 4000 });
    expect(row.verified_savings_minor).toBeNull();
    expect(row.claim_boundary).toContain("no billable savings");
    expect(row.attention_reasons).toContain("live_but_unverified");
  });

  it("never exposes a billable amount, only eligibility", () => {
    const row = projectRecoverCase({ id: "d1", status: "monetizing" });
    expect(row).not.toHaveProperty("billable_savings_minor");
    expect(row).toHaveProperty("billing_eligible");
  });
});

describe("C6 — opening a case is gated and idempotent", () => {
  it("previews an eligible opportunity without creating anything", async () => {
    const svc = makeSvc({ MerchantOpportunity: [APPROVED] });
    const out = await previewOpenCase({ svc, opportunity_id: "o1", now: NOW, sha256 });
    expect(out.ok).toBe(true);
    expect(out.preview.allowed).toBe(true);
    expect(out.preview.creates_mandate).toBe(false);
    expect(out.preview.claim_boundary).toContain("verifies nothing");
    // Reading lazily materialises an empty store, so the assertion is that no
    // case exists — not that the store is absent.
    expect(svc.stores.DealActivation || []).toHaveLength(0);
  });

  it("creates the case in the WEAKEST phase with no mandate", async () => {
    const svc = makeSvc({ MerchantOpportunity: [APPROVED] });
    const p = await previewOpenCase({ svc, opportunity_id: "o1", now: NOW, sha256 });
    const out = await openRecoverCase({ svc, actor: "f", opportunity_id: "o1", expected_preview_hash: p.preview_hash, now: NOW, sha256 });
    expect(out.ok).toBe(true);
    expect(out.created).toBe(true);
    const created = svc.stores.DealActivation[0];
    // Creating it already authorized would assert authority nobody granted.
    expect(created.status).toBe("proposed");
    expect(out.mandate_present).toBe(false);
    expect(out.billing_eligible).toBe(false);
    expect(created.recovery_attribution_key).toBe("opp-1");
  });

  it("moves the opportunity to IN_RECOVER with CAS", async () => {
    const svc = makeSvc({ MerchantOpportunity: [APPROVED] });
    const p = await previewOpenCase({ svc, opportunity_id: "o1", now: NOW, sha256 });
    const out = await openRecoverCase({ svc, actor: "f", opportunity_id: "o1", expected_preview_hash: p.preview_hash, now: NOW, sha256 });
    expect(out.opportunity_handed_off).toBe(true);
    expect(svc.stores.MerchantOpportunity[0].status).toBe("IN_RECOVER");
  });

  it("returns the existing case rather than creating a second root", async () => {
    const svc = makeSvc({
      MerchantOpportunity: [APPROVED],
      DealActivation: [{ id: "d1", brand_id: "brand-1", status: "proposed", recovery_attribution_key: "opp-1" }],
    });
    const p = await previewOpenCase({ svc, opportunity_id: "o1", now: NOW, sha256 });
    expect(p.preview.blockers).toContain("recover_case_already_exists");
    const out = await openRecoverCase({ svc, actor: "f", opportunity_id: "o1", expected_preview_hash: p.preview_hash, now: NOW, sha256 });
    // Two roots for one opportunity is the second-source-of-truth C0 forbade.
    expect(out.ok).toBe(true);
    expect(out.created).toBe(false);
    expect(out.idempotent).toBe(true);
    expect(out.case_id).toBe("d1");
    expect(svc.stores.DealActivation).toHaveLength(1);
  });

  it("refuses an opportunity that is not approved", async () => {
    const svc = makeSvc({ MerchantOpportunity: [{ ...APPROVED, status: "QUALIFIED" }] });
    const p = await previewOpenCase({ svc, opportunity_id: "o1", now: NOW, sha256 });
    const out = await openRecoverCase({ svc, actor: "f", opportunity_id: "o1", expected_preview_hash: p.preview_hash, now: NOW, sha256 });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("open_case_not_allowed");
    expect(svc.stores.DealActivation || []).toHaveLength(0);
  });

  it("refuses when the brand cannot be resolved", async () => {
    const svc = makeSvc({ MerchantOpportunity: [{ ...APPROVED, merchant_context_reference: "" }] });
    const p = await previewOpenCase({ svc, opportunity_id: "o1", now: NOW, sha256 });
    expect(p.preview.blockers).toContain("brand_unresolved");
  });

  it("refuses when the preview hash does not match", async () => {
    const svc = makeSvc({ MerchantOpportunity: [APPROVED] });
    const out = await openRecoverCase({ svc, actor: "f", opportunity_id: "o1", expected_preview_hash: "wrong", now: NOW, sha256 });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("preview_hash_mismatch");
    expect(svc.stores.DealActivation || []).toHaveLength(0);
  });

  it("reports an unreadable existing-case check rather than assuming none exists", async () => {
    const svc = makeSvc({ MerchantOpportunity: [APPROVED] }, ["DealActivation"]);
    const out = await previewOpenCase({ svc, opportunity_id: "o1", now: NOW, sha256 });
    // Assuming no case exists would let a second root be created.
    expect(out.ok).toBe(false);
    expect(out.error).toBe("existing_case_unreadable");
  });

  it("escalates when the case was created but the opportunity did not move", async () => {
    const svc = makeSvc({ MerchantOpportunity: [APPROVED] });
    const p = await previewOpenCase({ svc, opportunity_id: "o1", now: NOW, sha256 });
    svc.entities.MerchantOpportunity.updateMany = async () => ({ matched_count: 0 });
    const out = await openRecoverCase({ svc, actor: "f", opportunity_id: "o1", expected_preview_hash: p.preview_hash, now: NOW, sha256 });
    // The case exists. Deleting it would be worse than flagging the divergence.
    expect(out.ok).toBe(true);
    expect(out.created).toBe(true);
    expect(out.opportunity_handed_off).toBe(false);
    expect(out.ambiguity_state).toBe("REVIEW_REQUIRED");
  });
});

describe("C6 — the portfolio is honest about what it could not read", () => {
  const rows = {
    DealActivation: [
      { id: "d1", brand_id: "b1", status: "live", projected_savings_annual: 4000 },
      { id: "d2", brand_id: "b2", status: "monetizing", active_mandate_id: "m1", realized_savings_yearly: 1000, payment_method_status: "ready", verification_access_status: "granted", economic_right_status: "active" },
    ],
  };

  it("reports cases with phases and eligibility", async () => {
    const out = await buildRecoverPortfolio({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    expect(out.ok).toBe(true);
    expect(out.items.rows).toHaveLength(2);
    expect(out.items.rows.find((r) => r.canonical_id === "d2").billing_eligible).toBe(true);
    expect(out.items.rows.find((r) => r.canonical_id === "d1").billing_eligible).toBe(false);
  });

  it("suppresses the total when the root could not be read", async () => {
    const out = await buildRecoverPortfolio({ svc: makeSvc(rows, ["DealActivation"]), now: NOW, contextId: "c" });
    expect(out.items.rows).toEqual([]);
    expect(out.items.total).toBeNull();
    expect(out.context.degraded_sources).toContain("DealActivation");
  });

  it("marks verified savings UNKNOWN when no case carries one", () => {
    const health = buildSourceHealth({ DealActivation: { status: "COMPLETE", records_read: 1, truncated: false, blockers: [] } });
    const cases = [projectRecoverCase({ id: "d1", status: "live", projected_savings_annual: 4000 })];
    const verified = buildRecoverKpis(cases, health).find((r) => r.metric_key === "verified_savings_minor");
    expect(verified.truth_class).toBe("UNKNOWN");
  });

  it("labels expected recoverable as MODELED and not billable", () => {
    const health = buildSourceHealth({ DealActivation: { status: "COMPLETE", records_read: 1, truncated: false, blockers: [] } });
    const cases = [projectRecoverCase({ id: "d1", status: "live", projected_savings_annual: 4000 })];
    const expected = buildRecoverKpis(cases, health).find((r) => r.metric_key === "expected_recoverable_savings_minor");
    expect(expected.truth_class).toBe("MODELED");
    expect(expected.claim_boundary).toContain("not billable");
  });

  it("declares the terminal phases", () => {
    expect([...TERMINAL_PHASES]).toEqual(["COMPLETED", "CANCELLED"]);
  });
});
