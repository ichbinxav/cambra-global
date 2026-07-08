/**
 * Chunk 5A — Verified Result Materializer tests.
 *
 * These tests exercise materializeVerifiedResult against a FAKE in-memory
 * entities client. No network, no Base44 SDK, no scoreEngine mocking — we
 * deliberately let the real @/lib/scoreEngine run so we prove:
 *
 *   1) The module uses the shared engine (not a reimplementation).
 *   2) Given the same input, our materialized savings match what the
 *      wizard would compute by calling calculateSavings itself.
 *
 * The four CTO test contracts (from the 5A brief):
 *   • materializes correctly (high + provisional)
 *   • idempotent (two calls → one row, same id)
 *   • insufficient does NOT materialize (no verified over insufficient data)
 *   • provisional and high BOTH materialize (with their confidence label)
 *
 * Plus one extra frontline: missing required input → loud fail, no write.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { materializeVerifiedResult } from "@/lib/verifiedMaterializer";
import { calculateSavings, ENGINE_VERSION } from "@/lib/scoreEngine";

/**
 * Minimal Base44-shaped entities fake — just enough for the module's
 * two calls (AnalyzerResult.filter + AnalyzerResult.create). Records get
 * a stable id + created_date so the sort-by-created_date query works.
 */
function makeFakeEntities() {
  const store = { AnalyzerResult: [] };
  let seq = 0;

  const client = {
    AnalyzerResult: {
      async filter(query, sort, limit) {
        let rows = store.AnalyzerResult.filter(r =>
          Object.entries(query).every(([k, v]) => r[k] === v)
        );
        if (sort === "-created_date") {
          rows = rows.slice().sort((a, b) =>
            String(b.created_date).localeCompare(String(a.created_date))
          );
        }
        if (typeof limit === "number") rows = rows.slice(0, limit);
        return rows;
      },
      async create(payload) {
        seq += 1;
        const row = {
          id: `res_${seq}`,
          created_date: new Date(Date.now() + seq).toISOString(),
          ...payload,
        };
        store.AnalyzerResult.push(row);
        return row;
      },
    },
  };

  return { client, store };
}

/**
 * A minimal AnalyzerInput row that bridgeToAnalyzer would produce for a
 * healthy Stripe account. Numbers picked so calculateSavings returns a
 * non-zero payment_savings — that lets us assert the pipe is live.
 */
function makeVerifiedInput(overrides = {}) {
  return {
    id: "input_abc",
    brand_id: "brand_xyz",
    monthly_revenue: 80000,           // €80k/mo → "small" tier
    payment_fee_pct: 2.8,             // above the 2.2% EU small target
    payment_provider: "Stripe",
    country: "Spain",
    data_source: "api",
    ...overrides,
  };
}

