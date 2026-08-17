// DASHBOARD-C4 (2026-08-17) — Audits & Opportunities projection.
//
// The separations these tests protect (section 9.4):
//   gross theoretical != actionable != expected recoverable != verified != billable
// Collapsing any two is how a large "opportunity" becomes a promise.
import { describe, expect, it } from "vitest";
import {
  AUDIT_TYPES,
  auditTruthClass,
  auditTypeFor,
  buildAuditsKpis,
  buildAuditsPortfolio,
  filterOpportunities,
  NEVER_VERIFIED_TYPES,
  OPPORTUNITY_STATUSES,
  previewRecoverHandoff,
  projectAudit,
  projectOpportunity,
  recoverEligibility,
} from "../../base44/shared/auditsCore.ts";
import { buildSourceHealth } from "../../base44/shared/workspaceContract.ts";

const NOW = "2026-08-17T12:00:00.000Z";

function makeSvc(rows = {}, broken = []) {
  const stores = {};
  const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      get rows() { return stores[name]; },
      async list() { if (broken.includes(name)) throw new Error(`${name}_down`); return stores[name].map((r) => ({ ...r })); },
      async get(id) {
        if (broken.includes(name)) throw new Error(`${name}_down`);
        const row = stores[name].find((r) => String(r.id) === String(id));
        return row ? { ...row } : null;
      },
    };
    return built[name];
  };
  return { stores, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const healthAll = buildSourceHealth({
  AnalyzerResult: { status: "COMPLETE", records_read: 3, truncated: false, blockers: [] },
  MerchantOpportunity: { status: "COMPLETE", records_read: 3, truncated: false, blockers: [] },
});

describe("C4 — an estimate can never be labelled verified", () => {
  it("derives ANONYMOUS_ESTIMATE from an anonymous row", () => {
    expect(auditTypeFor({ was_anonymous: true })).toBe("ANONYMOUS_ESTIMATE");
    expect(auditTypeFor({ anon_session_id: "s1" })).toBe("ANONYMOUS_ESTIMATE");
  });

  it("caps an anonymous estimate at MODELED even when the row says verified", () => {
    // AnalyzerResult requires NOTHING, so verification_status can say anything.
    const row = { was_anonymous: true, verification_status: "verified" };
    expect(auditTruthClass(row)).toBe("MODELED");
    expect(auditTruthClass(row)).not.toBe("VERIFIED");
  });

  it("surfaces the mislabelling as an attention reason rather than swallowing it", () => {
    const audit = projectAudit({ id: "a1", was_anonymous: true, verification_status: "verified" });
    expect(audit.attention_reasons).toContain("claims_verified_but_type_cannot_be_verified");
    expect(audit.claim_boundary).toContain("may not be presented as verified savings");
  });

  it("lets a connected, verified audit reach VERIFIED", () => {
    expect(auditTruthClass({ source_integration_id: "i1", verification_scope: "CONNECTED", verification_status: "verified" }))
      .toBe("VERIFIED");
  });

  it("defaults an ambiguous row to the weakest claim", () => {
    // A row that does not prove it was connected is an estimate.
    expect(auditTypeFor({})).toBe("ANONYMOUS_ESTIMATE");
    expect(auditTruthClass({})).toBe("MODELED");
  });

  it("declares which types can never be verified", () => {
    expect([...NEVER_VERIFIED_TYPES]).toEqual(["ANONYMOUS_ESTIMATE", "MANUAL_REVIEW"]);
    for (const type of NEVER_VERIFIED_TYPES) expect([...AUDIT_TYPES]).toContain(type);
  });
});

describe("C4 — absent provenance is recorded, not assumed away", () => {
  it("marks a missing measurement window ABSENT", () => {
    // measurement_window is a property of PaymentsAnalysisVerified but NOT required.
    expect(projectAudit({ id: "a1" }).window_provenance).toBe("ABSENT");
    expect(projectAudit({ id: "a2", measurement_window: { from: "x" } }).window_provenance).toBe("PRESENT");
  });

  it("reports unknown completeness rather than treating it as complete", () => {
    const audit = projectAudit({ id: "a1", source_integration_id: "i1" });
    expect(audit.data_completeness).toBeNull();
    expect(audit.attention_reasons).toContain("completeness_unknown");
  });

  it("labels a partially complete audit a lower bound", () => {
    const audit = projectAudit({ id: "a1", source_integration_id: "i1", data_completeness_score: 70 });
    expect(audit.claim_boundary).toContain("lower bound");
  });

  it("flags a missing engine or benchmark version", () => {
    const audit = projectAudit({ id: "a1" });
    expect(audit.attention_reasons).toContain("engine_version_missing");
    expect(audit.attention_reasons).toContain("benchmark_version_missing");
    expect(audit.attention_reasons).toContain("methodology_undeclared");
  });
});

describe("C4 — the six savings figures stay separate", () => {
  const full = {
    id: "o1", opportunity_key: "k1", market: "ES", status: "QUALIFIED",
    current_annual_cost_minor: 10_000_00, target_annual_cost_minor: 6_000_00,
    gross_theoretical_savings_minor: 4_000_00,
    actionable_savings_minor: 3_000_00,
    expected_recoverable_savings_minor: 2_000_00,
    annualized_savings_minor: 2_000_00,
    realization_probability_ppm: 650_000,
    confidence: "MEDIUM", evidence_completeness: "COMPLETE",
    merchant_context_reference: "m1", evidence_references: ["e1"], calculation_version: "v1",
  };

  it("keeps each figure at its own value", () => {
    const row = projectOpportunity(full);
    expect(row.gross_theoretical_savings_minor).toBe(400000);
    expect(row.actionable_savings_minor).toBe(300000);
    expect(row.expected_recoverable_savings_minor).toBe(200000);
    // No two collapsed into one.
    expect(row.gross_theoretical_savings_minor).not.toBe(row.actionable_savings_minor);
    expect(row.actionable_savings_minor).not.toBe(row.expected_recoverable_savings_minor);
  });

  it("never produces a verified or billable savings figure", () => {
    const row = projectOpportunity(full);
    // Those authorities belong to Recover and Finance.
    expect(row).not.toHaveProperty("verified_savings_minor");
    expect(row).not.toHaveProperty("billable_savings_minor");
    expect(Object.keys(row).some((key) => /verified|billable/.test(key))).toBe(false);
  });

  it("refuses to present a gross-only opportunity as a savings opportunity", () => {
    const row = projectOpportunity({ ...full, actionable_savings_minor: null, expected_recoverable_savings_minor: null });
    expect(row.claim_boundary).toContain("may not be presented as a savings opportunity");
  });

  it("says the realizable share is undetermined when only actionable is known", () => {
    const row = projectOpportunity({ ...full, expected_recoverable_savings_minor: null });
    expect(row.claim_boundary).toContain("undetermined");
  });

  it("reports a missing probability rather than assuming certainty", () => {
    const row = projectOpportunity({ ...full, realization_probability_ppm: null });
    expect(row.realization_probability_ppm).toBeNull();
    expect(row.attention_reasons).toContain("realization_probability_unknown");
  });
});

describe("C4 — a Recover handoff defaults to refusal", () => {
  const approved = {
    id: "o1", opportunity_key: "k", status: "APPROVED_FOR_RECOVER",
    evidence_completeness: "COMPLETE", merchant_context_reference: "m1",
    expected_recoverable_savings_minor: 100000, blockers: [], evidence_references: ["e1"],
  };

  it("allows a fully approved, evidenced opportunity", () => {
    expect(recoverEligibility(approved).eligible).toBe(true);
  });

  it("refuses anything not APPROVED_FOR_RECOVER", () => {
    for (const status of ["CANDIDATE", "QUALIFIED", "REVIEW_REQUIRED", "REJECTED", "DEFERRED"]) {
      const result = recoverEligibility({ ...approved, status });
      expect(result.eligible, status).toBe(false);
      expect(result.blockers.some((b) => b.startsWith("status_not_approved_for_recover"))).toBe(true);
    }
  });

  it("refuses when evidence completeness is not recorded", () => {
    // Absence of a completeness reading is not evidence of completeness.
    const result = recoverEligibility({ ...approved, evidence_completeness: "" });
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("evidence_completeness_unknown");
  });

  it("refuses when the opportunity declares its own blockers", () => {
    expect(recoverEligibility({ ...approved, blockers: ["awaiting_statement"] }).blockers)
      .toContain("opportunity_declares_blockers");
  });

  it("refuses when expected recoverable savings are unknown", () => {
    expect(recoverEligibility({ ...approved, expected_recoverable_savings_minor: null }).blockers)
      .toContain("expected_recoverable_savings_unknown");
  });

  it("refuses an empty row rather than defaulting to eligible", () => {
    expect(recoverEligibility({}).eligible).toBe(false);
  });

  it("previews without creating anything and says so", async () => {
    const svc = makeSvc({ MerchantOpportunity: [approved] });
    const out = await previewRecoverHandoff({ svc, opportunity_id: "o1", now: NOW });
    expect(out.ok).toBe(true);
    expect(out.preview.eligible).toBe(true);
    expect(out.preview.creates_recover_case).toBe(false);
    expect(out.preview.note).toContain("not verified savings");
    expect(out.preview.external_send_performed).toBe(false);
  });

  it("reports an unreadable opportunity rather than assuming it is absent", async () => {
    const out = await previewRecoverHandoff({
      svc: makeSvc({ MerchantOpportunity: [approved] }, ["MerchantOpportunity"]),
      opportunity_id: "o1", now: NOW,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("opportunity_unreadable");
  });
});

describe("C4 — the portfolio keeps audits and opportunities apart", () => {
  const svcRows = {
    AnalyzerResult: [
      { id: "a1", brand_id: "b1", was_anonymous: true, verification_status: "verified", total_savings: 4000 },
      { id: "a2", brand_id: "b2", source_integration_id: "i1", verification_scope: "CONNECTED", verification_status: "verified", total_savings: 2000, data_completeness_score: 100, score_engine_version: "v1", benchmark_version: "b1", methodology: "m", measurement_window: { from: "x" } },
    ],
    MerchantOpportunity: [
      { id: "o1", opportunity_key: "k1", market: "ES", status: "APPROVED_FOR_RECOVER", evidence_completeness: "COMPLETE", merchant_context_reference: "m1", expected_recoverable_savings_minor: 200000, gross_theoretical_savings_minor: 400000, actionable_savings_minor: 300000, blockers: [], evidence_references: ["e1"], calculation_version: "v1", realization_probability_ppm: 500000 },
      { id: "o2", opportunity_key: "k2", market: "FR", status: "CANDIDATE", gross_theoretical_savings_minor: 900000, blockers: [], evidence_references: [] },
    ],
  };

  it("returns audits on the audits tab and opportunities on the other", async () => {
    const audits = await buildAuditsPortfolio({ svc: makeSvc(svcRows), now: NOW, contextId: "c", tab: "audits" });
    expect(audits.items.rows.every((row) => row.entity_type === "AnalyzerResult")).toBe(true);
    const opportunities = await buildAuditsPortfolio({ svc: makeSvc(svcRows), now: NOW, contextId: "c", tab: "opportunities" });
    expect(opportunities.items.rows.every((row) => row.entity_type === "MerchantOpportunity")).toBe(true);
  });

  it("reports the four savings KPIs separately and never a verified one", async () => {
    const out = await buildAuditsPortfolio({ svc: makeSvc(svcRows), now: NOW, contextId: "c" });
    const keys = out.kpis.map((row) => row.metric_key);
    expect(keys).toContain("gross_theoretical_savings_minor");
    expect(keys).toContain("actionable_savings_minor");
    expect(keys).toContain("expected_recoverable_savings_minor");
    // No verified or billable KPI in this workspace.
    expect(keys.some((key) => /verified_savings|billable/.test(key))).toBe(false);
  });

  it("labels a savings KPI a lower bound when opportunities omit the figure", async () => {
    const out = await buildAuditsPortfolio({ svc: makeSvc(svcRows), now: NOW, contextId: "c" });
    const actionable = out.kpis.find((row) => row.metric_key === "actionable_savings_minor");
    // o2 has no actionable figure.
    expect(actionable.truth_class).toBe("MODELED");
    expect(actionable.claim_boundary).toContain("Lower bound");
    expect(actionable.numerator).toBe(1);
    expect(actionable.denominator).toBe(2);
  });

  it("counts the mislabelled audit", async () => {
    const out = await buildAuditsPortfolio({ svc: makeSvc(svcRows), now: NOW, contextId: "c" });
    expect(out.kpis.find((row) => row.metric_key === "audits_mislabelled").value).toBe(1);
  });

  it("suppresses the total and names the source when a read fails", async () => {
    const out = await buildAuditsPortfolio({
      svc: makeSvc(svcRows, ["MerchantOpportunity"]), now: NOW, contextId: "c", tab: "opportunities",
    });
    expect(out.items.rows).toEqual([]);
    expect(out.items.total).toBeNull();
    expect(out.context.degraded_sources).toContain("MerchantOpportunity");
  });

  it("carries the truth boundary and declares nothing was sent", async () => {
    const out = await buildAuditsPortfolio({ svc: makeSvc(svcRows), now: NOW, contextId: "c" });
    expect(out.context.truth_boundary).toContain("Missing evidence remains unknown");
    expect(out.external_send_performed).toBe(false);
  });
});

describe("C4 — filters and vocabularies", () => {
  it("filters opportunities by readiness and evidence", () => {
    const rows = [
      projectOpportunity({ id: "o1", status: "APPROVED_FOR_RECOVER", evidence_completeness: "COMPLETE", merchant_context_reference: "m", expected_recoverable_savings_minor: 1, blockers: [], evidence_references: ["e"] }),
      projectOpportunity({ id: "o2", status: "CANDIDATE", blockers: [], evidence_references: [] }),
    ];
    expect(filterOpportunities(rows, { ready_for_recover: true }).map((r) => r.canonical_id)).toEqual(["o1"]);
    expect(filterOpportunities(rows, { needs_evidence: true }).map((r) => r.canonical_id)).toEqual(["o2"]);
  });

  it("declares the full status vocabularies", () => {
    expect([...OPPORTUNITY_STATUSES]).toContain("APPROVED_FOR_RECOVER");
    expect([...OPPORTUNITY_STATUSES]).toContain("NOT_REALIZED");
    expect([...AUDIT_TYPES]).toContain("POST_CHANGE_VERIFICATION");
  });

  it("KPIs report null when their source failed", () => {
    const health = buildSourceHealth({
      AnalyzerResult: { status: "UNAVAILABLE", records_read: null, truncated: false, blockers: [] },
      MerchantOpportunity: { status: "COMPLETE", records_read: 0, truncated: false, blockers: [] },
    });
    const audits = buildAuditsKpis([], [], health).find((row) => row.metric_key === "audits");
    expect(audits.value).toBeNull();
    expect(audits.truth_class).toBe("UNKNOWN");
  });
});
