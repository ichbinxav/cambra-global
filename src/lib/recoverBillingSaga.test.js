import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  appendPaymentEventOnce,
  appendRecoverBillingReceipt,
  assertRecoverBillingActivationProjection,
  assertRecoverInvoiceProjectionMonotonic,
  claimRecoverInvoiceDraft,
  convergeRecoverBillingWebhook,
  convergeRecoverInvoiceIssuance,
  executeRecoverBillingProviderRequest,
  readRecoverBillingSagaReceipts,
  recoverBillingCasUpdatedCount,
  recoverBillingSagaState,
  recoverReportProjectionForInvoiceStatus,
  recoverStripeBillingRequest,
  validateStripeWebhookInvoiceEventBinding,
} from "../../base44/shared/economicExecution.ts";

const read = (path) =>
  fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const STEPS = [
  ["create invoice", "stripe_billing:create_invoice:r1", "r4:inv:create:r1", {
    id: "in_1",
    object: "invoice",
    status: "draft",
    customer: "cus_1",
    currency: "eur",
    metadata: { local_invoice_id: "i1", monthly_savings_report_id: "r1" },
  }],
  [
    "create line item",
    "stripe_billing:create_invoice_item:r1",
    "r4:inv:item:r1",
    {
      id: "ii_1",
      object: "invoiceitem",
      invoice: "in_1",
      customer: "cus_1",
      amount: 1000,
      currency: "eur",
    },
  ],
  ["set reverse tax", "stripe_billing:reverse_tax:r1", "r4:tax-exempt:r1", {
    id: "cus_1",
    object: "customer",
    tax_exempt: "reverse",
  }],
  ["attach tax id", "stripe_billing:attach_tax_id:r1", "r4:taxid:b1", {
    id: "txi_1",
    object: "tax_id",
    customer: "cus_1",
    type: "eu_vat",
    value: "ESX",
  }],
  ["finalize invoice", "stripe_billing:finalize_invoice:r1", "r4:inv:fin:r1", {
    id: "in_1",
    object: "invoice",
    status: "open",
    number: "CAMBRA-1",
    due_date: 1_787_875_200,
    hosted_invoice_url: "https://invoice.stripe.test/i",
    invoice_pdf: "https://invoice.stripe.test/i.pdf",
    payment_intent: "pi_1",
    customer: "cus_1",
    total: 1234,
    currency: "eur",
    metadata: { local_invoice_id: "i1", monthly_savings_report_id: "r1" },
  }],
];

const EPOCH = {
  control_id: "ec1",
  control_revision: 1,
  capabilities: ["billing_issuance"],
  captured_at: "2026-08-13T00:00:00.000Z",
  state: { control_available: true, control_id: "ec1", control_revision: 1 },
};

const pathFor = (effectKey) =>
  effectKey.includes("create_invoice_item:")
    ? "invoiceitems"
    : effectKey.includes("create_invoice:")
    ? "invoices"
    : effectKey.includes("reverse_tax:")
    ? "customers/cus_1"
    : effectKey.includes("attach_tax_id:")
    ? "customers/cus_1/tax_ids"
    : "invoices/in_1/finalize";

const paramsFor = (effectKey) =>
  effectKey.includes("create_invoice_item:")
    ? { customer: "cus_1", invoice: "in_1", amount: "1000", currency: "eur" }
    : effectKey.includes("create_invoice:")
    ? {
      customer: "cus_1",
      currency: "eur",
      "metadata[local_invoice_id]": "i1",
      "metadata[monthly_savings_report_id]": "r1",
    }
    : effectKey.includes("reverse_tax:")
    ? { tax_exempt: "reverse" }
    : effectKey.includes("attach_tax_id:")
    ? { type: "eu_vat", value: "ESX" }
    : { auto_advance: "true" };

const responseBindingFor = (effectKey) =>
  effectKey.includes("create_invoice_item:")
    ? {
      customer_id: "cus_1",
      parent_invoice_id: "in_1",
      amount_minor: 1000,
      currency: "eur",
    }
    : effectKey.includes("create_invoice:")
    ? {
      customer_id: "cus_1",
      currency: "eur",
      metadata: {
        local_invoice_id: "i1",
        monthly_savings_report_id: "r1",
      },
    }
    : effectKey.includes("reverse_tax:")
    ? { object_id: "cus_1" }
    : effectKey.includes("attach_tax_id:")
    ? { customer_id: "cus_1" }
    : {
      object_id: "in_1",
      customer_id: "cus_1",
      total_minor: 1234,
      currency: "eur",
      allowed_statuses: ["open", "paid"],
      require_number: true,
      metadata: {
        local_invoice_id: "i1",
        monthly_savings_report_id: "r1",
      },
    };

const requestInput = (
  effectKey,
  idempotencyKey,
  transport,
  now = clock(),
  params = null,
) => ({
  effect_key: effectKey,
  request: recoverStripeBillingRequest({
    mode: "test",
    method: "POST",
    path: pathFor(effectKey),
    params: params || paramsFor(effectKey),
    idempotency_key: idempotencyKey,
    response_binding: responseBindingFor(effectKey),
  }),
  emergency_epoch_claim: EPOCH,
  transport,
  now,
});

