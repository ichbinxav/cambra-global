import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  P4_COST_RECEIPT_VERSION,
  buildP4CanonicalContext,
  p4CostReceiptFromResponse,
  tenantSafeP4Estimate,
  validateP4EstimateAgainstDeployment,
} from "../../base44/shared/p4Bridge.ts";
import { settlePaidOperation } from "../../base44/shared/costGovernance.ts";

const estimate = (costReceipt) => ({
  estimate_id: "p4-estimate-1",
  deployment_id: "deployment-1",
  target_spec_id: "effective-rate",
  model_version_id: "external-v1",
  as_of: "2026-08-13T00:00:00.000Z",
  available_at: "2026-08-12T00:00:00.000Z",
  expires_at: "2026-08-20T00:00:00.000Z",
  status: "VALID",
  lineage_hash: "lineage-1",
  unit: "BPS",
  currency: "EUR",
  target: {
    unit: "BPS",
    currency: "EUR",
    fee_perimeter: "ALL_PROCESSING_FEES",
    source_population: "MERCHANT_OBSERVED",
    horizon: "CURRENT_PERIOD",
  },
  ood: { status: "IN_DISTRIBUTION" },
  ...(costReceipt ? { cost_receipt: costReceipt } : {}),
});

const receipt = (overrides = {}) => ({
  schema_version: P4_COST_RECEIPT_VERSION,
  receipt_id: "receipt-1",
  provider_operation_id: "provider-operation-1",
  amount_minor: 7,
  currency: "EUR",
  final: true,
  issued_at: "2026-08-13T00:00:00.000Z",
  ...overrides,
});

function costService() {
  const updates = [];
  return {
    updates,
    entities: {
      CostUsageEvent: {
        update: async (id, patch) => {
          const row = { id, ...structuredClone(patch) };
          updates.push(row);
          return row;
        },
      },
    },
  };
}

const reservation = () => ({
  duplicate: false,
  event: {
    id: "cost-event-1",
    amount_minor: 11,
    usage_json: { reservation: true },
  },
});

