// DASHBOARD-C5 (2026-08-17) — material transitions are FAIL-CLOSED on history loss.
//
// Founder instruction: a transition with contractual, economic, verification,
// billing, mandate, migration or terminal effect must require its
// PipelineStageEvent to persist as a condition of success.
//
// A material change with no durable history is indistinguishable from one that
// never happened. These tests prove the authority move is REVERTED in that case,
// and that non-material transitions still stand.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { applyStageChange, previewStageChange } from "../../base44/shared/pipelineCore.ts";
import {
  historyRequiredFor, isMaterialStage, MATERIAL_KINDS, materialKindsFor, stagesFor, LANES,
} from "../../base44/shared/pipelineStageRegistry.ts";
import { nullableNumber, nullableSum } from "../../base44/shared/nullableNumber.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function makeSvc(rows = {}) {
  const stores = {}; const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      get rows() { return stores[name]; },
      async get(id) { const r = stores[name].find((x) => String(x.id) === String(id)); return r ? { ...r } : null; },
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

const LEAD = { id: "l1", company_name: "Acme", stage: "contacted", updated_date: NOW };

async function move(svc, to, breakHistory) {
  const p = await previewStageChange({
    svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: to, now: NOW, sha256,
    reason_code: to === "LOST" || to === "DISQUALIFIED" ? "no_budget" : null,
  });
  if (breakHistory) svc.entities.PipelineStageEvent.create = async () => { throw new Error("ledger down"); };
  return {
    preview: p,
    result: await applyStageChange({
      svc, actor: "founder@cambra.global", actor_kind: "FOUNDER",
      lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: to,
      reason_code: to === "LOST" || to === "DISQUALIFIED" ? "no_budget" : null,
      expected_preview_hash: p.preview_hash, now: NOW, sha256,
    }),
  };
}

describe("C5 — the registry classifies material transitions", () => {
  it("declares the seven material kinds", () => {
    expect([...MATERIAL_KINDS].sort()).toEqual([
      "billing", "contractual", "economic", "mandate", "migration", "terminal", "verification",
    ]);
  });

  it("marks every terminal stage material", () => {
    for (const lane of LANES) {
      for (const stage of stagesFor(lane)) {
        if (stage.terminal) {
          expect(isMaterialStage(lane, stage.key), `${lane}.${stage.key}`).toBe(true);
          expect(materialKindsFor(lane, stage.key), `${lane}.${stage.key}`).toContain("terminal");
        }
      }
    }
  });

  it("requires history for every material stage and not for the rest", () => {
    for (const lane of LANES) {
      for (const stage of stagesFor(lane)) {
        expect(historyRequiredFor(lane, stage.key), `${lane}.${stage.key}`)
          .toBe(isMaterialStage(lane, stage.key));
      }
    }
  });

  it("does not classify an ordinary progression stage as material", () => {
    expect(isMaterialStage("MERCHANT_ACQUISITION", "CONTACTED")).toBe(false);
    expect(isMaterialStage("MERCHANT_ACQUISITION", "MEETING_BOOKED")).toBe(false);
  });

  it("surfaces materiality in the preview, before the decision", async () => {
    const svc = makeSvc({ OutboundLead: [LEAD] });
    const p = await previewStageChange({
      svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "LOST",
      reason_code: "no_budget", now: NOW, sha256,
    });
    expect(p.preview.material).toBe(true);
    expect(p.preview.history_required).toBe(true);
    expect(p.preview.material_kinds).toContain("terminal");
  });
});

describe("C5 — a material transition is REVERTED when its history cannot persist", () => {
  it("rolls the authority back and reports failure", async () => {
    const svc = makeSvc({ OutboundLead: [LEAD] });
    const { result } = await move(svc, "LOST", true);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("material_transition_history_unpersisted");
    expect(result.rolled_back).toBe(true);
    // The stage is back where it started: a material change with no history is
    // indistinguishable from one that never happened.
    expect(svc.stores.OutboundLead[0].stage).toBe("contacted");
  });

  it("escalates to REVIEW_REQUIRED when the rollback itself fails", async () => {
    const svc = makeSvc({ OutboundLead: [LEAD] });
    const p = await previewStageChange({
      svc, lane: "MERCHANT_ACQUISITION", subject_id: "l1", to_stage: "LOST",
      reason_code: "no_budget", now: NOW, sha256,
    });
    svc.entities.PipelineStageEvent.create = async () => { throw new Error("ledger down"); };
    let calls = 0;
    const original = svc.entities.OutboundLead.updateMany;
    svc.entities.OutboundLead.updateMany = async (...a) => {
      calls += 1;
      if (calls > 1) throw new Error("rollback failed");
      return original.apply(svc.entities.OutboundLead, a);
    };
    const result = await applyStageChange({
      svc, actor: "f", actor_kind: "FOUNDER", lane: "MERCHANT_ACQUISITION",
      subject_id: "l1", to_stage: "LOST", reason_code: "no_budget",
      expected_preview_hash: p.preview_hash, now: NOW, sha256,
    });
    expect(result.ok).toBe(false);
    expect(result.rolled_back).toBe(false);
    // Repeating the move could double a material effect, so retry is blocked.
    expect(result.ambiguity_state).toBe("REVIEW_REQUIRED");
    expect(result.automatic_retry_blocked).toBe(true);
  });

  it("succeeds normally when the history does persist", async () => {
    const svc = makeSvc({ OutboundLead: [LEAD] });
    const { result } = await move(svc, "LOST", false);
    expect(result.ok).toBe(true);
    expect(result.material).toBe(true);
    expect(result.history_recorded).toBe(true);
    expect(svc.stores.OutboundLead[0].stage).toBe("lost");
  });
});

describe("C5 — a NON-material transition still stands when history is lost", () => {
  it("keeps the move and reports the incomplete history", async () => {
    const svc = makeSvc({ OutboundLead: [LEAD] });
    const { result } = await move(svc, "MEETING_BOOKED", true);
    // Losing a lead's meeting timestamp is not worth reverting a real change.
    expect(result.ok).toBe(true);
    expect(result.material).toBe(false);
    expect(result.history_recorded).toBe(false);
    expect(svc.stores.OutboundLead[0].stage).toBe("meeting");
  });
});

describe("C5 — nullable coercion lives in one place and never turns absent into zero", () => {
  it("returns null for every flavour of absent", () => {
    for (const value of [null, undefined, "", "   ", NaN, Infinity, -Infinity, true, false]) {
      expect(nullableNumber(value), String(value)).toBeNull();
    }
  });

  it("keeps a genuine zero", () => {
    expect(nullableNumber(0)).toBe(0);
    expect(nullableNumber("0")).toBe(0);
  });

  it("reads real numbers", () => {
    expect(nullableNumber(1234)).toBe(1234);
    expect(nullableNumber("56.7")).toBe(56.7);
  });

  it("sums and declares completeness rather than hiding exclusions", () => {
    expect(nullableSum([1, 2, 3])).toEqual({ total: 6, counted: 3, missing: 0, completeness: "COMPLETE" });
    expect(nullableSum([1, null, 3])).toEqual({ total: 4, counted: 2, missing: 1, completeness: "LOWER_BOUND" });
    expect(nullableSum([null, null])).toEqual({ total: null, counted: 0, missing: 2, completeness: "UNKNOWN" });
    expect(nullableSum([])).toEqual({ total: null, counted: 0, missing: 0, completeness: "UNKNOWN" });
  });
});