function service(options = {}) {
  const events = [];
  const invoice = {
    id: "i1",
    status: options.initialInvoiceStatus || "draft",
    execution_key: "recover-invoice:r1",
    monthly_savings_report_id: "r1",
    reconciliation_status: "pending",
  };
  const report = {
    id: "r1",
    status: options.initialReportStatus || "calculated",
    verification_status: options.initialReportVerification || "realized",
    billing_eligibility_status: "invoice_claimed",
    invoice_id: "i1",
    invoice_claim_token: "owner",
    invoice_claim_expires_at: "2099-01-01T00:00:00.000Z",
  };
  const activation = {
    id: "a1",
    status: options.initialActivationStatus || "live",
    first_invoice_issued_at: "",
  };
  let sequence = 0;
  let failedEvent = false;
  let reportCasCalls = 0;
  let deletes = 0;
  let invoiceRaceInjected = false;
  let activationRaceInjected = false;
  let reportCasRaceInjected = false;
  let reportFilterCalls = 0;
  const svc = {
    entities: {
      EmergencyControl: {
        filter: async () => [{
          id: "ec1",
          control_key: "global",
          control_revision: 1,
          safe_mode: false,
          communications_paused: false,
          negotiations_paused: false,
          migrations_paused: false,
          billing_issuance_paused: false,
          paid_discovery_paused: false,
        }],
      },
      MonthlySavingsReport: {
        filter: async ({ id }) => {
          reportFilterCalls += 1;
          if (typeof options.onReportFilter === "function") {
            options.onReportFilter({ report, call: reportFilterCalls });
          }
          return id === report.id ? [{ ...report }] : [];
        },
        updateMany: async (filter, update) => {
          reportCasCalls += 1;
          if (
            typeof options.beforeReportCas === "function" &&
            !reportCasRaceInjected
          ) {
            const injected = options.beforeReportCas({
              report,
              invoice,
              filter,
              update,
            });
            if (injected !== false) reportCasRaceInjected = true;
          }
          for (const [key, value] of Object.entries(filter)) {
            if (String(report[key] ?? "") !== String(value ?? "")) {
              return {
                updated: 0,
              };
            }
          }
          Object.assign(report, update.$set);
          return { updated: 1 };
        },
        update: async (id, patch) => {
          if (id !== report.id) throw new Error("report_not_found");
          Object.assign(report, patch);
          return { ...report };
        },
      },
      Invoice: {
        filter: async (filter) =>
          filter.id === invoice.id ? [{ ...invoice }] : [],
        updateMany: async (filter, update) => {
          if (options.invoiceConcurrentStatus && !invoiceRaceInjected) {
            invoiceRaceInjected = true;
            invoice.status = options.invoiceConcurrentStatus;
          }
          for (const [key, value] of Object.entries(filter)) {
            if (String(invoice[key] ?? "") !== String(value ?? "")) {
              return {
                success: true,
                updated: 0,
              };
            }
          }
          Object.assign(invoice, update.$set);
          return { success: true, updated: 1 };
        },
        update: async (id, patch) => {
          if (id !== invoice.id) throw new Error("invoice_not_found");
          Object.assign(invoice, patch);
          return { ...invoice };
        },
        create: async (record) => Object.assign(invoice, record),
        delete: async () => {
          throw new Error("invoice_delete_not_expected");
        },
      },
      DealActivation: {
        filter: async ({ id }) =>
          id === activation.id ? [{ ...activation }] : [],
        updateMany: async (filter, update) => {
          if (
            options.activationConcurrentStatus && !activationRaceInjected
          ) {
            activationRaceInjected = true;
            activation.status = options.activationConcurrentStatus;
          }
          for (const [key, value] of Object.entries(filter)) {
            if (String(activation[key] ?? "") !== String(value ?? "")) {
              return {
                success: true,
                updated: 0,
              };
            }
          }
          Object.assign(activation, update.$set);
          return { success: true, updated: 1 };
        },
        update: async (id, patch) => {
          if (id !== activation.id) throw new Error("activation_not_found");
          Object.assign(activation, patch);
          return { ...activation };
        },
      },
      PaymentEvent: {
        filter: async (filter) =>
          events.filter((row) =>
            (!filter.invoice_id || row.invoice_id === filter.invoice_id) &&
            (!filter.event_hash || row.event_hash === filter.event_hash)
          ),
        create: async (record) => {
          if (record.event_type === options.failEventType && !failedEvent) {
            failedEvent = true;
            throw new Error("receipt_store_failed");
          }
          const row = {
            id: `pe${++sequence}`,
            created_date: `2026-08-13T00:00:${
              String(sequence).padStart(2, "0")
            }.000Z`,
            ...structuredClone(record),
          };
          events.push(row);
          if (typeof options.afterPaymentEventCreate === "function") {
            await options.afterPaymentEventCreate({
              event: row,
              report,
              invoice,
            });
          }
          if (options.injectExactDuplicate === true) {
            events.push({ ...structuredClone(row), id: `pe${++sequence}` });
          }
          return row;
        },
        delete: async () => {
          deletes += 1;
        },
      },
    },
  };
  return {
    svc,
    events,
    report,
    invoice,
    activation,
    claim: { acquired: true, claim_token: "owner", invoice },
    reportCasCalls: () => reportCasCalls,
    deletes: () => deletes,
  };
}

function clock() {
  let tick = Date.parse("2026-08-13T10:00:00.000Z");
  return () => new Date(tick++).toISOString();
}

const receiptRequest = (idempotencyKey = "r4:inv:create:r1") =>
  recoverStripeBillingRequest({
    mode: "test",
    method: "POST",
    path: "invoices",
    params: { stable: "yes" },
    idempotency_key: idempotencyKey,
  });

const issuanceInput = (suffix = "base") => ({
  invoice_patch: {
    status: "issued",
    stripe_invoice_id: "in_1",
    invoice_number: "CAMBRA-1",
    invoice_snapshot_hash: "snap-1",
  },
  invoice_readback: {
    status: "issued",
    stripe_invoice_id: "in_1",
    invoice_number: "CAMBRA-1",
    invoice_snapshot_hash: "snap-1",
  },
  invoice_immutable_fields: [
    "stripe_invoice_id",
    "invoice_number",
    "invoice_snapshot_hash",
  ],
  event_hash: `p6:invoice-issued:i1:in_1:${suffix}`,
  event_record: {
    invoice_id: "i1",
    amount: 10,
    currency: "EUR",
    event_type: "invoice_issued",
    processor: "stripe",
    processor_ref: "in_1",
    occurred_at: "2026-08-13T10:00:00.000Z",
  },
  activation_id: "a1",
  activation_patch: {
    first_invoice_issued_at: "2026-08-13T10:00:00.000Z",
  },
  activation_readback: {
    first_invoice_issued_at: "2026-08-13T10:00:00.000Z",
  },
  report_patch: { status: "invoiced", verification_status: "invoiced" },
});