describe("materializeVerifiedResult — 5A", () => {
  let entities, store;

  beforeEach(() => {
    const fake = makeFakeEntities();
    entities = fake.client;
    store = fake.store;
  });

  describe("uses the shared engine (no duplication)", () => {
    it("persists payment_savings exactly equal to calculateSavings(input).paymentSavings", async () => {
      const input = makeVerifiedInput();

      const { status, result } = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "high",
        activeDays: 90,
        chargeCount: 1200,
        entities,
      });

      const expected = calculateSavings(input);

      expect(status).toBe("created");
      expect(result.payment_savings).toBe(expected.paymentSavings);
      expect(result.shipping_savings).toBe(expected.shippingSavings);
      expect(result.saas_savings).toBe(expected.saasSavings);
      expect(result.total_savings).toBe(expected.totalSavings);
      // Engine version travels with the row for auditability.
      expect(result.score_engine_version).toBe(ENGINE_VERSION.score);
      expect(result.savings_model_version).toBe(ENGINE_VERSION.savings);
    });
  });

  describe("materializes correctly (verified row shape)", () => {
    it("carries verification_status='verified', scope=['payments'], and source_integration_id", async () => {
      const input = makeVerifiedInput();

      const { status, result } = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_stripe_42",
        dataConfidence: "high",
        entities,
      });

      expect(status).toBe("created");
      expect(result.verification_status).toBe("verified");
      expect(result.verification_scope).toEqual(["payments"]);
      expect(result.source_integration_id).toBe("int_stripe_42");
      // brand_id inherits from the input row — tenant isolation contract.
      expect(result.brand_id).toBe(input.brand_id);
      expect(result.input_id).toBe(input.id);
    });

    it("embeds data_confidence + activeDays + chargeCount in assumptions (audit trail)", async () => {
      const input = makeVerifiedInput();

      const { result } = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "provisional",
        activeDays: 12,
        chargeCount: 87,
        entities,
      });

      const joined = (result.assumptions || []).join(" | ");
      expect(joined).toMatch(/data_confidence: provisional/);
      expect(joined).toMatch(/12 active day/);
      expect(joined).toMatch(/87 charge/);
    });
  });

  describe("idempotency — two calls, one row", () => {
    it("returns the SAME AnalyzerResult on a second call for the same input_id", async () => {
      const input = makeVerifiedInput();

      const first = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "high",
        entities,
      });
      const second = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "high",
        entities,
      });

      expect(first.status).toBe("created");
      expect(second.status).toBe("reused");
      expect(second.result.id).toBe(first.result.id);
      // And the store contains exactly one verified row for this input.
      const verifiedRows = store.AnalyzerResult.filter(
        r => r.input_id === input.id && r.verification_status === "verified"
      );
      expect(verifiedRows).toHaveLength(1);
    });
  });

  describe("confidence gate", () => {
    it("does NOT materialize when dataConfidence='insufficient'", async () => {
      const input = makeVerifiedInput();

      const res = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "insufficient",
        entities,
      });

      expect(res.status).toBe("insufficient");
      expect(store.AnalyzerResult).toHaveLength(0);
    });

    it("treats an unknown/undefined confidence as insufficient (safe default)", async () => {
      const input = makeVerifiedInput();

      const res = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: undefined,
        entities,
      });

      expect(res.status).toBe("insufficient");
      expect(store.AnalyzerResult).toHaveLength(0);
    });

    it("DOES materialize when dataConfidence='provisional'", async () => {
      const input = makeVerifiedInput();

      const res = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "provisional",
        entities,
      });

      expect(res.status).toBe("created");
      expect(res.result.verification_status).toBe("verified");
      // The label survives — provisional confidence maps to "medium".
      expect(res.result.confidence_level).toBe("medium");
    });

    it("DOES materialize when dataConfidence='high'", async () => {
      const input = makeVerifiedInput();

      const res = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "high",
        entities,
      });

      expect(res.status).toBe("created");
      expect(res.result.verification_status).toBe("verified");
      expect(res.result.confidence_level).toBe("high");
    });
  });

  describe("missing required input — loud fail, no write", () => {
    it("returns status='missing_input' when payment_fee_pct is absent", async () => {
      const input = makeVerifiedInput({ payment_fee_pct: null });

      const res = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "high",
        entities,
      });

      expect(res.status).toBe("missing_input");
      expect(res.missing).toContain("payment_fee_pct");
      expect(store.AnalyzerResult).toHaveLength(0);
    });

    it("returns status='missing_input' when monthly_revenue is absent", async () => {
      const input = makeVerifiedInput({ monthly_revenue: null });

      const res = await materializeVerifiedResult({
        analyzerInput: input,
        integrationId: "int_1",
        dataConfidence: "provisional",
        entities,
      });

      expect(res.status).toBe("missing_input");
      expect(res.missing).toContain("monthly_revenue");
      expect(store.AnalyzerResult).toHaveLength(0);
    });
  });

  describe("wiring guards", () => {
    it("throws if entities client is missing", async () => {
      await expect(
        materializeVerifiedResult({
          analyzerInput: makeVerifiedInput(),
          integrationId: "int_1",
          dataConfidence: "high",
        })
      ).rejects.toThrow(/entities/);
    });

    it("throws if analyzerInput has no id (not persisted)", async () => {
      await expect(
        materializeVerifiedResult({
          analyzerInput: { brand_id: "b", monthly_revenue: 1, payment_fee_pct: 1 },
          integrationId: "int_1",
          dataConfidence: "high",
          entities,
        })
      ).rejects.toThrow(/analyzerInput\.id/);
    });

    it("throws if integrationId is missing", async () => {
      await expect(
        materializeVerifiedResult({
          analyzerInput: makeVerifiedInput(),
          dataConfidence: "high",
          entities,
        })
      ).rejects.toThrow(/integrationId/);
    });
  });
});