describe("P4 paid external-call governance", () => {
  it("accepts only an explicit final EUR minor-unit receipt with operation identity", () => {
    expect(p4CostReceiptFromResponse(estimate(receipt()))).toEqual({
      reliable: true,
      reason: "P4_COST_RECEIPT_RELIABLE",
      receipt: receipt(),
    });
    expect(p4CostReceiptFromResponse(estimate())).toMatchObject({
      reliable: false,
      reason: "P4_COST_RECEIPT_MISSING",
      receipt: null,
    });
    expect(p4CostReceiptFromResponse(estimate(receipt({ amount_minor: "7" }))))
      .toMatchObject({
        reliable: false,
        reason: "P4_COST_RECEIPT_AMOUNT_INVALID",
      });
    expect(p4CostReceiptFromResponse(estimate(receipt({ final: false }))))
      .toMatchObject({
        reliable: false,
        reason: "P4_COST_RECEIPT_NOT_FINAL",
      });
    expect(p4CostReceiptFromResponse(estimate(receipt({ currency: "USD" }))))
      .toMatchObject({
        reliable: false,
        reason: "P4_COST_RECEIPT_CURRENCY_UNSUPPORTED",
      });
  });

  it("removes billing receipts from the tenant-safe statistical estimate", () => {
    const safe = tenantSafeP4Estimate(estimate(receipt()));
    expect(safe.cost_receipt).toBeUndefined();
    expect(safe.estimate_id).toBe("p4-estimate-1");
  });

  it("CPIC-AT-061/062 recursively rejects private response material and drops unknown safe fields", () => {
    expect(() => tenantSafeP4Estimate({
      ...estimate(),
      metadata: { contact_email: "person@example.test" },
    })).toThrow("p4_private_evidence_response_forbidden");
    const safe = tenantSafeP4Estimate({
      ...estimate(),
      metadata: { harmless_vendor_field: "not-retained" },
    });
    expect(safe.metadata).toBeUndefined();
  });

  it("CPIC-AT-030/195/208 validates exact deployment/target/time while support remains UNKNOWN", () => {
    const deployment = {
      gate_version: "p4-deployment-gate.v1",
      deployment_id: "deployment-1",
      model_version_id: "external-v1",
      target_spec_id: "effective-rate",
      fee_perimeter: "ALL_PROCESSING_FEES",
      source_population: "MERCHANT_OBSERVED",
      horizon: "CURRENT_PERIOD",
      unit: "BPS",
      status: "APPROVED_ADVISORY",
      available_at: "2026-08-12T00:00:00.000Z",
      expires_at: "2026-08-30T00:00:00.000Z",
      evaluated_at: "2026-08-13T12:00:00.000Z",
      authority_granted: false,
      material_automation_allowed: false,
    };
    const safe = tenantSafeP4Estimate(estimate());
    expect(validateP4EstimateAgainstDeployment(
      safe,
      deployment,
      "2026-08-13T12:00:00.000Z",
      { currency: "EUR" },
    )).toMatchObject({
      canonical_support_status: "UNKNOWN_SUPPORT",
      decision_status: "ABSTAIN",
      registered_support_detector_resolved: false,
    });
    expect(() => validateP4EstimateAgainstDeployment(
      { ...safe, deployment_id: "caller-claimed-deployment" },
      deployment,
      "2026-08-13T12:00:00.000Z",
      { currency: "EUR" },
    )).toThrow(/P4_DEPLOYMENT_ID_MISMATCH/);
  });

  it("CPIC-AT-013/014 builds the external context only from tenant-bound server rows", () => {
    const deployment = {
      gate_version: "p4-deployment-gate.v1",
      deployment_id: "deployment-1",
      model_version_id: "external-v1",
      target_spec_id: "effective-rate",
      fee_perimeter: "ALL_PROCESSING_FEES",
      source_population: "MERCHANT_OBSERVED",
      horizon: "CURRENT_PERIOD",
      unit: "BPS",
      status: "APPROVED_ADVISORY",
      available_at: "2026-08-12T00:00:00.000Z",
      expires_at: "2026-08-30T00:00:00.000Z",
      evaluated_at: "2026-08-13T12:00:00.000Z",
      authority_granted: false,
      material_automation_allowed: false,
    };
    const context = buildP4CanonicalContext({
      brand: { id: "brand-private-id", is_demo: false },
      integration: { id: "integration-private-id", brand_id: "brand-private-id", status: "connected" },
      projection: {
        id: "projection-1",
        brand_id: "brand-private-id",
        integration_id: "integration-private-id",
        status: "CURRENT",
        source_type: "PAYMENTS_ANALYSIS_VERIFIED",
        source_fingerprint: "sha256-source",
        known_at: "2026-08-13T00:00:00.000Z",
        projection_version: "p4-bridge-1.0.0",
        observation_json: {
          observation_id: "observation-1",
          tenant_id: "p4_tenant_hmac",
          merchant_group_key: "p4_merchant_hmac",
          contract_group_key: "p4_contract_hmac",
          observed_at: "2026-08-12T00:00:00.000Z",
          market: "FR",
          provider: "stripe",
          product: "payments",
          channel: "ECOMMERCE",
          pricing_model: "BLENDED",
          fee_perimeter: "ALL_PROCESSING_FEES",
          currency: "EUR",
          source_population: "MERCHANT_OBSERVED",
          target_spec_id: "effective-rate",
          target_value: 170,
          tpv: 100000,
          transaction_count: 100,
          quality_weight: 1,
          card_mix: {},
          payment_method_mix: {},
          is_synthetic: false,
        },
      },
      deployment,
      prediction_time: "2026-08-13T12:00:00.000Z",
    });
    expect(context.tenant_scope_token).toBe("p4_tenant_hmac");
    expect(JSON.stringify(context)).not.toContain("brand-private-id");
    expect(JSON.stringify(context)).not.toContain("integration-private-id");
  });

  it("reconciles actual amount only with a final provider receipt reference", async () => {
    const svc = costService();
    const row = await settlePaidOperation(svc, reservation(), {
      ok: true,
      reconciled: true,
      amount_minor: 7,
      amount_quality: "PROVIDER_FINAL_RECEIPT",
      reconciliation_ref: "p4:receipt-1",
      usage_json: { provider_operation_id: "provider-operation-1" },
    });
    expect(row).toMatchObject({
      status: "RECONCILED",
      amount_minor: 7,
      usage_json: {
        reservation: true,
        reserved_amount_minor: 11,
        amount_quality: "PROVIDER_FINAL_RECEIPT",
        reconciliation_ref: "p4:receipt-1",
        provider_operation_id: "provider-operation-1",
      },
    });
  });

  it("retains the conservative reservation when actual-cost evidence is incomplete", async () => {
    const svc = costService();
    const row = await settlePaidOperation(svc, reservation(), {
      ok: true,
      reconciled: true,
      amount_minor: 2,
      amount_quality: "PROVIDER_FINAL_RECEIPT",
      reconciliation_ref: "",
    });
    expect(row).toMatchObject({
      status: "OBSERVED",
      amount_minor: 11,
      usage_json: { amount_quality: "CONSERVATIVE_RESERVATION" },
    });
    expect(row.usage_json.reconciliation_ref).toBeUndefined();
  });

  it("records reliable actual cost even when the paid HTTP operation failed", async () => {
    const svc = costService();
    const row = await settlePaidOperation(svc, reservation(), {
      ok: false,
      reconciled: true,
      amount_minor: 7,
      amount_quality: "PROVIDER_FINAL_RECEIPT",
      reconciliation_ref: "p4:receipt-1",
    });
    expect(row).toMatchObject({
      status: "FAILED",
      amount_minor: 7,
      usage_json: {
        reserved_amount_minor: 11,
        amount_quality: "PROVIDER_FINAL_RECEIPT",
        reconciliation_ref: "p4:receipt-1",
      },
    });
  });

  it("reserves with a stable key and blocks duplicates before the provider boundary", () => {
    const source = fs.readFileSync(
      "base44/functions/requestP4Estimate/entry.ts",
      "utf8",
    );
    const reserve = source.indexOf("await reservePaidOperation");
    const duplicate = source.indexOf("if (reservation.duplicate)");
    const providerGuard = source.indexOf("await guardReservedPaidProviderEffect");
    const providerTransport = source.indexOf("p4FetchWithCostReceipt(", providerGuard);
    expect(reserve).toBeGreaterThan(0);
    expect(duplicate).toBeGreaterThan(reserve);
    expect(providerGuard).toBeGreaterThan(duplicate);
    expect(providerTransport).toBeGreaterThan(providerGuard);
    expect(source).toContain("api:p4:estimate:${requestFingerprint}");
    expect(source).not.toContain("api:p4:estimate:${crypto.randomUUID()}");
    expect(source).toContain("duplicate_blocked: true");
    expect(source).toContain("review_required: true");
  });

  it("adds source guards for CPIC-AT-203/204/205 cache ordering, binding and billing", () => {
    const source = fs.readFileSync(
      "base44/functions/requestP4Estimate/entry.ts",
      "utf8",
    );
    const cache = source.indexOf("const cachedRows = await strictFilter");
    const credentials = source.indexOf("requireP4ServiceConfig();", cache);
    const reserve = source.indexOf("await reservePaidOperation", cache);
    const providerGuard = source.indexOf(
      "await guardReservedPaidProviderEffect",
      cache,
    );
    const providerTransport = source.indexOf(
      "p4FetchWithCostReceipt(",
      providerGuard,
    );
    expect(cache).toBeGreaterThan(0);
    expect(credentials).toBeGreaterThan(cache);
    expect(reserve).toBeGreaterThan(credentials);
    expect(providerGuard).toBeGreaterThan(reserve);
    expect(providerTransport).toBeGreaterThan(providerGuard);
    expect(source).toContain("paid_operation_executed: false");
    expect(source).toContain("cpic.p4.cache.accessed");
    expect(source).toContain("p4_cache_access_receipt_not_persisted");
    expect(source).toContain("buildP4CanonicalContext");
    expect(source).toContain("key !== \"prediction_time\"");
    expect(source).toContain("as_of_time: canonicalContext.evidence.available_at");
    expect(source).not.toContain("body.context");
  });

  it("settles every attempted provider call and never invents an actual amount without a receipt", () => {
    const source = fs.readFileSync(
      "base44/functions/requestP4Estimate/entry.ts",
      "utf8",
    );
    expect(source).toContain("await settlePaidOperation");
    expect(source).toContain('amount_quality: "PROVIDER_FINAL_RECEIPT"');
    expect(source).toContain('amount_quality: "CONSERVATIVE_RESERVATION"');
    expect(source).toContain("P4_COST_SETTLEMENT_NOT_PERSISTED");
    expect(source).toContain(
      'actual_cost_reconciled: costEvent.status === "RECONCILED"',
    );
  });
});