describe("Recover billing issuance saga", () => {
  it("revokes paid report evidence for dispute/refund/void projections", () => {
    expect(recoverReportProjectionForInvoiceStatus("paid")).toEqual({
      status: "paid",
      verification_status: "paid",
    });
    expect(recoverReportProjectionForInvoiceStatus("disputed")).toEqual({
      status: "invoiced",
      verification_status: "invoiced",
    });
    for (const status of ["refunded", "void"]) {
      expect(recoverReportProjectionForInvoiceStatus(status)).toEqual({
        status: "calculated",
        verification_status: "realized",
      });
    }
  });
  it("rejects negative or contradictory Base44 CAS authority responses", () => {
    expect(recoverBillingCasUpdatedCount({ success: false, updated: 1 }))
      .toBeNull();
    expect(recoverBillingCasUpdatedCount({ ok: false, updated: 1 })).toBeNull();
    expect(recoverBillingCasUpdatedCount({ success: true, updated: 1 })).toBe(
      1,
    );
    expect(recoverBillingCasUpdatedCount({ updated: 1, matched_count: 0 }))
      .toBeNull();
  });

  it("never lets signed webhook metadata cross-bind an invoice effect", () => {
    const invoice = {
      id: "local-1",
      stripe_invoice_id: "in_1",
      processor_payment_intent_id: "pi_1",
      stripe_charge_id: "ch_1",
    };
    expect(validateStripeWebhookInvoiceEventBinding(
      invoice,
      "invoice.paid",
      { id: "in_other", metadata: { local_invoice_id: "local-1" } },
      "in_other",
    )).toMatchObject({ ok: false, reasons: ["webhook_invoice_id_mismatch"] });
    expect(validateStripeWebhookInvoiceEventBinding(
      invoice,
      "credit_note.created",
      { invoice: "in_other", metadata: { local_invoice_id: "local-1" } },
      "in_other",
    )).toMatchObject({
      ok: false,
      reasons: ["webhook_credit_note_invoice_mismatch"],
    });
    expect(validateStripeWebhookInvoiceEventBinding(
      invoice,
      "charge.dispute.created",
      {
        payment_intent: "pi_other",
        charge: "ch_other",
        metadata: { local_invoice_id: "local-1" },
      },
      "",
    )).toMatchObject({
      ok: false,
      reasons: ["webhook_dispute_invoice_binding_missing_or_mismatch"],
    });
    expect(validateStripeWebhookInvoiceEventBinding(
      invoice,
      "charge.dispute.created",
      { payment_intent: "pi_1", metadata: { local_invoice_id: "local-1" } },
      "",
    )).toEqual({ ok: true, reasons: [] });
  });
  it.each(STEPS)(
    "%s persists immutable start/outcome receipts and replays without a second provider effect",
    async (_name, effectKey, idempotencyKey, data) => {
      const ctx = service();
      let providerCalls = 0;
      const effect = async () => {
        providerCalls += 1;
        return { ok: true, status: 200, data };
      };
      const input = requestInput(effectKey, idempotencyKey, effect);

      const first = await executeRecoverBillingProviderRequest(
        ctx.svc,
        ctx.claim,
        input,
      );
      const replay = await executeRecoverBillingProviderRequest(
        ctx.svc,
        ctx.claim,
        input,
      );

      expect(first).toEqual(replay);
      expect(providerCalls).toBe(1);
      const receipts = await readRecoverBillingSagaReceipts(ctx.svc, "i1");
      expect(receipts.map((receipt) => receipt.status)).toEqual([
        "EFFECT_STARTED",
        "OBSERVED",
      ]);
      expect(receipts[1].idempotency_key).toBe(idempotencyKey);
      expect(receipts[1].provider_object_id).toBe(data.id);
      expect(ctx.reportCasCalls()).toBe(2); // fence revalidated even on receipt replay
    },
  );

  it.each(STEPS)(
    "%s performs zero provider calls when the pre-effect receipt cannot persist",
    async (_name, effectKey, idempotencyKey, data) => {
      const ctx = service({ failEventType: "provider_effect_started" });
      let providerCalls = 0;
      await expect(
        executeRecoverBillingProviderRequest(
          ctx.svc,
          ctx.claim,
          requestInput(
            effectKey,
            idempotencyKey,
            async () => {
              providerCalls += 1;
              return { ok: true, status: 200, data };
            },
          ),
        ),
      ).rejects.toThrow("receipt_store_failed");
      expect(providerCalls).toBe(0);
      expect(ctx.events).toHaveLength(0);
    },
  );

  it.each(STEPS)(
    "%s quarantines provider success when its observed receipt cannot persist and never replays blindly",
    async (_name, effectKey, idempotencyKey, data) => {
      const ctx = service({ failEventType: "provider_effect_observed" });
      let providerCalls = 0;
      const effect = async () => {
        providerCalls += 1;
        return { ok: true, status: 200, data };
      };
      const input = requestInput(effectKey, idempotencyKey, effect);
      await expect(
        executeRecoverBillingProviderRequest(ctx.svc, ctx.claim, input),
      )
        .rejects.toMatchObject({
          code: "RECOVER_BILLING_REVIEW_REQUIRED",
          review_required: true,
        });
      await expect(
        executeRecoverBillingProviderRequest(ctx.svc, ctx.claim, input),
      )
        .rejects.toMatchObject({
          code: "RECOVER_BILLING_REVIEW_REQUIRED",
          review_required: true,
        });
      expect(providerCalls).toBe(1);
      const state = await recoverBillingSagaState(ctx.svc, "i1");
      expect(state.review_required).toBe(true);
      expect(state.review_effects).toContain(effectKey);
    },
  );

  it("hash-binds the complete Stripe request and quarantines a changed replay with zero transport", async () => {
    const ctx = service();
    let providerCalls = 0;
    const transport = async () => {
      providerCalls += 1;
      return {
        ok: true,
        status: 200,
        data: {
          id: "in_1",
          object: "invoice",
          customer: "cus_1",
          currency: "eur",
          metadata: {
            local_invoice_id: "i1",
            monthly_savings_report_id: "r1",
          },
        },
      };
    };
    await executeRecoverBillingProviderRequest(
      ctx.svc,
      ctx.claim,
      requestInput(
        "stripe_billing:create_invoice:r1",
        "r4:inv:create:r1",
        transport,
        clock(),
        { customer: "cus_1" },
      ),
    );
    await expect(
      executeRecoverBillingProviderRequest(
        ctx.svc,
        ctx.claim,
        requestInput(
          "stripe_billing:create_invoice:r1",
          "r4:inv:create:r1",
          transport,
          clock(),
          { customer: "cus_CHANGED" },
        ),
      ),
    ).rejects.toMatchObject({ code: "RECOVER_BILLING_REVIEW_REQUIRED" });
    expect(providerCalls).toBe(1);
    const state = await recoverBillingSagaState(ctx.svc, "i1");
    expect(state.latest_by_effect.get("stripe_billing:create_invoice:r1"))
      .toMatchObject({
        status: "REVIEW_REQUIRED",
        error_code: "request_descriptor_changed",
        sequence: 3,
      });
    expect(state.receipts[0].request_descriptor).toMatchObject({
      provider: "stripe",
      account_scope: "acct_1TqFip2Vr0WW305e",
      mode: "test",
      method: "POST",
      path: "invoices",
      params: { customer: "cus_1" },
      idempotency_key: "r4:inv:create:r1",
    });
  });

  it.each([400, 402, 409, 422, 500])(
    "treats HTTP %i as post-transport REVIEW_REQUIRED",
    async (status) => {
      const ctx = service();
      await expect(
        executeRecoverBillingProviderRequest(
          ctx.svc,
          ctx.claim,
          requestInput(
            "stripe_billing:create_invoice:r1",
            "r4:inv:create:r1",
            async () => ({
              ok: false,
              status,
              data: { error: { code: "declined" } },
            }),
          ),
        ),
      ).rejects.toMatchObject({ code: "RECOVER_BILLING_REVIEW_REQUIRED" });
      const state = await recoverBillingSagaState(ctx.svc, "i1");
      expect(state.latest_by_effect.get("stripe_billing:create_invoice:r1"))
        .toMatchObject({
          status: "REVIEW_REQUIRED",
          error_code: `provider_http_${status}`,
        });
      expect(
        state.receipts.some((receipt) =>
          receipt.status === "FAILED_PRE_EFFECT"
        ),
      ).toBe(false);
    },
  );

  it("records FAILED_PRE_EFFECT only when the emergency precheck proves transport never started", async () => {
    const ctx = service();
    ctx.svc.entities.EmergencyControl.filter = async () => [];
    let providerCalls = 0;
    await expect(
      executeRecoverBillingProviderRequest(
        ctx.svc,
        ctx.claim,
        requestInput(
          "stripe_billing:create_invoice:r1",
          "r4:inv:create:r1",
          async () => {
            providerCalls += 1;
            return {
              ok: true,
              status: 200,
              data: { id: "in_1", object: "invoice" },
            };
          },
        ),
      ),
    ).rejects.toMatchObject({
      code: "RECOVER_BILLING_FAILED_PRE_EFFECT",
      transport_started: false,
    });
    expect(providerCalls).toBe(0);
    const state = await recoverBillingSagaState(ctx.svc, "i1");
    expect(state.latest_by_effect.get("stripe_billing:create_invoice:r1"))
      .toMatchObject({
        status: "FAILED_PRE_EFFECT",
        error_code: "transport_not_started",
      });
  });

  it("detects tampering in content-addressed receipts before reconciliation", async () => {
    const ctx = service();
    const started = await appendRecoverBillingReceipt(ctx.svc, {
      invoice_id: "i1",
      report_id: "r1",
      effect_key: "stripe_billing:create_invoice:r1",
      status: "EFFECT_STARTED",
      sequence: 1,
      prior_receipt_hash: null,
      request_descriptor: receiptRequest(),
      observed_at: "2026-08-13T09:59:59.000Z",
    });
    await appendRecoverBillingReceipt(ctx.svc, {
      invoice_id: "i1",
      report_id: "r1",
      effect_key: "stripe_billing:create_invoice:r1",
      status: "OBSERVED",
      sequence: 2,
      prior_receipt_hash: started.receipt.receipt_hash,
      request_descriptor: receiptRequest(),
      provider_object_kind: "invoice",
      provider_object_id: "in_1",
      provider_result: {
        ok: true,
        status: 200,
        data: { id: "in_1", object: "invoice" },
      },
      observed_at: "2026-08-13T10:00:00.000Z",
    });
    ctx.events[0].metadata_json.immutable_receipt.provider_object_id =
      "in_tampered";
    await expect(readRecoverBillingSagaReceipts(ctx.svc, "i1")).rejects.toThrow(
      "recover_billing_receipt_integrity_failed",
    );
  });

  it("turns an expired post-effect lease into durable REVIEW_REQUIRED instead of takeover", async () => {
    const ctx = service();
    ctx.report.invoice_claim_expires_at = "2026-08-13T09:00:00.000Z";
    await appendRecoverBillingReceipt(ctx.svc, {
      invoice_id: "i1",
      report_id: "r1",
      effect_key: "stripe_billing:create_invoice:r1",
      status: "EFFECT_STARTED",
      sequence: 1,
      prior_receipt_hash: null,
      request_descriptor: receiptRequest(),
      observed_at: "2026-08-13T09:00:00.000Z",
    });
    const result = await claimRecoverInvoiceDraft(
      ctx.svc,
      "recover-invoice:r1",
      {
        monthly_savings_report_id: "r1",
        status: "draft",
      },
      { nowMs: Date.parse("2026-08-13T10:00:00.000Z") },
    );
    expect(result).toMatchObject({
      acquired: false,
      review_required: true,
      post_effect: true,
    });
    expect(ctx.report.invoice_claim_token).toBe("owner");
    expect(ctx.invoice.reconciliation_status).toBe("error");
    const state = await recoverBillingSagaState(ctx.svc, "i1");
    expect(state.review_effects).toContain("stripe_billing:create_invoice:r1");
  });

  it("reclaims an expired lease only when the provider outcome receipt is complete", async () => {
    const ctx = service();
    ctx.report.invoice_claim_expires_at = "2026-08-13T09:00:00.000Z";
    const base = {
      invoice_id: "i1",
      report_id: "r1",
      effect_key: "stripe_billing:create_invoice:r1",
      request_descriptor: receiptRequest(),
    };
    const started = await appendRecoverBillingReceipt(ctx.svc, {
      ...base,
      status: "EFFECT_STARTED",
      sequence: 1,
      prior_receipt_hash: null,
      observed_at: "2026-08-13T09:00:00.000Z",
    });
    await appendRecoverBillingReceipt(ctx.svc, {
      ...base,
      status: "OBSERVED",
      sequence: 2,
      prior_receipt_hash: started.receipt.receipt_hash,
      provider_object_kind: "invoice",
      provider_object_id: "in_1",
      provider_result: {
        ok: true,
        status: 200,
        data: { id: "in_1", object: "invoice" },
      },
      observed_at: "2026-08-13T09:00:01.000Z",
    });
    const result = await claimRecoverInvoiceDraft(
      ctx.svc,
      "recover-invoice:r1",
      {
        monthly_savings_report_id: "r1",
        status: "draft",
      },
      { nowMs: Date.parse("2026-08-13T10:00:00.000Z") },
    );
    expect(result).toMatchObject({ acquired: true, reclaimed: true });
    expect(ctx.report.invoice_claim_token).not.toBe("owner");
  });

  it.each([null, "", "not-an-iso-date"])(
    "treats an unknown claim lease (%s) as REVIEW_REQUIRED without takeover",
    async (lease) => {
      const ctx = service();
      ctx.report.invoice_claim_expires_at = lease;
      const result = await claimRecoverInvoiceDraft(
        ctx.svc,
        "recover-invoice:r1",
        {
          monthly_savings_report_id: "r1",
          status: "draft",
        },
        { nowMs: Date.parse("2026-08-13T10:00:00.000Z") },
      );
      expect(result).toMatchObject({ acquired: false, review_required: true });
      expect(ctx.report.invoice_claim_token).toBe("owner");
      expect(ctx.invoice.last_error).toBe(
        "recover_invoice_claim_lease_unknown_review_required",
      );
    },
  );

  it("fails closed on contradictory CAS counters", async () => {
    const ctx = service();
    ctx.svc.entities.MonthlySavingsReport.updateMany = async (
      _filter,
      update,
    ) => {
      Object.assign(ctx.report, update.$set);
      return { updated: 1, modified_count: 0, matched_count: 1 };
    };
    await expect(
      executeRecoverBillingProviderRequest(
        ctx.svc,
        ctx.claim,
        requestInput(
          "stripe_billing:create_invoice:r1",
          "r4:inv:create:r1",
          async () => ({
            ok: true,
            status: 200,
            data: { id: "in_1", object: "invoice" },
          }),
        ),
      ),
    )
      .rejects.toThrow("recover_invoice_claim_lost_before_provider_effect");
    expect(ctx.events).toHaveLength(0);
  });

  it("binds reclaim CAS to the exact expired lease snapshot", async () => {
    const ctx = service({
      beforeReportCas: ({ report }) => {
        // The original owner renewed after the reclaimer read expiry but before
        // its CAS. Exact lease binding must make the reclaim lose.
        report.invoice_claim_expires_at = "2026-08-13T11:00:00.000Z";
      },
    });
    ctx.report.invoice_claim_expires_at = "2026-08-13T09:00:00.000Z";

    const result = await claimRecoverInvoiceDraft(
      ctx.svc,
      "recover-invoice:r1",
      { monthly_savings_report_id: "r1", status: "draft" },
      { nowMs: Date.parse("2026-08-13T10:00:00.000Z") },
    );

    expect(result).toMatchObject({ acquired: false, in_progress: true });
    expect(ctx.report.invoice_claim_token).toBe("owner");
    expect(ctx.report.invoice_claim_expires_at).toBe(
      "2026-08-13T11:00:00.000Z",
    );
  });

  it("does not renew an expired owner or reach receipts/transport", async () => {
    const ctx = service();
    ctx.report.invoice_claim_expires_at = "2020-01-01T00:00:00.000Z";
    let providerCalls = 0;

    await expect(executeRecoverBillingProviderRequest(
      ctx.svc,
      ctx.claim,
      requestInput(
        "stripe_billing:create_invoice:r1",
        "r4:inv:create:r1",
        async () => {
          providerCalls += 1;
          return { ok: true, status: 200, data: {} };
        },
      ),
    )).rejects.toThrow("recover_invoice_claim_lost_before_provider_effect");

    expect(providerCalls).toBe(0);
    expect(ctx.events).toHaveLength(0);
  });

  it("stops a stale owner that loses its token after EFFECT_STARTED before transport", async () => {
    const ctx = service({
      afterPaymentEventCreate: ({ event, report }) => {
        if (event.event_type === "provider_effect_started") {
          report.invoice_claim_token = "takeover-owner";
          report.invoice_claim_expires_at = "2099-01-02T00:00:00.000Z";
        }
      },
    });
    let providerCalls = 0;

    await expect(executeRecoverBillingProviderRequest(
      ctx.svc,
      ctx.claim,
      requestInput(
        "stripe_billing:create_invoice:r1",
        "r4:inv:create:r1",
        async () => {
          providerCalls += 1;
          return { ok: true, status: 200, data: {} };
        },
      ),
    )).rejects.toMatchObject({
      code: "RECOVER_BILLING_REVIEW_REQUIRED",
      review_required: true,
    });

    expect(providerCalls).toBe(0);
    expect(ctx.events.map((event) => event.event_type)).toEqual([
      "provider_effect_started",
    ]);
    expect(ctx.report.invoice_claim_token).toBe("takeover-owner");
  });

  it("fails closed when receipt history reaches the bounded-read cap", async () => {
    const ctx = service();
    ctx.svc.entities.PaymentEvent.filter = async () =>
      Array.from({ length: 201 }, (_, index) => ({ id: `row-${index}` }));
    await expect(readRecoverBillingSagaReceipts(ctx.svc, "i1"))
      .rejects.toThrow(
        "recover_billing_receipt_history_truncated_review_required",
      );
  });

  it("requires an exact successful provider object receipt before OBSERVED can clear STARTED", async () => {
    const ctx = service();
    let providerCalls = 0;
    await expect(
      executeRecoverBillingProviderRequest(
        ctx.svc,
        ctx.claim,
        requestInput(
          "stripe_billing:create_invoice:r1",
          "r4:inv:create:r1",
          async () => {
            providerCalls += 1;
            return {
              ok: true,
              status: 200,
              data: { id: "ii_wrong_kind", object: "invoiceitem" },
            };
          },
        ),
      ),
    ).rejects.toMatchObject({ code: "RECOVER_BILLING_REVIEW_REQUIRED" });
    expect(providerCalls).toBe(1);
    const state = await recoverBillingSagaState(ctx.svc, "i1");
    expect(state.review_effects).toContain("stripe_billing:create_invoice:r1");
    expect(state.receipts.find((receipt) => receipt.status === "OBSERVED"))
      .toBeUndefined();
  });

  it.each([
    [
      "created invoice customer",
      "stripe_billing:create_invoice:r1",
      "r4:inv:create:r1",
      {
        id: "in_1",
        object: "invoice",
        customer: "cus_other",
        metadata: { local_invoice_id: "i1", monthly_savings_report_id: "r1" },
      },
    ],
    [
      "invoice-item parent",
      "stripe_billing:create_invoice_item:r1",
      "r4:inv:item:r1",
      {
        id: "ii_1",
        object: "invoiceitem",
        invoice: "in_other",
        customer: "cus_1",
      },
    ],
    [
      "invoice-item economics",
      "stripe_billing:create_invoice_item:r1",
      "r4:inv:item:r1",
      {
        id: "ii_1",
        object: "invoiceitem",
        invoice: "in_1",
        customer: "cus_1",
        amount: 999,
        currency: "usd",
      },
    ],
    [
      "finalized invoice path",
      "stripe_billing:finalize_invoice:r1",
      "r4:inv:fin:r1",
      { id: "in_other", object: "invoice", status: "open" },
    ],
    [
      "finalized invoice postcondition",
      "stripe_billing:finalize_invoice:r1",
      "r4:inv:fin:r1",
      {
        id: "in_1",
        object: "invoice",
        status: "draft",
        number: "",
        customer: "cus_1",
        total: 1234,
        currency: "eur",
        metadata: {
          local_invoice_id: "i1",
          monthly_savings_report_id: "r1",
        },
      },
    ],
    [
      "finalized invoice economics",
      "stripe_billing:finalize_invoice:r1",
      "r4:inv:fin:r1",
      {
        id: "in_1",
        object: "invoice",
        status: "open",
        number: "CAMBRA-1",
        customer: "cus_other",
        total: 999,
        currency: "usd",
        metadata: {
          local_invoice_id: "another",
          monthly_savings_report_id: "r1",
        },
      },
    ],
    [
      "customer update path",
      "stripe_billing:reverse_tax:r1",
      "r4:tax-exempt:r1",
      { id: "cus_other", object: "customer", tax_exempt: "reverse" },
    ],
    [
      "tax-id customer parent",
      "stripe_billing:attach_tax_id:r1",
      "r4:taxid:b1",
      {
        id: "txi_1",
        object: "tax_id",
        customer: "cus_other",
        type: "eu_vat",
        value: "ESX",
      },
    ],
  ])(
    "rejects a right-kind Stripe receipt bound to the wrong %s",
    async (_label, effectKey, idempotencyKey, data) => {
      const ctx = service();
      let providerCalls = 0;
      await expect(executeRecoverBillingProviderRequest(
        ctx.svc,
        ctx.claim,
        requestInput(effectKey, idempotencyKey, async () => {
          providerCalls += 1;
          return { ok: true, status: 200, data };
        }),
      )).rejects.toMatchObject({ code: "RECOVER_BILLING_REVIEW_REQUIRED" });
      expect(providerCalls).toBe(1);
      const state = await recoverBillingSagaState(ctx.svc, "i1");
      expect(state.review_effects).toContain(effectKey);
      expect(state.receipts.find((receipt) => receipt.status === "OBSERVED"))
        .toBeUndefined();
    },
  );

  it("uses the hash-chain sequence, not timestamps or row ids, to resolve the latest outcome", async () => {
    const ctx = service();
    const sameInstant = () => "2026-08-13T10:00:00.000Z";
    await executeRecoverBillingProviderRequest(
      ctx.svc,
      ctx.claim,
      requestInput(
        "stripe_billing:create_invoice:r1",
        "r4:inv:create:r1",
        async () => ({
          ok: true,
          status: 200,
          data: {
            id: "in_1",
            object: "invoice",
            customer: "cus_1",
            currency: "eur",
            metadata: {
              local_invoice_id: "i1",
              monthly_savings_report_id: "r1",
            },
          },
        }),
        sameInstant,
      ),
    );
    ctx.events.reverse();
    const state = await recoverBillingSagaState(ctx.svc, "i1");
    expect(state.latest_by_effect.get("stripe_billing:create_invoice:r1"))
      .toMatchObject({ status: "OBSERVED", sequence: 2 });
    expect(state.review_required).toBe(false);
  });

  it("rejects a forked receipt chain even when every individual receipt hash is valid", async () => {
    const ctx = service();
    const base = {
      invoice_id: "i1",
      report_id: "r1",
      effect_key: "stripe_billing:create_invoice:r1",
      request_descriptor: receiptRequest(),
    };
    const start = await appendRecoverBillingReceipt(ctx.svc, {
      ...base,
      status: "EFFECT_STARTED",
      sequence: 1,
      prior_receipt_hash: null,
      observed_at: "2026-08-13T10:00:00.000Z",
    });
    for (const [id, second] of [["in_1", "01"], ["in_2", "02"]]) {
      await appendRecoverBillingReceipt(ctx.svc, {
        ...base,
        status: "OBSERVED",
        sequence: 2,
        prior_receipt_hash: start.receipt.receipt_hash,
        provider_object_kind: "invoice",
        provider_object_id: id,
        provider_result: {
          ok: true,
          status: 200,
          data: { id, object: "invoice" },
        },
        observed_at: `2026-08-13T10:00:${second}.000Z`,
      });
    }
    await expect(readRecoverBillingSagaReceipts(ctx.svc, "i1"))
      .rejects.toThrow("recover_billing_receipt_fork_review_required");
  });

  it("preserves exact duplicate PaymentEvent evidence and rejects conflicting content", async () => {
    const ctx = service({ injectExactDuplicate: true });
    const result = await appendPaymentEventOnce(ctx.svc, "invoice-issued:i1", {
      invoice_id: "i1",
      amount: 10,
      currency: "EUR",
      event_type: "invoice_issued",
      processor: "stripe",
      processor_ref: "in_1",
      occurred_at: "2026-08-13T10:00:00.000Z",
      metadata_json: { number: "CAMBRA-1" },
    });
    expect(result.duplicate_rows).toBe(2);
    expect(ctx.events).toHaveLength(2);
    expect(ctx.deletes()).toBe(0);
    ctx.events[1].processor_ref = "in_conflict";
    const empty = service({ injectExactDuplicate: true });
    empty.svc.entities.PaymentEvent.create = async (record) => {
      empty.events.push(
        {
          id: "pe1",
          created_date: "2026-08-13T10:00:00.000Z",
          ...structuredClone(record),
        },
        {
          id: "pe2",
          created_date: "2026-08-13T10:00:01.000Z",
          ...structuredClone(record),
          processor_ref: "in_conflict",
        },
      );
      return empty.events[0];
    };
    await expect(appendPaymentEventOnce(empty.svc, "invoice-issued:i1", {
      invoice_id: "i1",
      amount: 10,
      currency: "EUR",
      event_type: "invoice_issued",
      processor: "stripe",
      processor_ref: "in_1",
      occurred_at: "2026-08-13T10:00:00.000Z",
    })).rejects.toThrow("payment_event_hash_conflict_review_required");
    expect(empty.deletes()).toBe(0);
  });

  it("validates preexisting PaymentEvent content and bounded reads before treating it as a replay", async () => {
    const ctx = service();
    ctx.events.push({
      id: "pe-old",
      created_date: "2026-08-13T09:00:00.000Z",
      invoice_id: "i1",
      event_hash: "invoice-issued:i1",
      amount: 10,
      currency: "EUR",
      event_type: "invoice_issued",
      processor: "stripe",
      processor_ref: "in_conflict",
      occurred_at: "2026-08-13T10:00:00.000Z",
      metadata_json: null,
    });
    await expect(appendPaymentEventOnce(ctx.svc, "invoice-issued:i1", {
      invoice_id: "i1",
      amount: 10,
      currency: "EUR",
      event_type: "invoice_issued",
      processor: "stripe",
      processor_ref: "in_1",
      occurred_at: "2026-08-13T10:00:00.000Z",
    })).rejects.toThrow("payment_event_hash_conflict_review_required");
    expect(ctx.events).toHaveLength(1);

    ctx.svc.entities.PaymentEvent.filter = async () =>
      Array.from({ length: 6 }, (_, index) => ({ id: `pe-${index}` }));
    await expect(appendPaymentEventOnce(ctx.svc, "invoice-issued:i1", {
      invoice_id: "i1",
      amount: 10,
      currency: "EUR",
      event_type: "invoice_issued",
      processor: "stripe",
      processor_ref: "in_1",
      occurred_at: "2026-08-13T10:00:00.000Z",
    })).rejects.toThrow("payment_event_history_truncated_review_required");
  });

  it.each([
    "after_invoice_readback",
    "after_invoice_event_readback",
    "after_activation_readback",
  ])(
    "resumes local issuance after %s and terminalizes the report last",
    async (crashStep) => {
      const ctx = service();
      let injected = false;
      const input = {
        invoice_patch: {
          status: "issued",
          stripe_invoice_id: "in_1",
          invoice_number: "CAMBRA-1",
          invoice_snapshot_hash: "snap-1",
        },
        invoice_readback: {
          status: "issued",
          stripe_invoice_id: "in_1",
          invoice_number: "CAMBRA-1",
          invoice_snapshot_hash: "snap-1",
        },
        invoice_immutable_fields: [
          "stripe_invoice_id",
          "invoice_number",
          "invoice_snapshot_hash",
        ],
        event_hash: "p6:invoice-issued:i1:in_1",
        event_record: {
          invoice_id: "i1",
          amount: 10,
          currency: "EUR",
          event_type: "invoice_issued",
          processor: "stripe",
          processor_ref: "in_1",
          metadata_json: { provider_receipt_hash: "receipt-1" },
          occurred_at: "2026-08-13T10:00:00.000Z",
        },
        activation_id: "a1",
        activation_patch: {
          first_invoice_issued_at: "2026-08-13T10:00:00.000Z",
        },
        activation_readback: {
          first_invoice_issued_at: "2026-08-13T10:00:00.000Z",
        },
        report_patch: { status: "invoiced", verification_status: "invoiced" },
        fault_injection: async (step) => {
          if (!injected && step === crashStep) {
            injected = true;
            throw new Error(`crash:${step}`);
          }
        },
      };
      await expect(convergeRecoverInvoiceIssuance(ctx.svc, ctx.claim, input))
        .rejects.toThrow(`crash:${crashStep}`);
      expect(ctx.report.billing_eligibility_status).toBe("invoice_claimed");
      await convergeRecoverInvoiceIssuance(ctx.svc, ctx.claim, {
        ...input,
        fault_injection: undefined,
      });
      expect(ctx.report).toMatchObject({
        billing_eligibility_status: "invoiced",
        status: "invoiced",
        verification_status: "invoiced",
      });
      expect(ctx.activation.first_invoice_issued_at).toBe(
        "2026-08-13T10:00:00.000Z",
      );
      expect(
        ctx.events.filter((event) => event.event_type === "invoice_issued"),
      ).toHaveLength(1);
    },
  );

  it.each(["due", "paid"])(
    "preserves a forward webhook status %s while completing issuance evidence",
    async (forwardStatus) => {
      const ctx = service({
        initialInvoiceStatus: forwardStatus,
        initialReportStatus: forwardStatus === "paid" ? "paid" : "invoiced",
        initialReportVerification: forwardStatus === "paid"
          ? "paid"
          : "invoiced",
      });
      await convergeRecoverInvoiceIssuance(ctx.svc, ctx.claim, {
        invoice_patch: {
          status: "issued",
          stripe_invoice_id: "in_1",
          invoice_number: "CAMBRA-1",
          invoice_snapshot_hash: "snap-1",
        },
        invoice_readback: {
          status: "issued",
          stripe_invoice_id: "in_1",
          invoice_number: "CAMBRA-1",
          invoice_snapshot_hash: "snap-1",
        },
        invoice_immutable_fields: [
          "stripe_invoice_id",
          "invoice_number",
          "invoice_snapshot_hash",
        ],
        event_hash: `p6:invoice-issued:i1:in_1:${forwardStatus}`,
        event_record: {
          invoice_id: "i1",
          amount: 10,
          currency: "EUR",
          event_type: "invoice_issued",
          processor: "stripe",
          processor_ref: "in_1",
          occurred_at: "2026-08-13T10:00:00.000Z",
        },
        activation_id: "a1",
        activation_patch: {
          first_invoice_issued_at: "2026-08-13T10:00:00.000Z",
        },
        activation_readback: {
          first_invoice_issued_at: "2026-08-13T10:00:00.000Z",
        },
        report_patch: { status: "invoiced", verification_status: "invoiced" },
      });
      expect(ctx.invoice).toMatchObject({
        status: forwardStatus,
        stripe_invoice_id: "in_1",
        invoice_number: "CAMBRA-1",
        invoice_snapshot_hash: "snap-1",
      });
      expect(ctx.report.billing_eligibility_status).toBe("invoiced");
      expect(ctx.report).toMatchObject({
        status: forwardStatus === "paid" ? "paid" : "invoiced",
        verification_status: forwardStatus === "paid" ? "paid" : "invoiced",
      });
      expect(ctx.events.filter((row) => row.event_type === "invoice_issued"))
        .toHaveLength(1);
    },
  );

  it.each([
    ["disputed", "invoiced", "invoiced"],
    ["refunded", "calculated", "realized"],
    ["void", "calculated", "realized"],
  ])(
    "repairs stale paid report evidence from authoritative Invoice %s on issuer resume",
    async (invoiceStatus, reportStatus, verificationStatus) => {
      const ctx = service({
        initialInvoiceStatus: invoiceStatus,
        initialReportStatus: "paid",
        initialReportVerification: "paid",
      });

      await convergeRecoverInvoiceIssuance(
        ctx.svc,
        ctx.claim,
        issuanceInput(`stale-paid-${invoiceStatus}`),
      );

      expect(ctx.invoice.status).toBe(invoiceStatus);
      expect(ctx.report).toMatchObject({
        billing_eligibility_status: "invoiced",
        status: reportStatus,
        verification_status: verificationStatus,
      });
    },
  );

  it("repairs report when Invoice advances between issuer derivation and finalize CAS", async () => {
    const ctx = service({
      initialInvoiceStatus: "paid",
      initialReportStatus: "paid",
      initialReportVerification: "paid",
      beforeReportCas: ({ invoice, update }) => {
        if (update?.$set?.billing_eligibility_status !== "invoiced") {
          return false;
        }
        invoice.status = "refunded";
        return true;
      },
    });

    const result = await convergeRecoverInvoiceIssuance(
      ctx.svc,
      ctx.claim,
      issuanceInput("issuer-finalize-race"),
    );

    expect(result.invoice.status).toBe("refunded");
    expect(ctx.report).toMatchObject({
      billing_eligibility_status: "invoiced",
      status: "calculated",
      verification_status: "realized",
    });
  });

  it.each([
    "after_webhook_invoice_readback",
    "after_webhook_event_readback",
    "after_webhook_report_readback",
    "after_webhook_activation_readback",
  ])(
    "resumes webhook projection after %s even when PaymentEvent exists",
    async (crashStep) => {
      const ctx = service();
      ctx.invoice.stripe_invoice_id = "in_1";
      let injected = false;
      const input = {
        invoice_id: "i1",
        invoice_patch: {
          status: "paid",
          stripe_event_last_processed: "evt_1",
          reconciliation_status: "drift_corrected",
        },
        invoice_readback: {
          status: "paid",
          stripe_event_last_processed: "evt_1",
          reconciliation_status: "drift_corrected",
        },
        event_hash: "p6:webhook:evt_1:i1",
        event_record: {
          invoice_id: "i1",
          amount: 10,
          currency: "EUR",
          event_type: "payment_succeeded",
          processor: "stripe",
          processor_ref: "in_1",
          processor_event_id: "evt_1",
          occurred_at: "2026-08-13T10:00:00.000Z",
        },
        report_id: "r1",
        report_patch: { status: "paid", verification_status: "paid" },
        report_readback: { status: "paid", verification_status: "paid" },
        activation_id: "a1",
        activation_patch: { status: "monetizing" },
        activation_readback: { status: "monetizing" },
        fault_injection: async (step) => {
          if (!injected && step === crashStep) {
            injected = true;
            throw new Error(`crash:${step}`);
          }
        },
      };
      await expect(convergeRecoverBillingWebhook(ctx.svc, input)).rejects
        .toThrow(`crash:${crashStep}`);
      await convergeRecoverBillingWebhook(ctx.svc, {
        ...input,
        fault_injection: undefined,
      });
      expect(ctx.invoice.status).toBe("paid");
      expect(ctx.report).toMatchObject({
        status: "paid",
        verification_status: "paid",
      });
      expect(ctx.activation.status).toBe("monetizing");
      expect(ctx.events.filter((event) => event.processor_event_id === "evt_1"))
        .toHaveLength(1);
    },
  );

  it("does not let a paused paid webhook resurrect report evidence after a stronger refund", async () => {
    const ctx = service();
    ctx.invoice.stripe_invoice_id = "in_1";
    let interleaved = false;
    const paid = {
      invoice_id: "i1",
      invoice_patch: {
        status: "paid",
        stripe_event_last_processed: "evt_paid",
      },
      invoice_readback: {
        status: "paid",
        stripe_event_last_processed: "evt_paid",
      },
      event_hash: "p6:webhook:evt_paid:i1:interleave",
      event_record: {
        invoice_id: "i1",
        amount: 10,
        currency: "EUR",
        event_type: "payment_succeeded",
        processor: "stripe",
        processor_ref: "in_1",
        processor_event_id: "evt_paid",
        occurred_at: "2026-08-13T10:00:00.000Z",
      },
      report_id: "r1",
      report_patch: { status: "paid", verification_status: "paid" },
      report_readback: { status: "paid", verification_status: "paid" },
      fault_injection: async (step) => {
        if (step !== "after_webhook_event_readback" || interleaved) return;
        interleaved = true;
        await convergeRecoverBillingWebhook(ctx.svc, {
          invoice_id: "i1",
          invoice_patch: {
            status: "refunded",
            stripe_event_last_processed: "evt_refund",
          },
          invoice_readback: {
            status: "refunded",
            stripe_event_last_processed: "evt_refund",
          },
          event_hash: "p6:webhook:evt_refund:i1:interleave",
          event_record: {
            invoice_id: "i1",
            amount: 10,
            currency: "EUR",
            event_type: "refund",
            processor: "stripe",
            processor_ref: "in_1",
            processor_event_id: "evt_refund",
            occurred_at: "2026-08-13T10:00:01.000Z",
          },
          report_id: "r1",
          report_patch: {
            status: "calculated",
            verification_status: "realized",
          },
          report_readback: {
            status: "calculated",
            verification_status: "realized",
          },
        });
      },
    };

    const result = await convergeRecoverBillingWebhook(ctx.svc, paid);

    expect(interleaved).toBe(true);
    expect(result.invoice.status).toBe("refunded");
    expect(ctx.invoice.status).toBe("refunded");
    expect(ctx.report).toMatchObject({
      status: "calculated",
      verification_status: "realized",
    });
    expect(ctx.events).toHaveLength(2);
  });

  it("webhook re-reads Stripe and converges instead of early-returning on existing evidence", () => {
    const source = read("base44/functions/stripeBillingWebhook/entry.ts");
    const dedupeRead = source.indexOf("readBoundedPaymentEvents");
    const stripeReadOffset = source.slice(dedupeRead).search(
      /stripeRequest\(\s*mode,\s*["']GET["']/,
    );
    const stripeRead = stripeReadOffset < 0
      ? -1
      : dedupeRead + stripeReadOffset;
    const converge = source.indexOf(
      "convergeRecoverBillingWebhook(svc",
      stripeRead,
    );
    expect(dedupeRead).toBeGreaterThan(-1);
    expect(stripeRead).toBeGreaterThan(dedupeRead);
    expect(converge).toBeGreaterThan(stripeRead);
    expect(source).not.toMatch(
      /if \(duplicate\?\.length\) return Response\.json/,
    );
  });

  it("routes the scheduled reconciler through the same durable convergence and immutable receipt path", () => {
    const source = read("base44/functions/reconcileRecoverBilling/entry.ts");
    expect(source).toContain("convergeRecoverBillingWebhook(svc");
    expect(source).toContain("convergeRecoverBillingWebhookMismatch(svc");
    expect(source).toMatch(/event_type:\s*["']reconciliation_observed["']/);
    expect(source).toContain("readBoundedPaymentEvents");
    expect(source).not.toMatch(/svc\.entities\.Invoice\.update\(inv\.id/);
    expect(source).not.toMatch(
      /if \(projection\.changed\)[\s\S]{0,200}PaymentEvent\.create/,
    );
  });

  it("never lets a stale webhook projection overwrite a concurrent disputed invoice", async () => {
    const ctx = service({ invoiceConcurrentStatus: "disputed" });
    await expect(convergeRecoverBillingWebhook(ctx.svc, {
      invoice_id: "i1",
      invoice_patch: {
        status: "paid",
        stripe_event_last_processed: "evt_paid",
      },
      invoice_readback: {
        status: "paid",
        stripe_event_last_processed: "evt_paid",
      },
      event_hash: "p6:webhook:evt_paid:i1",
      event_record: {
        invoice_id: "i1",
        amount: 10,
        currency: "EUR",
        event_type: "payment_succeeded",
        processor: "stripe",
        processor_ref: "in_1",
        processor_event_id: "evt_paid",
        occurred_at: "2026-08-13T10:00:00.000Z",
      },
    })).rejects.toMatchObject({ code: "RECOVER_BILLING_REVIEW_REQUIRED" });
    expect(ctx.invoice.status).toBe("disputed");
    expect(ctx.events).toHaveLength(0);
  });

  it("rejects an already-disputed authority before applying a stale paid projection", async () => {
    const ctx = service({ initialInvoiceStatus: "disputed" });
    await expect(convergeRecoverBillingWebhook(ctx.svc, {
      invoice_id: "i1",
      invoice_patch: {
        status: "paid",
        stripe_event_last_processed: "evt_stale_paid",
      },
      invoice_readback: {
        status: "paid",
        stripe_event_last_processed: "evt_stale_paid",
      },
      event_hash: "p6:webhook:evt_stale_paid:i1",
      event_record: {
        invoice_id: "i1",
        amount: 10,
        currency: "EUR",
        event_type: "payment_succeeded",
        processor: "stripe",
        processor_ref: "in_1",
        processor_event_id: "evt_stale_paid",
        occurred_at: "2026-08-13T10:00:00.000Z",
      },
    })).rejects.toMatchObject({ code: "RECOVER_BILLING_REVIEW_REQUIRED" });
    expect(ctx.invoice.status).toBe("disputed");
    expect(ctx.events).toHaveLength(0);
  });

  it("permits only explicit forward invoice lifecycle transitions", () => {
    expect(() =>
      assertRecoverInvoiceProjectionMonotonic({ status: "due" }, {
        status: "paid",
      })
    ).not.toThrow();
    expect(() =>
      assertRecoverInvoiceProjectionMonotonic({ status: "paid" }, {
        status: "disputed",
      })
    ).not.toThrow();
    expect(() =>
      assertRecoverInvoiceProjectionMonotonic({ status: "disputed" }, {
        status: "paid",
      })
    )
      .toThrow(
        "recover_invoice_status_transition_requires_reconciliation:disputed:paid",
      );
    expect(() =>
      assertRecoverInvoiceProjectionMonotonic({ status: "refunded" }, {
        status: "due",
      })
    )
      .toThrow(
        "recover_invoice_status_transition_requires_reconciliation:refunded:due",
      );
  });

  it("never resurrects an activation cancelled before the convergence read", async () => {
    const ctx = service({ initialActivationStatus: "cancelled" });
    await expect(convergeRecoverBillingWebhook(ctx.svc, {
      invoice_id: "i1",
      invoice_patch: {
        status: "paid",
        stripe_event_last_processed: "evt_activation_stale",
      },
      invoice_readback: {
        status: "paid",
        stripe_event_last_processed: "evt_activation_stale",
      },
      event_hash: "p6:webhook:evt_activation_stale:i1",
      event_record: {
        invoice_id: "i1",
        amount: 10,
        currency: "EUR",
        event_type: "payment_succeeded",
        processor: "stripe",
        processor_ref: "in_1",
        processor_event_id: "evt_activation_stale",
        occurred_at: "2026-08-13T10:00:00.000Z",
      },
      activation_id: "a1",
      activation_patch: { status: "monetizing" },
      activation_readback: { status: "monetizing" },
    })).rejects.toMatchObject({ code: "RECOVER_BILLING_REVIEW_REQUIRED" });
    expect(ctx.activation.status).toBe("cancelled");
  });

  it("never resurrects an activation cancelled between read and CAS", async () => {
    const ctx = service({ activationConcurrentStatus: "cancelled" });
    await expect(convergeRecoverBillingWebhook(ctx.svc, {
      invoice_id: "i1",
      invoice_patch: {
        status: "paid",
        stripe_event_last_processed: "evt_activation_race",
      },
      invoice_readback: {
        status: "paid",
        stripe_event_last_processed: "evt_activation_race",
      },
      event_hash: "p6:webhook:evt_activation_race:i1",
      event_record: {
        invoice_id: "i1",
        amount: 10,
        currency: "EUR",
        event_type: "payment_succeeded",
        processor: "stripe",
        processor_ref: "in_1",
        processor_event_id: "evt_activation_race",
        occurred_at: "2026-08-13T10:00:00.000Z",
      },
      activation_id: "a1",
      activation_patch: { status: "monetizing" },
      activation_readback: { status: "monetizing" },
    })).rejects.toMatchObject({ code: "RECOVER_BILLING_REVIEW_REQUIRED" });
    expect(ctx.activation.status).toBe("cancelled");
  });

  it("allows only the exact live-to-monetizing billing activation transition", () => {
    expect(() =>
      assertRecoverBillingActivationProjection(
        { status: "live" },
        { status: "monetizing" },
      )
    ).not.toThrow();
    expect(() =>
      assertRecoverBillingActivationProjection(
        { status: "cancelled" },
        { status: "monetizing" },
      )
    ).toThrow(
      "recover_billing_activation_transition_requires_reconciliation:cancelled:monetizing",
    );
  });

  it("does not classify an ambiguous finalize CAS as replay success", async () => {
    const ctx = service();
    const { finalizeRecoverInvoiceClaim } = await import(
      "../../base44/shared/economicExecution.ts"
    );
    ctx.svc.entities.MonthlySavingsReport.updateMany = async (
      _filter,
      update,
    ) => {
      Object.assign(ctx.report, update.$set);
      return { updated: 1, modified_count: 0 };
    };
    await expect(
      finalizeRecoverInvoiceClaim(ctx.svc, ctx.claim, { status: "invoiced" }),
    )
      .rejects.toThrow("recover_invoice_finalize_cas_result_ambiguous");
  });

  it("wires every issuer effect through the durable saga and exposes review-required outcomes", () => {
    const source = read(
      "base44/functions/createEligibleRecoverInvoices/entry.ts",
    );
    expect(source).toContain("executeRecoverBillingProviderRequest");
    expect(source).toContain("recoverStripeBillingRequest");
    expect(source).not.toContain("claimedStripeEffect");
    expect(source).toContain("effect_key: `stripe_billing:${effectKey}`");
    expect(source).toMatch(
      /outcome\.error\s*=\s*["']recover_invoice_effect_unknown_review_required["']/,
    );
    for (const [, effectKey, idempotencyKey] of STEPS) {
      expect(source).toContain(
        effectKey.replace("stripe_billing:", "").replace(
          ":r1",
          ":${report.id}",
        ),
      );
      expect(source).toContain(
        idempotencyKey.replace(":r1", ":${report.id}").replace(
          ":b1",
          ":${brand.id}",
        ),
      );
    }
  });
});
