/**
 * Tests for 5C (A2) — auto-materialize pipeline.
 *
 * We test the PURE ORCHESTRATION LOGIC without mounting React, because:
 *   • The hook is a thin wrapper (useState + useRef re-entry guard) around
 *     an async pipeline function.
 *   • Introducing @testing-library/react as a dep only for one hook is
 *     over-engineering. The hook was refactored so the pipeline can be
 *     invoked from a plain function `runAutoMaterializePipeline` — same
 *     code path the hook's `run` calls internally.
 *
 * Covered branches (all 7):
 *   1. Missing brandId → skipped.
 *   2. No Stripe Integration → skipped.
 *   3. Bridge fails → failed.
 *   4. Bridge insufficient → collecting (5A NEVER called).
 *   5. Bridge provisional + 5A creates → materialized with resultId.
 *   6. Bridge high + 5A reuses on second run → same resultId, no create.
 *   7. Bridge OK but AnalyzerInput.get returns null → failed defensively.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the SDK boundary. `entities` is what the pipeline actually uses.
vi.mock("@/api/base44Client", () => ({
  base44: {
    entities: {
      Integration:    { filter: vi.fn() },
      AnalyzerInput:  { get: vi.fn() },
      AnalyzerResult: { filter: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
    functions: { invoke: vi.fn() },
  },
}));

import { base44 } from "@/api/base44Client";
import { runAutoMaterializePipeline } from "./useAutoMaterialize";

const STRIPE_INTEG = { id: "int_1", provider: "stripe_self_test", status: "connected" };

function makeAnalyzerInput(overrides = {}) {
  return {
    id: "input_1",
    brand_id: "brand_1",
    monthly_revenue: 45000,
    payment_fee_pct: 2.4,
    monthly_transactions: 300,
    avg_order_value: 150,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  base44.entities.Integration.filter.mockResolvedValue([STRIPE_INTEG]);
  base44.entities.AnalyzerResult.filter.mockResolvedValue([]);
  base44.entities.AnalyzerResult.create.mockImplementation(async (payload) => ({
    id: `result_${Math.random().toString(36).slice(2, 8)}`,
    ...payload,
  }));
  // A2 patch (2026-07-09): the materializer now upserts. Mock update to
  // preserve id + apply payload — same shape the fake SDK does in prod.
  base44.entities.AnalyzerResult.update.mockImplementation(async (id, payload) => ({
    id, ...payload, updated_at: new Date().toISOString(),
  }));
});

describe("runAutoMaterializePipeline — 5C (A2)", () => {
  it("returns skipped when brandId is missing", async () => {
    const out = await runAutoMaterializePipeline(null);
    expect(out.status).toBe("skipped");
    expect(out.reason).toBe("missing_brand_id");
    expect(base44.entities.Integration.filter).not.toHaveBeenCalled();
  });

  it("returns skipped when the brand has no Stripe Integration", async () => {
    base44.entities.Integration.filter.mockResolvedValue([]);
    const out = await runAutoMaterializePipeline("brand_1");
    expect(out.status).toBe("skipped");
    expect(out.reason).toBe("no_stripe_integration");
    expect(base44.functions.invoke).not.toHaveBeenCalled();
  });

  it("returns failed when bridgeToAnalyzer errors", async () => {
    base44.functions.invoke.mockResolvedValue({ data: { ok: false, error: "boom" } });
    const out = await runAutoMaterializePipeline("brand_1");
    expect(out.status).toBe("failed");
    expect(out.reason).toBe("boom");
    expect(base44.entities.AnalyzerResult.create).not.toHaveBeenCalled();
  });

  it("returns collecting on insufficient — does NOT materialize (matiz 1)", async () => {
    base44.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        analyzer_input_id: "input_1",
        data_confidence: "insufficient",
        active_days: 1,
        charge_count: 7,
      },
    });
    const out = await runAutoMaterializePipeline("brand_1");
    expect(out.status).toBe("collecting");
    expect(out.activeDays).toBe(1);
    expect(out.chargeCount).toBe(7);
    // Guard: 5A must NOT have been reached.
    expect(base44.entities.AnalyzerInput.get).not.toHaveBeenCalled();
    expect(base44.entities.AnalyzerResult.create).not.toHaveBeenCalled();
  });

  it("materializes on provisional and returns the new resultId", async () => {
    base44.entities.AnalyzerInput.get.mockResolvedValue(makeAnalyzerInput());
    base44.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        analyzer_input_id: "input_1",
        data_confidence: "provisional",
        active_days: 14,
        charge_count: 63,
      },
    });
    const out = await runAutoMaterializePipeline("brand_1");
    expect(out.status).toBe("materialized");
    expect(out.resultId).toMatch(/^result_/);
    expect(base44.entities.AnalyzerResult.create).toHaveBeenCalledTimes(1);
    // Confirm the row was tagged with the right provenance. Note:
    // `provisional` confidence maps to `pending_verification` (not
    // `verified`) — see verifiedMaterializer.js:244 honesty gate.
    const createdArg = base44.entities.AnalyzerResult.create.mock.calls[0][0];
    expect(createdArg.verification_status).toBe("pending_verification");
    expect(createdArg.source_integration_id).toBe(STRIPE_INTEG.id);
    expect(createdArg.verification_scope).toEqual(["payments"]);
  });

  it("upserts (updates in place) on a second run for the same (brand, integration)", async () => {
    // A2 patch (2026-07-09): the second sync must NOT create a new row —
    // it updates the existing "current state" row in place, preserving
    // its id. This is the contract that closes the accumulation bug.
    base44.entities.AnalyzerInput.get.mockResolvedValue(makeAnalyzerInput());
    base44.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        analyzer_input_id: "input_1",
        data_confidence: "high",
        active_days: 60,
        charge_count: 200,
      },
    });

    const out1 = await runAutoMaterializePipeline("brand_1");
    expect(out1.status).toBe("materialized");
    const firstId = out1.resultId;

    // Second run — dedup filter finds the existing row → update path.
    base44.entities.AnalyzerResult.filter.mockResolvedValueOnce([
      { id: firstId, brand_id: "brand_1", source_integration_id: STRIPE_INTEG.id },
    ]);
    base44.entities.AnalyzerResult.create.mockClear();
    base44.entities.AnalyzerResult.update.mockClear();

    const out2 = await runAutoMaterializePipeline("brand_1");
    expect(out2.status).toBe("materialized");
    expect(out2.resultId).toBe(firstId);
    // No new row.
    expect(base44.entities.AnalyzerResult.create).not.toHaveBeenCalled();
    // Update WAS called on the existing id.
    expect(base44.entities.AnalyzerResult.update).toHaveBeenCalledTimes(1);
    expect(base44.entities.AnalyzerResult.update.mock.calls[0][0]).toBe(firstId);
  });

  it("returns failed defensively when AnalyzerInput.get returns null", async () => {
    base44.entities.AnalyzerInput.get.mockResolvedValue(null);
    base44.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        analyzer_input_id: "input_missing",
        data_confidence: "high",
        active_days: 60,
        charge_count: 200,
      },
    });
    const out = await runAutoMaterializePipeline("brand_1");
    expect(out.status).toBe("failed");
    expect(out.reason).toBe("verified_input_not_found");
    expect(base44.entities.AnalyzerResult.create).not.toHaveBeenCalled();
  });
});