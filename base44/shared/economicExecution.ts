// economicExecution.ts — CAMBRA v0.65.0 / ECL P6
//
// Shared execution/reconciliation primitives for Recover invoices. P6 starts
// AFTER P5 has authorized the economic effect. This module never decides
// whether money may be charged; it makes an already-authorized execution
// replay-safe and makes the local Invoice/PaymentEvent mirror converge on
// Stripe's authoritative state.
//
import {
  type EmergencyEpochClaim,
  guardedEmergencyEffect,
} from "./operationalControl.ts";
import {
  expectedAccountId,
  type StripeMode,
  stripeRequest,
} from "./stripeBilling.ts";

// Base44 currently exposes no unique constraint / atomic upsert. MonthlySavingsReport
// is therefore the authority row for invoice execution: an updateMany CAS moves
// eligible -> invoice_claimed and binds exactly one local Invoice + lease token
// before Stripe is touched. Stripe idempotency remains the external exactly-once
// authority, while the report claim prevents concurrent callers reaching it.

export const RECOVER_EXECUTION_VERSION = "recover-execution-1";
// v3 adds a hash-bound provider response contract (parent/economics/legal
// finalize postconditions). Older receipt shapes are intentionally not
// promoted: they require explicit reconciliation under the new contract.
export const RECOVER_BILLING_SAGA_VERSION = "recover-billing-saga-3";
const RECOVER_INVOICE_CLAIM_LEASE_MS = 15 * 60_000;

export type RecoverBillingProviderRequestDescriptor = {
  provider: "stripe";
  account_scope: string;
  mode: StripeMode;
  method: "GET" | "POST";
  path: string;
  params: Record<string, string> | null;
  idempotency_key: string | null;
  response_binding: RecoverBillingProviderResponseBinding;
};

export type RecoverBillingProviderResponseBinding = {
  object_id: string | null;
  customer_id: string | null;
  parent_invoice_id: string | null;
  amount_minor: number | null;
  total_minor: number | null;
  currency: string | null;
  allowed_statuses: string[];
  require_number: boolean;
  metadata: Record<string, string> | null;
};

export type RecoverBillingReceiptStatus =
  | "EFFECT_STARTED"
  | "OBSERVED"
  | "FAILED_PRE_EFFECT"
  | "REVIEW_REQUIRED";

const RECEIPT_EVENT_TYPE: Record<RecoverBillingReceiptStatus, string> = {
  EFFECT_STARTED: "provider_effect_started",
  OBSERVED: "provider_effect_observed",
  FAILED_PRE_EFFECT: "provider_effect_failed_pre_effect",
  REVIEW_REQUIRED: "saga_review_required",
};

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${
    Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")
  }}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function recoverStripeBillingRequest(input: {
  mode: StripeMode;
  method: "GET" | "POST";
  path: string;
  params?: Record<string, string> | null;
  idempotency_key?: string | null;
  response_binding?: Partial<RecoverBillingProviderResponseBinding> | null;
}): RecoverBillingProviderRequestDescriptor {
  const mode = input?.mode;
  if (mode !== "test" && mode !== "live") {
    throw new Error("recover_billing_request_mode_invalid");
  }
  const method = input?.method;
  if (method !== "GET" && method !== "POST") {
    throw new Error("recover_billing_request_method_invalid");
  }
  const path = String(input?.path || "").trim().replace(/^\/+/, "");
  if (!path || /[?#]/.test(path)) {
    throw new Error("recover_billing_request_path_invalid");
  }
  const sourceParams = input?.params ?? null;
  const params = sourceParams === null ? null : Object.fromEntries(
    Object.keys(sourceParams).sort().map((key) => {
      const value = sourceParams[key];
      if (typeof value !== "string") {
        throw new Error("recover_billing_request_param_invalid");
      }
      return [key, value];
    }),
  );
  const idempotencyKey =
    input?.idempotency_key === null || input?.idempotency_key === undefined
      ? null
      : String(input.idempotency_key).trim();
  if (method === "POST" && !idempotencyKey) {
    throw new Error("recover_billing_request_idempotency_key_required");
  }
  const bindingInput = input?.response_binding || {};
  const bindingString = (value: unknown, lower = false) => {
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).trim();
    if (!normalized) {
      throw new Error("recover_billing_response_binding_invalid");
    }
    return lower ? normalized.toLowerCase() : normalized;
  };
  const bindingInteger = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const normalized = Number(value);
    if (!Number.isSafeInteger(normalized) || normalized < 0) {
      throw new Error("recover_billing_response_binding_amount_invalid");
    }
    return normalized;
  };
  const statuses = Array.isArray(bindingInput.allowed_statuses)
    ? [
      ...new Set(
        bindingInput.allowed_statuses.map((value) =>
          String(value || "").trim().toLowerCase()
        ).filter(Boolean),
      ),
    ].sort()
    : [];
  if (statuses.length > 12) {
    throw new Error("recover_billing_response_binding_statuses_invalid");
  }
  const sourceMetadata = bindingInput.metadata ?? null;
  const metadata = sourceMetadata === null ? null : Object.fromEntries(
    Object.keys(sourceMetadata).sort().map((key) => {
      const value = sourceMetadata[key];
      if (typeof value !== "string" || !key.trim()) {
        throw new Error("recover_billing_response_binding_metadata_invalid");
      }
      return [key, value];
    }),
  );
  const responseBinding: RecoverBillingProviderResponseBinding = {
    object_id: bindingString(bindingInput.object_id),
    customer_id: bindingString(bindingInput.customer_id),
    parent_invoice_id: bindingString(bindingInput.parent_invoice_id),
    amount_minor: bindingInteger(bindingInput.amount_minor),
    total_minor: bindingInteger(bindingInput.total_minor),
    currency: bindingString(bindingInput.currency, true),
    allowed_statuses: statuses,
    require_number: bindingInput.require_number === true,
    metadata,
  };
  return {
    provider: "stripe",
    account_scope: expectedAccountId(mode),
    mode,
    method,
    path,
    params,
    idempotency_key: idempotencyKey,
    response_binding: responseBinding,
  };
}

function normalizeRecoverBillingProviderRequest(
  input: any,
): RecoverBillingProviderRequestDescriptor {
  if (input?.provider !== "stripe") {
    throw new Error("recover_billing_request_provider_invalid");
  }
  const normalized = recoverStripeBillingRequest({
    mode: input?.mode,
    method: input?.method,
    path: input?.path,
    params: input?.params ?? null,
    idempotency_key: input?.idempotency_key ?? null,
    response_binding: input?.response_binding ?? null,
  });
  if (String(input?.account_scope || "") !== normalized.account_scope) {
    throw new Error("recover_billing_request_account_scope_invalid");
  }
  return normalized;
}

export async function recoverBillingRequestFingerprint(
  input: any,
): Promise<string> {
  return sha256(stableStringify(normalizeRecoverBillingProviderRequest(input)));
}

async function normalizedReceipt(input: any) {
  const invoiceId = String(input?.invoice_id || "").trim();
  const reportId = String(input?.report_id || "").trim();
  const effectKey = String(input?.effect_key || "").trim();
  const status = String(input?.status || "") as RecoverBillingReceiptStatus;
  const observedAt = String(input?.observed_at || "").trim();
  if (
    !invoiceId || !reportId || !effectKey || !observedAt ||
    !(status in RECEIPT_EVENT_TYPE)
  ) {
    throw new Error("recover_billing_receipt_invalid");
  }
  if (!Number.isFinite(new Date(observedAt).getTime())) {
    throw new Error("recover_billing_receipt_time_invalid");
  }
  const sequence = Number(input?.sequence);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99) {
    throw new Error("recover_billing_receipt_sequence_invalid");
  }
  const priorReceiptHash = input?.prior_receipt_hash
    ? String(input.prior_receipt_hash)
    : null;
  if (sequence === 1 && priorReceiptHash) {
    throw new Error("recover_billing_receipt_initial_prior_forbidden");
  }
  if (sequence > 1 && !priorReceiptHash) {
    throw new Error("recover_billing_receipt_prior_required");
  }
  const providerResult = input?.provider_result ?? null;
  const providerObjectId = input?.provider_object_id
    ? String(input.provider_object_id)
    : null;
  const requestDescriptor = normalizeRecoverBillingProviderRequest(
    input?.request_descriptor,
  );
  const requestFingerprint = await recoverBillingRequestFingerprint(
    requestDescriptor,
  );
  if (
    input?.request_fingerprint &&
    String(input.request_fingerprint) !== requestFingerprint
  ) {
    throw new Error("recover_billing_request_fingerprint_invalid");
  }
  if (status === "OBSERVED") {
    const resultStatus = Number(providerResult?.status);
    const resultId = String(providerResult?.data?.id || "");
    if (
      providerResult?.ok !== true ||
      !Number.isInteger(resultStatus) || resultStatus < 200 ||
      resultStatus >= 300 ||
      !providerObjectId || resultId !== providerObjectId
    ) throw new Error("recover_billing_observed_receipt_unproven");
  }
  return {
    version: RECOVER_BILLING_SAGA_VERSION,
    saga_id: recoverExecutionKey(reportId),
    invoice_id: invoiceId,
    report_id: reportId,
    effect_key: effectKey,
    status,
    sequence,
    prior_receipt_hash: priorReceiptHash,
    idempotency_key: String(requestDescriptor.idempotency_key || ""),
    provider: requestDescriptor.provider,
    request_descriptor: requestDescriptor,
    request_fingerprint: requestFingerprint,
    conflicting_request_fingerprint: input?.conflicting_request_fingerprint
      ? String(input.conflicting_request_fingerprint)
      : null,
    provider_object_kind: input?.provider_object_kind
      ? String(input.provider_object_kind)
      : null,
    provider_object_id: providerObjectId,
    provider_result: providerResult,
    error_code: input?.error_code
      ? String(input.error_code).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 160)
      : null,
    observed_at: observedAt,
  };
}

export async function recoverBillingReceiptHash(input: any): Promise<string> {
  return sha256(stableStringify(await normalizedReceipt(input)));
}

async function assertRecoverBillingReceiptIntegrity(row: any) {
  const stored = row?.metadata_json?.immutable_receipt;
  if (!stored || stored.version !== RECOVER_BILLING_SAGA_VERSION) {
    throw new Error("recover_billing_receipt_missing");
  }
  const { receipt_hash: storedHash, ...payload } = stored;
  const expectedHash = await recoverBillingReceiptHash(payload);
  const expectedEventHash = `recover-billing-receipt:${expectedHash}`;
  if (
    storedHash !== expectedHash ||
    row.event_hash !== expectedEventHash ||
    String(row.invoice_id || "") !== String(payload.invoice_id || "") ||
    String(row.event_type || "") !==
      RECEIPT_EVENT_TYPE[payload.status as RecoverBillingReceiptStatus] ||
    String(row.processor_ref || "") !== String(payload.provider_object_id || "")
  ) throw new Error("recover_billing_receipt_integrity_failed");
  return { ...payload, receipt_hash: expectedHash, row_id: row.id || null };
}

/**
 * Appends a content-addressed receipt to the existing PaymentEvent ledger.
 * Rows are never updated or deleted here. A read always recomputes the hash, so
 * any later mutation is detected before a receipt can authorize reconciliation.
 */
export async function appendRecoverBillingReceipt(svc: any, input: any) {
  const payload = await normalizedReceipt(input);
  const receiptHash = await recoverBillingReceiptHash(payload);
  const eventHash = `recover-billing-receipt:${receiptHash}`;
  const existing = await svc.entities.PaymentEvent.filter(
    {
      invoice_id: payload.invoice_id,
      event_hash: eventHash,
    },
    "created_date",
    11,
  );
  if (!Array.isArray(existing)) {
    throw new Error("recover_billing_receipt_authority_unavailable");
  }
  if (existing.length >= 11) {
    throw new Error(
      "recover_billing_receipt_duplicates_truncated_review_required",
    );
  }
  if (existing?.length) {
    const verified = await Promise.all(
      existing.map(assertRecoverBillingReceiptIntegrity),
    );
    return {
      created: false,
      receipt: verified[0],
      duplicate_rows: verified.length,
    };
  }

  const immutableReceipt = { ...payload, receipt_hash: receiptHash };
  const created = await svc.entities.PaymentEvent.create({
    invoice_id: payload.invoice_id,
    amount: 0,
    currency: "EUR",
    event_type: RECEIPT_EVENT_TYPE[payload.status],
    processor: payload.provider,
    processor_ref: payload.provider_object_id || "",
    event_hash: eventHash,
    error_code: payload.error_code || "",
    metadata_json: { immutable_receipt: immutableReceipt },
    occurred_at: payload.observed_at,
  });
  const after = await svc.entities.PaymentEvent.filter(
    {
      invoice_id: payload.invoice_id,
      event_hash: eventHash,
    },
    "created_date",
    11,
  );
  if (!Array.isArray(after)) {
    throw new Error("recover_billing_receipt_authority_unavailable");
  }
  if (after.length >= 11) {
    throw new Error(
      "recover_billing_receipt_duplicates_truncated_review_required",
    );
  }
  if (!after?.length) {
    throw new Error("recover_billing_receipt_unreadable_after_create");
  }
  const verified = await Promise.all(
    after.map(assertRecoverBillingReceiptIntegrity),
  );
  return {
    created: verified.some((receipt) => receipt.row_id === created?.id),
    receipt: verified[0],
    duplicate_rows: verified.length,
  };
}

export async function readRecoverBillingSagaReceipts(
  svc: any,
  invoiceId: string,
) {
  const readLimit = 201;
  const rows = await svc.entities.PaymentEvent.filter(
    { invoice_id: invoiceId },
    "occurred_at",
    readLimit,
  );
  if (!Array.isArray(rows)) {
    throw new Error("recover_billing_receipt_authority_unavailable");
  }
  if (rows.length >= readLimit) {
    throw new Error(
      "recover_billing_receipt_history_truncated_review_required",
    );
  }
  const sagaRows = rows.filter((row: any) =>
    row?.metadata_json?.immutable_receipt?.version ===
      RECOVER_BILLING_SAGA_VERSION
  );
  const receipts = await Promise.all(
    sagaRows.map(assertRecoverBillingReceiptIntegrity),
  );
  const uniqueByHash = new Map<string, any>();
  for (const receipt of receipts) {
    uniqueByHash.set(receipt.receipt_hash, receipt);
  }
  const unique = [...uniqueByHash.values()];
  const byEffect = new Map<string, any[]>();
  for (const receipt of unique) {
    const effect = byEffect.get(receipt.effect_key) || [];
    effect.push(receipt);
    byEffect.set(receipt.effect_key, effect);
  }
  for (const effect of byEffect.values()) {
    effect.sort((a, b) => a.sequence - b.sequence);
    const sequences = new Set<number>();
    for (let index = 0; index < effect.length; index += 1) {
      const receipt = effect[index];
      if (sequences.has(receipt.sequence)) {
        throw new Error("recover_billing_receipt_fork_review_required");
      }
      sequences.add(receipt.sequence);
      if (receipt.sequence !== index + 1) {
        throw new Error("recover_billing_receipt_sequence_gap_review_required");
      }
      const expectedPrior = index === 0 ? null : effect[index - 1].receipt_hash;
      if (receipt.prior_receipt_hash !== expectedPrior) {
        throw new Error("recover_billing_receipt_chain_broken_review_required");
      }
      if (index === 0 && receipt.status !== "EFFECT_STARTED") {
        throw new Error(
          "recover_billing_receipt_chain_missing_start_review_required",
        );
      }
      if (
        index > 0 &&
        receipt.request_fingerprint !== effect[0].request_fingerprint &&
        receipt.status !== "REVIEW_REQUIRED"
      ) {
        throw new Error(
          "recover_billing_receipt_request_drift_review_required",
        );
      }
      if (index > 0) {
        const prior = effect[index - 1];
        const validTransition = prior.status === "EFFECT_STARTED"
          ? receipt.status !== "EFFECT_STARTED"
          : prior.status === "FAILED_PRE_EFFECT"
          ? receipt.status === "EFFECT_STARTED" ||
            receipt.status === "REVIEW_REQUIRED"
          : prior.status === "OBSERVED"
          ? receipt.status === "REVIEW_REQUIRED" &&
            receipt.error_code === "request_descriptor_changed"
          : false;
        if (!validTransition) {
          throw new Error(
            "recover_billing_receipt_transition_invalid_review_required",
          );
        }
      }
    }
  }
  return unique.sort((a: any, b: any) => {
    const effect = String(a.effect_key).localeCompare(String(b.effect_key));
    return effect || a.sequence - b.sequence;
  });
}

export async function recoverBillingSagaState(svc: any, invoiceId: string) {
  const receipts = await readRecoverBillingSagaReceipts(svc, invoiceId);
  const latestByEffect = new Map<string, any>();
  for (const receipt of receipts) {
    latestByEffect.set(receipt.effect_key, receipt);
  }
  const latest = [...latestByEffect.values()];
  const pending_effects = latest.filter((receipt) =>
    receipt.status === "EFFECT_STARTED"
  ).map((receipt) => receipt.effect_key);
  const review_effects = latest.filter((receipt) =>
    receipt.status === "REVIEW_REQUIRED"
  ).map((receipt) => receipt.effect_key);
  return {
    receipts,
    latest_by_effect: latestByEffect,
    pending_effects,
    review_effects,
    review_required: pending_effects.length > 0 || review_effects.length > 0,
  };
}

/** Only the provider fields needed to resume issuance are persisted. */
export function projectRecoverBillingProviderResult(result: any) {
  const data = result?.data || {};
  const integerOrNull = (value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    const normalized = Number(value);
    return Number.isSafeInteger(normalized) ? normalized : null;
  };
  const paymentIntent = typeof data.payment_intent === "string"
    ? data.payment_intent
    : (typeof data.payment_intent?.id === "string"
      ? data.payment_intent.id
      : "");
  return {
    ok: result?.ok === true,
    status: Number(result?.status || 0),
    data: {
      id: String(data.id || ""),
      object: String(data.object || ""),
      status: String(data.status || ""),
      number: String(data.number || ""),
      due_date: Number.isFinite(Number(data.due_date))
        ? Number(data.due_date)
        : null,
      hosted_invoice_url: String(data.hosted_invoice_url || ""),
      invoice_pdf: String(data.invoice_pdf || ""),
      payment_intent: paymentIntent,
      invoice: typeof data.invoice === "string"
        ? data.invoice
        : String(data.invoice?.id || ""),
      customer: typeof data.customer === "string"
        ? data.customer
        : String(data.customer?.id || ""),
      owner_customer: typeof data.owner?.customer === "string"
        ? data.owner.customer
        : String(data.owner?.customer?.id || ""),
      amount: integerOrNull(data.amount),
      total: integerOrNull(data.total),
      currency: String(data.currency || "").toLowerCase(),
      tax_exempt: String(data.tax_exempt || ""),
      type: String(data.type || ""),
      value: String(data.value || ""),
      metadata: {
        local_invoice_id: String(data.metadata?.local_invoice_id || ""),
        monthly_savings_report_id: String(
          data.metadata?.monthly_savings_report_id || "",
        ),
      },
    },
  };
}

function stripeReceiptBinding(
  effectKey: string,
  result: any,
  request: RecoverBillingProviderRequestDescriptor,
) {
  const key = String(effectKey || "");
  const id = String(result?.data?.id || "");
  const object = String(result?.data?.object || "");
  const expected = key.includes("create_invoice_item:")
    ? { prefix: "ii_", objects: ["invoiceitem", "invoice_item"] }
    : key.includes("create_invoice:") || key.includes("finalize_invoice:")
    ? { prefix: "in_", objects: ["invoice"] }
    : key.includes("reverse_tax:")
    ? { prefix: "cus_", objects: ["customer"] }
    : key.includes("attach_tax_id:")
    ? { prefix: "txi_", objects: ["tax_id"] }
    : null;
  if (!expected) return { ok: false, object, id };
  const path = String(request?.path || "");
  const params = request?.params || {};
  const expectedCustomer = String(params.customer || "");
  const expectedInvoice = String(params.invoice || "");
  const finalizedInvoice =
    path.match(/^invoices\/(in_[^/]+)\/finalize$/)?.[1] || "";
  const customerPath = path.match(/^customers\/(cus_[^/]+)$/)?.[1] || "";
  const taxCustomerPath =
    path.match(/^customers\/(cus_[^/]+)\/tax_ids$/)?.[1] || "";
  const parentCustomer = String(
    result?.data?.customer || result?.data?.owner_customer || "",
  );
  const responseBinding = request?.response_binding;
  const expectedMetadata = responseBinding?.metadata || null;
  const responseBindingOk = Boolean(responseBinding) &&
    (!responseBinding.object_id || id === responseBinding.object_id) &&
    (!responseBinding.customer_id ||
      parentCustomer === responseBinding.customer_id) &&
    (!responseBinding.parent_invoice_id ||
      result?.data?.invoice === responseBinding.parent_invoice_id) &&
    (responseBinding.amount_minor === null ||
      result?.data?.amount === responseBinding.amount_minor) &&
    (responseBinding.total_minor === null ||
      result?.data?.total === responseBinding.total_minor) &&
    (!responseBinding.currency ||
      result?.data?.currency === responseBinding.currency) &&
    (responseBinding.allowed_statuses.length === 0 ||
      responseBinding.allowed_statuses.includes(
        String(result?.data?.status || "").toLowerCase(),
      )) &&
    (!responseBinding.require_number ||
      Boolean(String(result?.data?.number || "").trim())) &&
    (!expectedMetadata || Object.entries(expectedMetadata).every(
      ([metadataKey, metadataValue]) =>
        String(result?.data?.metadata?.[metadataKey] || "") === metadataValue,
    ));
  const relationOk = key.includes("create_invoice_item:")
    ? Boolean(
      expectedInvoice && expectedCustomer &&
        result?.data?.invoice === expectedInvoice &&
        result?.data?.customer === expectedCustomer &&
        (!params.amount || result?.data?.amount === Number(params.amount)) &&
        (!params.currency || result?.data?.currency === params.currency),
    )
    : key.includes("finalize_invoice:")
    ? Boolean(finalizedInvoice && id === finalizedInvoice)
    : key.includes("reverse_tax:")
    ? Boolean(
      customerPath && id === customerPath &&
        (!params.tax_exempt || result?.data?.tax_exempt === params.tax_exempt),
    )
    : key.includes("attach_tax_id:")
    ? Boolean(
      taxCustomerPath && parentCustomer === taxCustomerPath &&
        (!params.type || result?.data?.type === params.type) &&
        (!params.value || result?.data?.value === params.value),
    )
    : key.includes("create_invoice:")
    ? Boolean(
      expectedCustomer && result?.data?.customer === expectedCustomer &&
        (!params.currency || result?.data?.currency === params.currency) &&
        (!params["metadata[local_invoice_id]"] ||
          result?.data?.metadata?.local_invoice_id ===
            params["metadata[local_invoice_id]"]) &&
        (!params["metadata[monthly_savings_report_id]"] ||
          result?.data?.metadata?.monthly_savings_report_id ===
            params["metadata[monthly_savings_report_id]"]),
    )
    : false;
  return {
    ok: id.startsWith(expected.prefix) && expected.objects.includes(object) &&
      relationOk && responseBindingOk,
    object,
    id,
  };
}

function reviewRequiredError(
  code: string,
  cause?: unknown,
  effectKey?: string,
) {
  const error: any = new Error(code);
  error.code = "RECOVER_BILLING_REVIEW_REQUIRED";
  error.review_required = true;
  if (effectKey) error.effect_key = effectKey;
  if (cause) error.cause = cause;
  return error;
}

function withRecoverBillingExecutionReceipt(result: any, receipt: any) {
  return {
    ...projectRecoverBillingProviderResult(result),
    execution_receipt: {
      receipt_hash: String(receipt?.receipt_hash || ""),
      observed_at: String(receipt?.observed_at || ""),
      request_fingerprint: String(receipt?.request_fingerprint || ""),
      provider_object_id: String(receipt?.provider_object_id || ""),
    },
  };
}

/**
 * Executes one canonical Stripe request under the report lease. The request
 * descriptor, rather than a caller-provided callback, is the external-effect
 * authority. Its content fingerprint is hash-bound into every immutable
 * receipt; changing path/params/account/mode/key on replay quarantines without
 * reaching transport.
 */
export async function executeRecoverBillingProviderRequest(
  svc: any,
  claim: any,
  input: {
    effect_key: string;
    request: RecoverBillingProviderRequestDescriptor;
    emergency_epoch_claim: EmergencyEpochClaim;
    now?: () => string;
    /** Unit-test seam. Production callers omit it; the descriptor remains the input. */
    transport?: (
      request: RecoverBillingProviderRequestDescriptor,
    ) => Promise<any>;
  },
) {
  if (
    !claim?.acquired || !claim?.invoice?.id ||
    !claim?.invoice?.monthly_savings_report_id
  ) {
    throw new Error("recover_billing_step_requires_owned_claim");
  }
  const now = input.now || (() => new Date().toISOString());
  const invoiceId = String(claim.invoice.id);
  const reportId = String(claim.invoice.monthly_savings_report_id);
  const request = normalizeRecoverBillingProviderRequest(input.request);
  const requestFingerprint = await recoverBillingRequestFingerprint(request);
  // Revalidate the report fence even when an earlier OBSERVED receipt lets this
  // invocation skip transport. A stale owner may never settle/resume locally.
  await renewRecoverInvoiceClaim(svc, claim);
  const state = await recoverBillingSagaState(svc, invoiceId);
  const previous = state.latest_by_effect.get(input.effect_key);
  if (previous && previous.request_fingerprint !== requestFingerprint) {
    await appendRecoverBillingReceipt(svc, {
      invoice_id: invoiceId,
      report_id: reportId,
      effect_key: input.effect_key,
      status: "REVIEW_REQUIRED",
      sequence: Number(previous.sequence) + 1,
      prior_receipt_hash: previous.receipt_hash,
      request_descriptor: previous.request_descriptor,
      request_fingerprint: previous.request_fingerprint,
      conflicting_request_fingerprint: requestFingerprint,
      provider_object_kind: previous.provider_object_kind || null,
      provider_object_id: previous.provider_object_id || null,
      provider_result: previous.provider_result || null,
      error_code: "request_descriptor_changed",
      observed_at: now(),
    });
    throw reviewRequiredError(
      `recover_billing_request_descriptor_changed:${input.effect_key}`,
      undefined,
      input.effect_key,
    );
  }
  if (previous?.status === "OBSERVED") {
    const replayBinding = stripeReceiptBinding(
      input.effect_key,
      previous.provider_result,
      request,
    );
    if (!replayBinding.ok) {
      await appendRecoverBillingReceipt(svc, {
        invoice_id: invoiceId,
        report_id: reportId,
        effect_key: input.effect_key,
        status: "REVIEW_REQUIRED",
        sequence: Number(previous.sequence) + 1,
        prior_receipt_hash: previous.receipt_hash,
        request_descriptor: request,
        request_fingerprint: requestFingerprint,
        provider_object_kind: replayBinding.object || null,
        provider_object_id: replayBinding.id || null,
        provider_result: previous.provider_result,
        error_code: "stored_provider_receipt_binding_invalid",
        observed_at: now(),
      });
      throw reviewRequiredError(
        `recover_billing_stored_provider_receipt_binding_invalid:${input.effect_key}`,
        undefined,
        input.effect_key,
      );
    }
    return withRecoverBillingExecutionReceipt(
      previous.provider_result,
      previous,
    );
  }
  if (
    previous?.status === "REVIEW_REQUIRED" ||
    previous?.status === "EFFECT_STARTED"
  ) {
    throw reviewRequiredError(
      `recover_billing_effect_requires_reconciliation:${input.effect_key}`,
      undefined,
      input.effect_key,
    );
  }
  // The initial renewal is not a durable right to effect. Re-read the exact
  // token and live lease immediately before START so a concurrent owner change
  // cannot inherit this invocation's provider receipt chain.
  await assertRecoverInvoiceClaimFence(svc, claim);
  const started = await appendRecoverBillingReceipt(svc, {
    invoice_id: invoiceId,
    report_id: reportId,
    effect_key: input.effect_key,
    status: "EFFECT_STARTED",
    sequence: previous ? Number(previous.sequence) + 1 : 1,
    prior_receipt_hash: previous?.receipt_hash || null,
    request_descriptor: request,
    request_fingerprint: requestFingerprint,
    observed_at: now(),
  });

  const startedState = await recoverBillingSagaState(svc, invoiceId);
  const startedReceipt = startedState.latest_by_effect.get(input.effect_key);
  if (
    !startedReceipt || startedReceipt.status !== "EFFECT_STARTED" ||
    startedReceipt.receipt_hash !== started.receipt.receipt_hash ||
    startedReceipt.request_fingerprint !== requestFingerprint
  ) {
    throw reviewRequiredError(
      `recover_billing_effect_start_unproven:${input.effect_key}`,
      undefined,
      input.effect_key,
    );
  }

  let transportStarted = false;
  try {
    const result = await guardedEmergencyEffect(svc, {
      claim: input.emergency_epoch_claim,
      effect_key: input.effect_key,
      effect: async () => {
        // Emergency precheck may take time. Re-read the report fence inside the
        // guarded callback, immediately before marking transport as started.
        // Losing ownership here is a proven pre-effect failure: zero Stripe
        // calls and no blind retry under this owner.
        await assertRecoverInvoiceClaimFence(svc, claim);
        transportStarted = true;
        return input.transport ? input.transport(request) : stripeRequest(
          request.mode,
          request.method,
          request.path,
          request.params,
          request.idempotency_key,
        );
      },
    });
    const projected = projectRecoverBillingProviderResult(result);
    if (!projected.ok || projected.status < 200 || projected.status >= 300) {
      await appendRecoverBillingReceipt(svc, {
        invoice_id: invoiceId,
        report_id: reportId,
        effect_key: input.effect_key,
        status: "REVIEW_REQUIRED",
        sequence: Number(startedReceipt.sequence) + 1,
        prior_receipt_hash: startedReceipt.receipt_hash,
        request_descriptor: request,
        request_fingerprint: requestFingerprint,
        provider_result: projected,
        error_code: `provider_http_${projected.status || "unknown"}`,
        observed_at: now(),
      });
      throw reviewRequiredError(
        `recover_billing_provider_response_ambiguous:${input.effect_key}`,
        undefined,
        input.effect_key,
      );
    }
    if (!projected.data.id) {
      await appendRecoverBillingReceipt(svc, {
        invoice_id: invoiceId,
        report_id: reportId,
        effect_key: input.effect_key,
        status: "REVIEW_REQUIRED",
        sequence: Number(startedReceipt.sequence) + 1,
        prior_receipt_hash: startedReceipt.receipt_hash,
        request_descriptor: request,
        request_fingerprint: requestFingerprint,
        provider_result: projected,
        error_code: "provider_receipt_id_missing",
        observed_at: now(),
      });
      throw reviewRequiredError(
        `recover_billing_provider_receipt_missing:${input.effect_key}`,
        undefined,
        input.effect_key,
      );
    }
    const binding = stripeReceiptBinding(input.effect_key, projected, request);
    if (!binding.ok) {
      await appendRecoverBillingReceipt(svc, {
        invoice_id: invoiceId,
        report_id: reportId,
        effect_key: input.effect_key,
        status: "REVIEW_REQUIRED",
        sequence: Number(startedReceipt.sequence) + 1,
        prior_receipt_hash: startedReceipt.receipt_hash,
        request_descriptor: request,
        request_fingerprint: requestFingerprint,
        provider_object_kind: binding.object || null,
        provider_object_id: binding.id || null,
        provider_result: projected,
        error_code: "provider_receipt_binding_invalid",
        observed_at: now(),
      });
      throw reviewRequiredError(
        `recover_billing_provider_receipt_binding_invalid:${input.effect_key}`,
        undefined,
        input.effect_key,
      );
    }
    const observed = await appendRecoverBillingReceipt(svc, {
      invoice_id: invoiceId,
      report_id: reportId,
      effect_key: input.effect_key,
      status: "OBSERVED",
      sequence: Number(startedReceipt.sequence) + 1,
      prior_receipt_hash: startedReceipt.receipt_hash,
      request_descriptor: request,
      request_fingerprint: requestFingerprint,
      provider_object_kind: projected.data.object || null,
      provider_object_id: projected.data.id,
      provider_result: projected,
      observed_at: now(),
    });
    return withRecoverBillingExecutionReceipt(projected, observed.receipt);
  } catch (caught: any) {
    if (caught?.code === "RECOVER_BILLING_REVIEW_REQUIRED") throw caught;
    if (
      transportStarted === false &&
      String(caught?.message || "") ===
        "recover_invoice_claim_lost_before_provider_effect"
    ) {
      // EFFECT_STARTED is already durable, but the old owner no longer owns
      // the report fence and therefore cannot settle or release the effect.
      // Leave STARTED as explicit review evidence; never call transport and
      // never append a false FAILED_PRE_EFFECT outcome from a stale owner.
      throw reviewRequiredError(
        `recover_billing_fence_lost_after_effect_started:${input.effect_key}`,
        caught,
        input.effect_key,
      );
    }
    const effectResult = caught?.effect_result
      ? projectRecoverBillingProviderResult(caught.effect_result)
      : null;
    const provenPreEffect = transportStarted === false;
    try {
      await appendRecoverBillingReceipt(svc, {
        invoice_id: invoiceId,
        report_id: reportId,
        effect_key: input.effect_key,
        status: provenPreEffect ? "FAILED_PRE_EFFECT" : "REVIEW_REQUIRED",
        sequence: Number(startedReceipt.sequence) + 1,
        prior_receipt_hash: startedReceipt.receipt_hash,
        request_descriptor: request,
        request_fingerprint: requestFingerprint,
        provider_object_kind: effectResult?.data?.object || null,
        provider_object_id: effectResult?.data?.id || null,
        provider_result: effectResult,
        error_code: provenPreEffect
          ? "transport_not_started"
          : String(caught?.code || caught?.name || "provider_effect_ambiguous"),
        observed_at: now(),
      });
    } catch {
      // The durable EFFECT_STARTED receipt remains sufficient to derive
      // REVIEW_REQUIRED. Never mask the ambiguity by retrying the provider.
    }
    if (provenPreEffect) {
      const error: any = new Error(
        `recover_billing_effect_failed_pre_effect:${input.effect_key}`,
      );
      error.code = "RECOVER_BILLING_FAILED_PRE_EFFECT";
      error.transport_started = false;
      error.cause = caught;
      throw error;
    }
    throw reviewRequiredError(
      `recover_billing_effect_ambiguous:${input.effect_key}`,
      caught,
      input.effect_key,
    );
  }
}

export function recoverBillingCasUpdatedCount(result: any): number | null {
  if (!result || typeof result !== "object") return null;
  for (const flag of ["success", "ok"]) {
    if (
      Object.prototype.hasOwnProperty.call(result, flag) &&
      result[flag] !== true
    ) return null;
  }
  const counters = ["updated", "modified_count", "matched_count"]
    .filter((key) => Object.prototype.hasOwnProperty.call(result, key))
    .map((key) => Number(result[key]));
  if (
    !counters.length ||
    counters.some((value) => !Number.isInteger(value) || value < 0)
  ) return null;
  if (counters.some((value) => value !== counters[0])) return null;
  return counters[0];
}

function updatedExactlyOne(result: any): boolean {
  return recoverBillingCasUpdatedCount(result) === 1;
}

async function singleById(entity: any, id: string, errorCode: string) {
  const rows = await entity.filter({ id }, "-created_date", 2);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(errorCode);
  return rows[0];
}

function bindRecoverClaimAuthoritySnapshot(
  filter: Record<string, unknown>,
  authority: any,
) {
  for (
    const key of [
      "invoice_claim_expires_at",
      "invoice_claimed_at",
      "revision",
      "_revision",
      "updated_date",
    ]
  ) {
    if (Object.prototype.hasOwnProperty.call(authority || {}, key)) {
      filter[key] = authority[key];
    }
  }
  return filter;
}

async function assertRecoverInvoiceClaimFence(
  svc: any,
  claim: any,
  nowMs = Date.now(),
) {
  if (
    !claim?.acquired || !claim?.claim_token || !claim?.invoice?.id ||
    !claim?.invoice?.monthly_savings_report_id || !Number.isFinite(nowMs)
  ) {
    throw new Error("recover_invoice_claim_lost_before_provider_effect");
  }
  const report = await singleById(
    svc.entities.MonthlySavingsReport,
    String(claim.invoice.monthly_savings_report_id),
    "recover_invoice_claim_fence_authority_unavailable",
  );
  const leaseExpiresMs = typeof report.invoice_claim_expires_at === "string" &&
      report.invoice_claim_expires_at.trim()
    ? new Date(report.invoice_claim_expires_at).getTime()
    : Number.NaN;
  if (
    report.billing_eligibility_status !== "invoice_claimed" ||
    String(report.invoice_id || "") !== String(claim.invoice.id) ||
    String(report.invoice_claim_token || "") !== String(claim.claim_token) ||
    !Number.isFinite(leaseExpiresMs) || leaseExpiresMs <= nowMs
  ) {
    throw new Error("recover_invoice_claim_lost_before_provider_effect");
  }
  return report;
}

export function toMinor(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100);
}

export function expectedInvoiceTotalMinor(inv: any): number {
  const frozen = Number(inv?.billing_snapshot_json?.amounts_minor?.total);
  if (Number.isInteger(frozen) && frozen >= 0) return frozen;
  return toMinor(inv?.total_amount || 0);
}

export function recoverExecutionKey(reportId: unknown): string {
  const id = String(reportId || "").trim();
  if (!id) throw new Error("recover_execution_key_requires_report_id");
  return `recover-invoice:${id}`;
}

function oldestFirst(rows: any[]): any[] {
  return [...(rows || [])].sort((a, b) => {
    const at = new Date(a?.created_date || 0).getTime();
    const bt = new Date(b?.created_date || 0).getTime();
    if (at !== bt) return at - bt;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

async function collapseInvoiceClaims(svc: any, rows: any[]) {
  const claims = oldestFirst((rows || []).filter((r) => r?.id));
  if (!claims.length) return null;

  const committed = claims.filter((r) =>
    r.status !== "draft" || r.stripe_invoice_id || r.invoice_number
  );
  if (committed.length > 1) {
    throw new Error(
      `duplicate_committed_recover_invoices:${
        committed.map((r) => r.id).join(",")
      }`,
    );
  }
  const winner = committed[0] || claims[0];
  for (const duplicate of claims) {
    if (duplicate.id === winner.id) continue;
    // Never delete an economically committed row automatically. Multiple
    // committed rows are a hard conflict above and require operator review.
    if (
      duplicate.status !== "draft" || duplicate.stripe_invoice_id ||
      duplicate.invoice_number
    ) {
      throw new Error(`duplicate_committed_recover_invoice:${duplicate.id}`);
    }
    await svc.entities.Invoice.delete(duplicate.id);
  }
  return winner;
}

export async function healRecoverInvoiceDuplicatesForReport(
  svc: any,
  reportId: string,
) {
  const id = String(reportId || "").trim();
  if (!id) throw new Error("recover_invoice_heal_requires_report_id");
  const rows = await svc.entities.Invoice.filter(
    { monthly_savings_report_id: id },
    "created_date",
    10,
  );
  const winner = await collapseInvoiceClaims(svc, rows);
  if (!winner) return null;
  const key = recoverExecutionKey(id);
  if (winner.execution_key !== key) {
    await svc.entities.Invoice.update(winner.id, { execution_key: key });
    return { ...winner, execution_key: key };
  }
  return winner;
}

export async function claimRecoverInvoiceDraft(
  svc: any,
  executionKey: string,
  record: any,
  options: { preferredInvoice?: any; nowMs?: number; leaseMs?: number } = {},
) {
  const reportId = String(record?.monthly_savings_report_id || "").trim();
  if (!reportId) throw new Error("recover_invoice_claim_requires_report_id");
  const nowMs = Number.isFinite(Number(options.nowMs))
    ? Number(options.nowMs)
    : Date.now();
  const leaseMs = Math.max(
    60_000,
    Number(options.leaseMs || RECOVER_INVOICE_CLAIM_LEASE_MS),
  );
  const claimedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + leaseMs).toISOString();
  let report = await singleById(
    svc.entities.MonthlySavingsReport,
    reportId,
    "recover_invoice_report_authority_unavailable",
  );

  if (report.billing_eligibility_status === "invoiced") {
    if (!report.invoice_id) {
      throw new Error("recover_invoice_report_invoiced_without_pointer");
    }
    const invoice = await singleById(
      svc.entities.Invoice,
      String(report.invoice_id),
      "recover_invoice_pointer_unreadable",
    );
    return {
      created: false,
      acquired: false,
      terminal: true,
      invoice,
      claim_token: null,
    };
  }

  if (report.billing_eligibility_status === "invoice_claimed") {
    if (!report.invoice_id || !report.invoice_claim_token) {
      throw new Error("recover_invoice_claim_corrupt");
    }
    const invoice = await singleById(
      svc.entities.Invoice,
      String(report.invoice_id),
      "recover_invoice_pointer_unreadable",
    );
    if (String(invoice.execution_key || "") !== executionKey) {
      throw new Error("recover_invoice_claim_execution_key_mismatch");
    }
    const leaseRaw = report.invoice_claim_expires_at;
    const leaseExpiresMs = typeof leaseRaw === "string" && leaseRaw.trim()
      ? new Date(leaseRaw).getTime()
      : Number.NaN;
    if (!Number.isFinite(leaseExpiresMs)) {
      const reviewAt = new Date(nowMs).toISOString();
      await svc.entities.Invoice.update(invoice.id, {
        reconciliation_status: "error",
        last_error: "recover_invoice_claim_lease_unknown_review_required",
        last_failed_at: reviewAt,
      });
      return {
        created: false,
        acquired: false,
        review_required: true,
        invoice,
        claim_token: null,
        effect_keys: ["claim_lease_unknown"],
      };
    }
    if (leaseExpiresMs > nowMs) {
      return {
        created: false,
        acquired: false,
        in_progress: true,
        invoice,
        claim_token: null,
      };
    }

    // Expiry is takeover-eligible only when every provider step is proven
    // pre-effect or durably observed. A STARTED receipt without an outcome (or a
    // legacy provider id without saga receipts) is EFFECT_UNKNOWN: persist an
    // explicit review receipt and keep the old fence instead of calling Stripe.
    let saga: any;
    try {
      saga = await recoverBillingSagaState(svc, String(invoice.id));
    } catch (error: any) {
      const reviewAt = new Date(nowMs).toISOString();
      await svc.entities.Invoice.update(invoice.id, {
        reconciliation_status: "error",
        last_error: `recover_billing_receipt_history_unknown:${
          String(error?.message || "unavailable").slice(0, 120)
        }`,
        last_failed_at: reviewAt,
      });
      return {
        created: false,
        acquired: false,
        review_required: true,
        invoice,
        claim_token: null,
        effect_keys: ["receipt_history_unknown"],
      };
    }
    const legacyProviderEffect = saga.receipts.length === 0 && Boolean(
      invoice.stripe_invoice_id || invoice.invoice_number ||
        invoice.status !== "draft",
    );
    if (saga.review_required || legacyProviderEffect) {
      const reviewAt = new Date(nowMs + 1).toISOString();
      // Legacy rows cannot be retrofitted into a hash chain: record the review
      // marker on the Invoice projection and keep the provider pointer intact.
      // New saga effects append sequence 2 against the verified START receipt.
      const effects = saga.pending_effects.length
        ? saga.pending_effects
        : (saga.review_effects.length
          ? saga.review_effects
          : ["legacy_unfenced_provider_effect"]);
      for (const effectKey of legacyProviderEffect ? [] : effects) {
        const previous = saga.latest_by_effect.get(effectKey);
        if (previous?.status !== "REVIEW_REQUIRED") {
          await appendRecoverBillingReceipt(svc, {
            invoice_id: String(invoice.id),
            report_id: reportId,
            effect_key: effectKey,
            status: "REVIEW_REQUIRED",
            sequence: Number(previous?.sequence || 1) + 1,
            prior_receipt_hash: previous?.receipt_hash || null,
            request_descriptor: previous?.request_descriptor,
            request_fingerprint: previous?.request_fingerprint,
            provider_object_kind: previous?.provider_object_kind || null,
            provider_object_id: previous?.provider_object_id ||
              invoice.stripe_invoice_id || null,
            provider_result: previous?.provider_result || null,
            error_code: legacyProviderEffect
              ? "expired_legacy_claim_after_provider_effect"
              : "expired_claim_after_effect_started",
            observed_at: reviewAt,
          });
        }
      }
      await svc.entities.Invoice.update(invoice.id, {
        reconciliation_status: "error",
        last_error:
          "recover_invoice_claim_expired_after_effect_started_review_required",
        last_failed_at: reviewAt,
      });
      return {
        created: false,
        acquired: false,
        review_required: true,
        post_effect: true,
        invoice,
        claim_token: null,
        effect_keys: effects,
      };
    }
    const token = crypto.randomUUID();
    const reclaimFilter = bindRecoverClaimAuthoritySnapshot({
      id: reportId,
      billing_eligibility_status: "invoice_claimed",
      invoice_id: String(report.invoice_id),
      invoice_claim_token: String(report.invoice_claim_token),
    }, report);
    const changed = await svc.entities.MonthlySavingsReport.updateMany(
      reclaimFilter,
      {
        $set: {
          invoice_claim_token: token,
          invoice_claimed_at: claimedAt,
          invoice_claim_expires_at: expiresAt,
        },
      },
    );
    report = await singleById(
      svc.entities.MonthlySavingsReport,
      reportId,
      "recover_invoice_claim_readback_unavailable",
    );
    const changedCount = recoverBillingCasUpdatedCount(changed);
    if (changedCount === null) {
      throw new Error("recover_invoice_reclaim_cas_result_ambiguous");
    }
    if (changedCount === 0 && report.invoice_claim_token !== token) {
      return {
        created: false,
        acquired: false,
        in_progress: true,
        invoice,
        claim_token: null,
      };
    }
    if (
      changedCount !== 1 || report.invoice_claim_token !== token ||
      String(report.invoice_id) !== String(invoice.id)
    ) {
      throw new Error("recover_invoice_claim_lost_after_reclaim");
    }
    return {
      created: false,
      acquired: true,
      reclaimed: true,
      invoice,
      claim_token: token,
    };
  }

  if (report.billing_eligibility_status !== "eligible" || report.invoice_id) {
    throw new Error(
      `recover_invoice_report_not_claimable:${
        report.billing_eligibility_status || "unknown"
      }`,
    );
  }

  const preferred = options.preferredInvoice || null;
  if (
    preferred && (
      String(preferred.monthly_savings_report_id || "") !== reportId ||
      String(preferred.execution_key || executionKey) !== executionKey
    )
  ) throw new Error("recover_invoice_preferred_draft_binding_mismatch");

  let candidate = preferred;
  let createdHere = false;
  if (!candidate) {
    candidate = await svc.entities.Invoice.create({
      ...record,
      execution_key: executionKey,
    });
    createdHere = true;
  } else if (candidate.execution_key !== executionKey) {
    candidate = await svc.entities.Invoice.update(candidate.id, {
      execution_key: executionKey,
    });
  }

  const token = crypto.randomUUID();
  try {
    const changed = await svc.entities.MonthlySavingsReport.updateMany({
      id: reportId,
      billing_eligibility_status: "eligible",
    }, {
      $set: {
        billing_eligibility_status: "invoice_claimed",
        invoice_id: candidate.id,
        invoice_claim_token: token,
        invoice_claimed_at: claimedAt,
        invoice_claim_expires_at: expiresAt,
      },
    });
    report = await singleById(
      svc.entities.MonthlySavingsReport,
      reportId,
      "recover_invoice_claim_readback_unavailable",
    );
    const changedCount = recoverBillingCasUpdatedCount(changed);
    if (changedCount === null) {
      throw new Error("recover_invoice_claim_cas_result_ambiguous");
    }
    if (
      changedCount === 1 && report.invoice_claim_token === token &&
      String(report.invoice_id) === String(candidate.id)
    ) {
      return {
        created: createdHere,
        acquired: true,
        invoice: candidate,
        claim_token: token,
      };
    }
    if (
      createdHere && String(report.invoice_id || "") !== String(candidate.id) &&
      candidate.status === "draft" && !candidate.stripe_invoice_id &&
      !candidate.invoice_number
    ) {
      await svc.entities.Invoice.delete(candidate.id);
    }
    if (
      report.billing_eligibility_status === "invoice_claimed" &&
      report.invoice_id
    ) {
      const winner = await singleById(
        svc.entities.Invoice,
        String(report.invoice_id),
        "recover_invoice_pointer_unreadable",
      );
      return {
        created: false,
        acquired: false,
        in_progress: true,
        invoice: winner,
        claim_token: null,
      };
    }
    if (changedCount !== 1) {
      throw new Error("recover_invoice_claim_concurrency_lost");
    }
    throw new Error("recover_invoice_claim_postcondition_failed");
  } catch (error) {
    if (createdHere) {
      const fresh = await svc.entities.MonthlySavingsReport.filter(
        { id: reportId },
        "-created_date",
        1,
      );
      if (
        String(fresh?.[0]?.invoice_id || "") !== String(candidate.id) &&
        candidate.status === "draft" && !candidate.stripe_invoice_id &&
        !candidate.invoice_number
      ) {
        await svc.entities.Invoice.delete(candidate.id);
      }
    }
    throw error;
  }
}

export async function finalizeRecoverInvoiceClaim(
  svc: any,
  claim: any,
  patch: Record<string, unknown>,
) {
  if (
    !claim?.acquired || !claim?.claim_token ||
    !claim?.invoice?.monthly_savings_report_id
  ) {
    throw new Error("recover_invoice_finalize_requires_owned_claim");
  }
  const reportId = String(claim.invoice.monthly_savings_report_id);
  const authority = await singleById(
    svc.entities.MonthlySavingsReport,
    reportId,
    "recover_invoice_finalize_authority_unavailable",
  );
  if (
    authority.billing_eligibility_status !== "invoice_claimed" ||
    String(authority.invoice_id || "") !== String(claim.invoice.id) ||
    String(authority.invoice_claim_token || "") !== String(claim.claim_token)
  ) {
    throw new Error("recover_invoice_claim_lost_before_finalize");
  }
  const terminalPatch: Record<string, unknown> = { ...patch };
  const authorityFilter: Record<string, unknown> = {
    id: reportId,
    billing_eligibility_status: "invoice_claimed",
    invoice_id: String(claim.invoice.id),
    invoice_claim_token: String(claim.claim_token),
  };
  for (
    const key of ["status", "verification_status", "revision", "_revision"]
  ) {
    if (Object.prototype.hasOwnProperty.call(authority, key)) {
      authorityFilter[key] = authority[key];
    }
  }
  const changed = await svc.entities.MonthlySavingsReport.updateMany(
    authorityFilter,
    {
      $set: {
        ...terminalPatch,
        billing_eligibility_status: "invoiced",
        invoice_id: String(claim.invoice.id),
        invoice_claim_token: "",
        invoice_claim_expires_at: "",
      },
    },
  );
  const report = await singleById(
    svc.entities.MonthlySavingsReport,
    reportId,
    "recover_invoice_finalize_readback_unavailable",
  );
  const changedCount = recoverBillingCasUpdatedCount(changed);
  if (changedCount === null) {
    throw new Error("recover_invoice_finalize_cas_result_ambiguous");
  }
  if (
    report.billing_eligibility_status === "invoiced" &&
    String(report.invoice_id) === String(claim.invoice.id) &&
    projectionMatches(report, terminalPatch)
  ) {
    if (changedCount !== 1) {
      throw new Error(
        "recover_invoice_finalize_unowned_or_replayed_review_required",
      );
    }
    return { finalized: true, replay: false, report };
  }
  throw new Error("recover_invoice_claim_lost_before_finalize");
}

function projectionMatches(row: any, expected: Record<string, unknown>) {
  return Object.entries(expected || {}).every(([key, value]) =>
    stableStringify(row?.[key]) === stableStringify(value)
  );
}

function projectionCasFilter(row: any, patch: Record<string, unknown>) {
  const filter: Record<string, unknown> = { id: row.id };
  const keys = new Set([
    "updated_date",
    "revision",
    "_revision",
    "status",
    "stripe_event_last_processed",
    "reconciliation_status",
    ...Object.keys(patch || {}),
  ]);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row || {}, key)) continue;
    const value = row[key];
    if (
      value === null || ["string", "number", "boolean"].includes(typeof value)
    ) {
      filter[key] = value;
    }
  }
  return filter;
}

async function convergeProjectionByCas(
  entity: any,
  id: string,
  patch: Record<string, unknown>,
  expected: Record<string, unknown>,
  errorPrefix: string,
  transitionGuard?: (current: any, patch: Record<string, unknown>) => void,
) {
  let current = await singleById(
    entity,
    id,
    `${errorPrefix}_authority_unavailable`,
  );
  if (projectionMatches(current, expected)) return current;
  transitionGuard?.(current, patch);
  let result: any = null;
  let writeError: any = null;
  try {
    result = await entity.updateMany(
      projectionCasFilter(current, patch),
      { $set: patch },
    );
  } catch (error) {
    writeError = error;
  }
  const observed = await singleById(
    entity,
    id,
    `${errorPrefix}_readback_unavailable`,
  );
  const count = recoverBillingCasUpdatedCount(result);
  if (writeError || count === null || count > 1) {
    throw reviewRequiredError(
      `${errorPrefix}_cas_authority_ambiguous`,
      writeError || undefined,
    );
  }
  if (!projectionMatches(observed, expected)) {
    throw reviewRequiredError(
      `${errorPrefix}_concurrent_projection_requires_reconciliation`,
    );
  }
  // count=0 with the exact expected readback is a safe identical concurrent
  // projection. Any divergent concurrent transition was rejected above.
  return observed;
}

const RECOVER_INVOICE_STATUS_TRANSITIONS: Record<string, ReadonlySet<string>> =
  {
    draft: new Set([
      "issued",
      "sent",
      "due",
      "partially_paid",
      "paid",
      "failed",
      "void",
      "disputed",
      "overdue",
      "refunded",
    ]),
    issued: new Set([
      "sent",
      "due",
      "partially_paid",
      "paid",
      "failed",
      "void",
      "disputed",
      "overdue",
      "refunded",
    ]),
    sent: new Set([
      "due",
      "partially_paid",
      "paid",
      "failed",
      "void",
      "disputed",
      "overdue",
      "refunded",
    ]),
    due: new Set([
      "partially_paid",
      "paid",
      "failed",
      "void",
      "disputed",
      "overdue",
      "refunded",
    ]),
    partially_paid: new Set([
      "paid",
      "failed",
      "void",
      "disputed",
      "overdue",
      "refunded",
    ]),
    overdue: new Set([
      "partially_paid",
      "paid",
      "failed",
      "void",
      "disputed",
      "refunded",
    ]),
    failed: new Set(["paid", "void", "disputed", "refunded"]),
    paid: new Set(["disputed", "refunded"]),
    void: new Set(),
    disputed: new Set(["refunded"]),
    refunded: new Set(),
  };

/**
 * Invoice lifecycle projections are monotonic. A CAS proves that nobody wrote
 * between our authority read and update; it does not prove that a stale caller
 * is allowed to replace the latest status. Strong payment states therefore
 * require an explicit forward transition and otherwise stop for reconciliation.
 */
export function assertRecoverInvoiceProjectionMonotonic(
  current: any,
  patch: Record<string, unknown>,
) {
  if (!Object.prototype.hasOwnProperty.call(patch || {}, "status")) return;
  const from = String(current?.status || "");
  const to = String(patch?.status || "");
  if (from === to) return;
  const allowed = RECOVER_INVOICE_STATUS_TRANSITIONS[from];
  if (!allowed || !to || !allowed.has(to)) {
    throw reviewRequiredError(
      `recover_invoice_status_transition_requires_reconciliation:${
        from || "UNKNOWN"
      }:${to || "UNKNOWN"}`,
    );
  }
}

function recoverIssuanceProjectionForCurrent(
  current: any,
  patch: Record<string, unknown>,
  readback: Record<string, unknown>,
) {
  const desiredStatus = String(patch?.status || "");
  const currentStatus = String(current?.status || "");
  if (!desiredStatus || !currentStatus || currentStatus === desiredStatus) {
    return { patch, readback };
  }
  // A signed Stripe webhook may legitimately project due/paid/etc. between
  // finalize's provider receipt and this local issuance convergence. Preserve
  // any state that is a forward transition from the requested issuance state,
  // while still filling and verifying every immutable issuance field.
  if (RECOVER_INVOICE_STATUS_TRANSITIONS[desiredStatus]?.has(currentStatus)) {
    return {
      patch: { ...patch, status: currentStatus },
      readback: { ...readback, status: currentStatus },
    };
  }
  return { patch, readback };
}

/** Billing may advance an exact live activation to monetizing. It must never
 * revive a paused, cancelled, or otherwise changed activation from stale data. */
export function assertRecoverBillingActivationProjection(
  current: any,
  patch: Record<string, unknown>,
) {
  if (!Object.prototype.hasOwnProperty.call(patch || {}, "status")) return;
  const from = String(current?.status || "");
  const to = String(patch?.status || "");
  if (from === to || (from === "live" && to === "monetizing")) return;
  throw reviewRequiredError(
    `recover_billing_activation_transition_requires_reconciliation:${
      from || "UNKNOWN"
    }:${to || "UNKNOWN"}`,
  );
}

async function invokeRecoverBillingFaultHook(input: any, step: string) {
  if (typeof input?.fault_injection === "function") {
    await input.fault_injection(step);
  }
}

/**
 * Converges the local half of invoice issuance in dependency order. The report
 * claim is terminalized only after the Invoice projection, immutable issuance
 * event, and DealActivation projection all pass exact readback. Every earlier
 * step is replayable and never calls the provider.
 */
export async function convergeRecoverInvoiceIssuance(
  svc: any,
  claim: any,
  input: {
    invoice_patch: Record<string, unknown>;
    invoice_readback: Record<string, unknown>;
    invoice_immutable_fields?: string[];
    event_hash: string;
    event_record: Record<string, unknown>;
    activation_id: string;
    activation_patch: Record<string, unknown>;
    activation_readback: Record<string, unknown>;
    report_patch: Record<string, unknown>;
    fault_injection?: (step: string) => Promise<void> | void;
  },
) {
  if (!claim?.acquired || !claim?.invoice?.id) {
    throw new Error("recover_invoice_convergence_requires_owned_claim");
  }
  await renewRecoverInvoiceClaim(svc, claim);

  const invoiceId = String(claim.invoice.id);
  let invoice = await singleById(
    svc.entities.Invoice,
    invoiceId,
    "recover_invoice_projection_authority_unavailable",
  );
  const issuanceProjection = recoverIssuanceProjectionForCurrent(
    invoice,
    input.invoice_patch,
    input.invoice_readback,
  );
  for (const field of input.invoice_immutable_fields || []) {
    const current = invoice?.[field];
    const expected = input.invoice_readback?.[field];
    const currentPresent = current !== undefined && current !== null &&
      current !== "";
    if (
      currentPresent && stableStringify(current) !== stableStringify(expected)
    ) {
      throw reviewRequiredError(
        `recover_invoice_immutable_projection_conflict:${field}`,
      );
    }
  }
  if (!projectionMatches(invoice, issuanceProjection.readback)) {
    await invokeRecoverBillingFaultHook(input, "before_invoice_projection");
    invoice = await convergeProjectionByCas(
      svc.entities.Invoice,
      invoiceId,
      issuanceProjection.patch,
      issuanceProjection.readback,
      "recover_invoice_projection",
      assertRecoverInvoiceProjectionMonotonic,
    );
  }
  invoice = await singleById(
    svc.entities.Invoice,
    invoiceId,
    "recover_invoice_projection_readback_unavailable",
  );
  if (!projectionMatches(invoice, issuanceProjection.readback)) {
    throw new Error("recover_invoice_projection_readback_mismatch");
  }
  await invokeRecoverBillingFaultHook(input, "after_invoice_readback");

  await appendPaymentEventOnce(svc, input.event_hash, input.event_record);
  await invokeRecoverBillingFaultHook(input, "after_invoice_event_readback");

  const activationId = String(input.activation_id || "");
  if (!activationId) throw new Error("recover_invoice_activation_id_required");
  let activation = await singleById(
    svc.entities.DealActivation,
    activationId,
    "recover_invoice_activation_authority_unavailable",
  );
  if (!projectionMatches(activation, input.activation_readback)) {
    activation = await convergeProjectionByCas(
      svc.entities.DealActivation,
      activationId,
      input.activation_patch,
      input.activation_readback,
      "recover_invoice_activation",
      assertRecoverBillingActivationProjection,
    );
  }
  activation = await singleById(
    svc.entities.DealActivation,
    activationId,
    "recover_invoice_activation_readback_unavailable",
  );
  if (!projectionMatches(activation, input.activation_readback)) {
    throw new Error("recover_invoice_activation_readback_mismatch");
  }
  await invokeRecoverBillingFaultHook(input, "after_activation_readback");

  // A webhook may have advanced the invoice after the issuance projection was
  // read but before this local saga reached its terminal report step. Invoice
  // is the financial lifecycle authority; never preserve a stale paid/void
  // MonthlySavingsReport projection against it.
  invoice = await singleById(
    svc.entities.Invoice,
    invoiceId,
    "recover_invoice_terminal_authority_unavailable",
  );
  const reportProjection = recoverReportProjectionForInvoiceStatus(
    invoice.status,
  );
  const finalized = await finalizeRecoverInvoiceClaim(
    svc,
    claim,
    { ...input.report_patch, ...reportProjection },
  );
  let terminalReport = finalized.report;
  let terminalInvoice = invoice;
  let terminalStable = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    terminalInvoice = await singleById(
      svc.entities.Invoice,
      invoiceId,
      "recover_invoice_terminal_readback_unavailable",
    );
    if (
      String(terminalInvoice.monthly_savings_report_id || "") !==
        String(claim.invoice.monthly_savings_report_id)
    ) {
      throw reviewRequiredError(
        "recover_invoice_terminal_report_binding_mismatch",
      );
    }
    const canonicalReport = recoverReportProjectionForInvoiceStatus(
      terminalInvoice.status,
    );
    if (!projectionMatches(terminalReport, canonicalReport)) {
      terminalReport = await convergeProjectionByCas(
        svc.entities.MonthlySavingsReport,
        String(claim.invoice.monthly_savings_report_id),
        canonicalReport,
        canonicalReport,
        "recover_invoice_terminal_report",
      );
    }
    terminalReport = await singleById(
      svc.entities.MonthlySavingsReport,
      String(claim.invoice.monthly_savings_report_id),
      "recover_invoice_terminal_report_readback_unavailable",
    );
    const after = await singleById(
      svc.entities.Invoice,
      invoiceId,
      "recover_invoice_terminal_stability_readback_unavailable",
    );
    if (
      String(after.monthly_savings_report_id || "") ===
        String(claim.invoice.monthly_savings_report_id) &&
      String(after.status || "") === String(terminalInvoice.status || "") &&
      projectionMatches(terminalReport, canonicalReport)
    ) {
      terminalInvoice = after;
      terminalStable = true;
      break;
    }
  }
  if (!terminalStable) {
    throw reviewRequiredError(
      "recover_invoice_terminal_authority_changed_during_convergence",
    );
  }
  await invokeRecoverBillingFaultHook(input, "after_report_terminal_readback");
  return { invoice: terminalInvoice, activation, report: terminalReport };
}

/** Bounded exact read used by webhook reconciliation authorities. */
export async function readExactEntityOrNull(
  entity: any,
  filter: Record<string, unknown>,
  errorCode: string,
) {
  const rows = await entity.filter(filter, "-created_date", 2);
  if (!Array.isArray(rows)) {
    throw new Error(`${errorCode}_authority_unavailable`);
  }
  if (rows.length > 1) {
    throw new Error(`${errorCode}_ambiguous_review_required`);
  }
  return rows[0] || null;
}

/** A full cap+1 read: reaching the extra row means dedupe evidence is incomplete. */
export async function readBoundedPaymentEvents(
  svc: any,
  filter: Record<string, unknown>,
  cap = 5,
) {
  const safeCap = Math.max(1, Math.min(100, Math.floor(Number(cap) || 5)));
  const rows = await svc.entities.PaymentEvent.filter(
    filter,
    "created_date",
    safeCap + 1,
  );
  if (!Array.isArray(rows)) {
    throw new Error("payment_event_authority_unavailable");
  }
  if (rows.length >= safeCap + 1) {
    throw new Error("payment_event_history_truncated_review_required");
  }
  return oldestFirst(rows);
}

/**
 * Idempotently completes a webhook's local projections after Stripe has been
 * re-read. An existing PaymentEvent is evidence, not an early-return signal.
 */
export async function convergeRecoverBillingWebhook(svc: any, input: {
  invoice_id: string;
  invoice_patch: Record<string, unknown>;
  invoice_readback: Record<string, unknown>;
  event_hash: string;
  event_record: Record<string, unknown>;
  report_id?: string | null;
  report_patch?: Record<string, unknown>;
  report_readback?: Record<string, unknown>;
  activation_id?: string | null;
  activation_patch?: Record<string, unknown>;
  activation_readback?: Record<string, unknown>;
  fault_injection?: (step: string) => Promise<void> | void;
}) {
  const invoiceId = String(input.invoice_id || "");
  if (!invoiceId) throw new Error("recover_webhook_invoice_id_required");
  let invoice = await singleById(
    svc.entities.Invoice,
    invoiceId,
    "recover_webhook_invoice_authority_unavailable",
  );
  if (!projectionMatches(invoice, input.invoice_readback)) {
    invoice = await convergeProjectionByCas(
      svc.entities.Invoice,
      invoiceId,
      input.invoice_patch,
      input.invoice_readback,
      "recover_webhook_invoice",
      assertRecoverInvoiceProjectionMonotonic,
    );
  }
  invoice = await singleById(
    svc.entities.Invoice,
    invoiceId,
    "recover_webhook_invoice_readback_unavailable",
  );
  if (!projectionMatches(invoice, input.invoice_readback)) {
    throw new Error("recover_webhook_invoice_readback_mismatch");
  }
  await invokeRecoverBillingFaultHook(input, "after_webhook_invoice_readback");

  await appendPaymentEventOnce(svc, input.event_hash, input.event_record);
  await invokeRecoverBillingFaultHook(input, "after_webhook_event_readback");

  let report: any = null;
  let reportInvoiceAuthority: any = invoice;
  if (input.report_id) {
    const reportId = String(input.report_id);
    let stable = false;
    // Require an Invoice-authority sandwich around the report projection. A
    // stale paid webhook may resume after a stronger dispute/refund changed
    // both entities; deriving from the current Invoice prevents paid evidence
    // from being resurrected. One bounded repair handles a status change that
    // races the first report CAS; a second change becomes explicit review.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      reportInvoiceAuthority = await singleById(
        svc.entities.Invoice,
        invoiceId,
        "recover_webhook_report_invoice_authority_unavailable",
      );
      if (
        String(reportInvoiceAuthority.monthly_savings_report_id || "") !==
          reportId
      ) {
        throw reviewRequiredError(
          "recover_webhook_report_invoice_binding_mismatch",
        );
      }
      const canonicalProjection = recoverReportProjectionForInvoiceStatus(
        reportInvoiceAuthority.status,
      );
      const reportPatch = {
        ...(input.report_patch || {}),
        ...canonicalProjection,
      };
      const reportReadback = {
        ...(input.report_readback || {}),
        ...canonicalProjection,
      };
      report = await singleById(
        svc.entities.MonthlySavingsReport,
        reportId,
        "recover_webhook_report_authority_unavailable",
      );
      if (!projectionMatches(report, reportReadback)) {
        report = await convergeProjectionByCas(
          svc.entities.MonthlySavingsReport,
          reportId,
          reportPatch,
          reportReadback,
          "recover_webhook_report",
        );
      }
      report = await singleById(
        svc.entities.MonthlySavingsReport,
        reportId,
        "recover_webhook_report_readback_unavailable",
      );
      if (!projectionMatches(report, reportReadback)) {
        throw new Error("recover_webhook_report_readback_mismatch");
      }
      const after = await singleById(
        svc.entities.Invoice,
        invoiceId,
        "recover_webhook_report_invoice_readback_unavailable",
      );
      if (
        String(after.monthly_savings_report_id || "") === reportId &&
        String(after.status || "") ===
          String(reportInvoiceAuthority.status || "")
      ) {
        reportInvoiceAuthority = after;
        stable = true;
        break;
      }
    }
    if (!stable) {
      throw reviewRequiredError(
        "recover_webhook_report_invoice_authority_changed_during_convergence",
      );
    }
  }
  await invokeRecoverBillingFaultHook(input, "after_webhook_report_readback");
  invoice = reportInvoiceAuthority;

  let activation: any = null;
  if (
    input.activation_id &&
    String(reportInvoiceAuthority?.status || invoice?.status || "") === "paid"
  ) {
    activation = await singleById(
      svc.entities.DealActivation,
      String(input.activation_id),
      "recover_webhook_activation_authority_unavailable",
    );
    if (!projectionMatches(activation, input.activation_readback || {})) {
      activation = await convergeProjectionByCas(
        svc.entities.DealActivation,
        String(input.activation_id),
        input.activation_patch || {},
        input.activation_readback || {},
        "recover_webhook_activation",
        assertRecoverBillingActivationProjection,
      );
    }
    activation = await singleById(
      svc.entities.DealActivation,
      String(input.activation_id),
      "recover_webhook_activation_readback_unavailable",
    );
    if (!projectionMatches(activation, input.activation_readback || {})) {
      throw new Error("recover_webhook_activation_readback_mismatch");
    }
  }
  await invokeRecoverBillingFaultHook(
    input,
    "after_webhook_activation_readback",
  );
  return { invoice, report, activation };
}

/** Reconciles/quarantines a webhook mismatch with the same immutable ordering. */
export async function convergeRecoverBillingWebhookMismatch(svc: any, input: {
  invoice_id: string;
  invoice_patch: Record<string, unknown>;
  invoice_readback: Record<string, unknown>;
  event_hash: string;
  event_record: Record<string, unknown>;
}) {
  const invoiceId = String(input.invoice_id || "");
  let invoice = await singleById(
    svc.entities.Invoice,
    invoiceId,
    "recover_webhook_invoice_authority_unavailable",
  );
  if (!projectionMatches(invoice, input.invoice_readback)) {
    invoice = await convergeProjectionByCas(
      svc.entities.Invoice,
      invoiceId,
      input.invoice_patch,
      input.invoice_readback,
      "recover_webhook_invoice",
      assertRecoverInvoiceProjectionMonotonic,
    );
  }
  invoice = await singleById(
    svc.entities.Invoice,
    invoiceId,
    "recover_webhook_invoice_readback_unavailable",
  );
  if (!projectionMatches(invoice, input.invoice_readback)) {
    throw new Error("recover_webhook_invoice_readback_mismatch");
  }
  await appendPaymentEventOnce(svc, input.event_hash, input.event_record);
  return { invoice };
}

export async function renewRecoverInvoiceClaim(
  svc: any,
  claim: any,
  nowMs = Date.now(),
  leaseMs = RECOVER_INVOICE_CLAIM_LEASE_MS,
) {
  if (
    !claim?.acquired || !claim?.claim_token ||
    !claim?.invoice?.monthly_savings_report_id
  ) {
    throw new Error("recover_invoice_renew_requires_owned_claim");
  }
  const requestedLeaseMs = Number(leaseMs);
  if (
    !Number.isFinite(nowMs) || !Number.isFinite(requestedLeaseMs) ||
    requestedLeaseMs <= 0
  ) {
    throw new Error("recover_invoice_renew_lease_invalid");
  }
  const reportId = String(claim.invoice.monthly_savings_report_id);
  const authority = await assertRecoverInvoiceClaimFence(svc, claim, nowMs);
  const expiresMs = nowMs + Math.max(60_000, requestedLeaseMs);
  if (!Number.isFinite(expiresMs)) {
    throw new Error("recover_invoice_renew_lease_invalid");
  }
  const expiresAt = new Date(expiresMs).toISOString();
  const renewFilter = bindRecoverClaimAuthoritySnapshot({
    id: reportId,
    billing_eligibility_status: "invoice_claimed",
    invoice_id: String(claim.invoice.id),
    invoice_claim_token: String(claim.claim_token),
  }, authority);
  const changed = await svc.entities.MonthlySavingsReport.updateMany(
    renewFilter,
    { $set: { invoice_claim_expires_at: expiresAt } },
  );
  const report = await singleById(
    svc.entities.MonthlySavingsReport,
    reportId,
    "recover_invoice_renew_readback_unavailable",
  );
  if (
    !updatedExactlyOne(changed) ||
    report.billing_eligibility_status !== "invoice_claimed" ||
    String(report.invoice_id) !== String(claim.invoice.id) ||
    String(report.invoice_claim_token) !== String(claim.claim_token) ||
    report.invoice_claim_expires_at !== expiresAt ||
    new Date(report.invoice_claim_expires_at).getTime() !== expiresMs
  ) throw new Error("recover_invoice_claim_lost_before_provider_effect");
  return { ...claim, invoice_claim_expires_at: expiresAt };
}

export async function appendPaymentEventOnce(
  svc: any,
  eventHash: string,
  record: any,
) {
  if (!eventHash) throw new Error("payment_event_hash_required");
  const limit = 6;
  const immutableProjection = (row: any) =>
    stableStringify({
      invoice_id: row?.invoice_id || "",
      event_hash: row?.event_hash || "",
      event_type: row?.event_type || "",
      processor: row?.processor || "",
      processor_ref: row?.processor_ref || "",
      processor_event_id: row?.processor_event_id || "",
      amount: row?.amount ?? null,
      currency: row?.currency || "",
      occurred_at: row?.occurred_at || "",
      metadata_json: row?.metadata_json ?? null,
    });
  const verifyRows = (rows: any[], expected: any) => {
    if (!Array.isArray(rows)) {
      throw new Error("payment_event_authority_unavailable");
    }
    if (rows.length >= limit) {
      throw new Error("payment_event_history_truncated_review_required");
    }
    const expectedProjection = immutableProjection({
      ...expected,
      event_hash: eventHash,
    });
    for (const row of rows) {
      if (immutableProjection(row) !== expectedProjection) {
        throw new Error("payment_event_hash_conflict_review_required");
      }
    }
    return oldestFirst(rows);
  };
  const before = await svc.entities.PaymentEvent.filter(
    { invoice_id: record.invoice_id, event_hash: eventHash },
    "created_date",
    limit,
  );
  const existing = verifyRows(before, record)[0];
  if (existing) {
    return { created: false, event: existing, duplicate_rows: before.length };
  }

  const created = await svc.entities.PaymentEvent.create({
    ...record,
    event_hash: eventHash,
  });
  const after = verifyRows(
    await svc.entities.PaymentEvent.filter(
      { invoice_id: record.invoice_id, event_hash: eventHash },
      "created_date",
      limit,
    ),
    record,
  );
  if (!after.length) throw new Error("payment_event_unreadable_after_create");
  const winner = after[0];
  // Exact duplicates are preserved. PaymentEvent is immutable evidence: no
  // delete/update is allowed merely to make a race look unique.
  return {
    created: winner.id === created.id,
    event: winner,
    duplicate_rows: after.length,
  };
}

export function validateStripeInvoiceBinding(inv: any, remote: any) {
  const reasons: string[] = [];
  const remoteId = String(remote?.id || "");
  const remoteCustomer = typeof remote?.customer === "string"
    ? remote.customer
    : String(remote?.customer?.id || "");
  const remoteCurrency = String(remote?.currency || "").toUpperCase();
  const expectedCurrency = String(inv?.currency || "EUR").toUpperCase();
  const metadata = remote?.metadata || {};
  const expectedTotalMinor = expectedInvoiceTotalMinor(inv);
  const remoteTotalMinor = Number(remote?.total);

  if (!inv?.stripe_invoice_id || remoteId !== String(inv.stripe_invoice_id)) {
    reasons.push("stripe_invoice_id_mismatch");
  }
  if (
    inv?.processor_customer_id &&
    remoteCustomer !== String(inv.processor_customer_id)
  ) reasons.push("stripe_customer_mismatch");
  if (remoteCurrency && remoteCurrency !== expectedCurrency) {
    reasons.push("stripe_currency_mismatch");
  }
  if (
    !Number.isInteger(remoteTotalMinor) ||
    remoteTotalMinor !== expectedTotalMinor
  ) reasons.push("stripe_total_mismatch");
  if (String(metadata.local_invoice_id || "") !== String(inv?.id || "")) {
    reasons.push("stripe_metadata_local_invoice_mismatch");
  }
  if (
    inv?.monthly_savings_report_id &&
    String(metadata.monthly_savings_report_id || "") !==
      String(inv.monthly_savings_report_id)
  ) reasons.push("stripe_metadata_report_mismatch");
  if (
    inv?.deal_activation_id &&
    String(metadata.deal_activation_id || "") !== String(inv.deal_activation_id)
  ) reasons.push("stripe_metadata_activation_mismatch");

  return {
    ok: reasons.length === 0,
    reasons,
    expectedTotalMinor,
    remoteTotalMinor: Number.isInteger(remoteTotalMinor)
      ? remoteTotalMinor
      : null,
    remotePaidMinor: Number.isInteger(Number(remote?.amount_paid))
      ? Number(remote.amount_paid)
      : 0,
    remoteDueMinor: Number.isInteger(Number(remote?.amount_due))
      ? Number(remote.amount_due)
      : Math.max(0, expectedTotalMinor - (Number(remote?.amount_paid) || 0)),
  };
}

/**
 * Proves that the signed webhook object itself belongs to the selected local
 * Invoice before any dispute/refund/status projection is applied. Metadata is
 * only a lookup hint; it never overrides Stripe invoice, payment-intent or
 * charge identity.
 */
export function validateStripeWebhookInvoiceEventBinding(
  inv: any,
  eventType: string,
  eventObject: any,
  stripeInvoiceId: string,
) {
  const reasons: string[] = [];
  const invoiceId = String(inv?.stripe_invoice_id || "");
  const eventInvoiceId = String(stripeInvoiceId || "");
  const metadataLocalId = String(
    eventObject?.metadata?.local_invoice_id ||
      eventObject?.lines?.data?.[0]?.metadata?.local_invoice_id ||
      "",
  );
  if (metadataLocalId && metadataLocalId !== String(inv?.id || "")) {
    reasons.push("webhook_metadata_local_invoice_mismatch");
  }

  if (String(eventType || "").startsWith("invoice.")) {
    if (!eventInvoiceId || eventInvoiceId !== invoiceId) {
      reasons.push("webhook_invoice_id_mismatch");
    }
  } else if (eventType === "credit_note.created") {
    if (!eventInvoiceId || eventInvoiceId !== invoiceId) {
      reasons.push("webhook_credit_note_invoice_mismatch");
    }
  } else if (eventType === "charge.dispute.created") {
    const paymentIntentId = typeof eventObject?.payment_intent === "string"
      ? eventObject.payment_intent
      : String(eventObject?.payment_intent?.id || "");
    const chargeId = typeof eventObject?.charge === "string"
      ? eventObject.charge
      : String(eventObject?.charge?.id || "");
    const invoiceBound = Boolean(
      eventInvoiceId && eventInvoiceId === invoiceId,
    );
    const paymentIntentBound = Boolean(
      paymentIntentId &&
        inv?.processor_payment_intent_id &&
        paymentIntentId === String(inv.processor_payment_intent_id),
    );
    const chargeBound = Boolean(
      chargeId && inv?.stripe_charge_id &&
        chargeId === String(inv.stripe_charge_id),
    );
    if (!invoiceBound && !paymentIntentBound && !chargeBound) {
      reasons.push("webhook_dispute_invoice_binding_missing_or_mismatch");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function stripeStatusProjection(
  inv: any,
  remote: any,
  nowIso = new Date().toISOString(),
) {
  const remoteStatus = String(remote?.status || "");
  const paidMinor = Number.isInteger(Number(remote?.amount_paid))
    ? Number(remote.amount_paid)
    : 0;
  const dueMinor = Number.isInteger(Number(remote?.amount_due))
    ? Number(remote.amount_due)
    : Math.max(0, expectedInvoiceTotalMinor(inv) - paidMinor);
  const totalMinor = expectedInvoiceTotalMinor(inv);
  const current = String(inv?.status || "draft");

  // Dispute/refund are stronger states than a normal paid/open invoice and must
  // never be erased by a late invoice.* webhook.
  let target = current;
  if (!["disputed", "refunded"].includes(current)) {
    if (remoteStatus === "paid") target = "paid";
    else if (remoteStatus === "void") target = "void";
    else if (remoteStatus === "uncollectible") target = "failed";
    else if (remoteStatus === "open") {
      if (paidMinor > 0 && dueMinor > 0) target = "partially_paid";
      else if (dueMinor > 0) target = current === "overdue" ? "overdue" : "due";
    } else if (remoteStatus === "draft" && current === "draft") {
      target = "draft";
    }
  }

  const patch: Record<string, unknown> = {
    stripe_invoice_status: remoteStatus || inv?.stripe_invoice_status || "",
    amount_paid: Math.round(paidMinor) / 100,
    balance_due: Math.max(0, Math.round(dueMinor) / 100),
    reconciliation_status: "ok",
    reconciliation_error: "",
    last_reconciled_at: nowIso,
  };
  if (target !== current) patch.status = target;
  if (target === "paid") {
    patch.balance_due = 0;
    patch.amount_paid = Math.round(totalMinor) / 100;
    patch.paid_at = inv?.paid_at ||
      (remote?.status_transitions?.paid_at
        ? new Date(remote.status_transitions.paid_at * 1000).toISOString()
        : nowIso);
  }
  if (target === "void") {
    patch.void_reason = inv?.void_reason || "voided_in_stripe";
  }

  const changed = Object.entries(patch).some(([key, value]) => {
    if (key === "last_reconciled_at") return false;
    return JSON.stringify(inv?.[key] ?? null) !== JSON.stringify(value ?? null);
  });
  return { targetStatus: target, patch, changed };
}

/**
 * Selects one deterministic reconciliation window from a server-sorted cap+1
 * authority read. Missing or invalid attempt timestamps are repaired first;
 * stable id ordering removes page-order ambiguity inside equal timestamps.
 */
export function selectLeastRecentlyReconciledInvoices(
  rows: unknown,
  limit: number,
) {
  if (!Array.isArray(rows)) {
    throw new Error("recover_reconciliation_invoice_authority_unavailable");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("recover_reconciliation_batch_limit_invalid");
  }
  if (rows.length > limit + 1) {
    throw new Error("recover_reconciliation_bounded_read_overflow");
  }

  const seen = new Set<string>();
  let invalid_timestamp_count = 0;
  const prioritized = rows.map((row: any) => {
    const id = String(row?.id || "").trim();
    const reportId = String(row?.monthly_savings_report_id || "").trim();
    const stripeInvoiceId = String(row?.stripe_invoice_id || "").trim();
    if (
      !id || String(row?.payment_provider || "") !== "stripe" || !reportId ||
      !stripeInvoiceId
    ) {
      throw new Error("recover_reconciliation_candidate_binding_invalid");
    }
    if (seen.has(id)) {
      throw new Error("recover_reconciliation_invoice_authority_ambiguous");
    }
    seen.add(id);

    const raw = String(row?.last_reconciled_at || "").trim();
    const parsed = raw ? new Date(raw).getTime() : Number.NaN;
    const timestampKnown = Number.isFinite(parsed);
    if (raw && !timestampKnown) invalid_timestamp_count += 1;
    return {
      row,
      id,
      timestamp_known: timestampKnown,
      timestamp_ms: timestampKnown ? parsed : Number.NEGATIVE_INFINITY,
    };
  });

  prioritized.sort((left, right) => {
    if (left.timestamp_known !== right.timestamp_known) {
      return left.timestamp_known ? 1 : -1;
    }
    if (left.timestamp_ms !== right.timestamp_ms) {
      return left.timestamp_ms - right.timestamp_ms;
    }
    return left.id.localeCompare(right.id);
  });

  return {
    candidates: prioritized.slice(0, limit).map((entry) => entry.row),
    observed_count: prioritized.length,
    read_cap: limit + 1,
    backlog: prioritized.length > limit,
    coverage_status: prioritized.length > limit
      ? "BOUNDED_BACKLOG"
      : "COMPLETE_WINDOW",
    invalid_timestamp_count,
  };
}

export function recoverReportProjectionForInvoiceStatus(status: unknown) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "paid") {
    return Object.freeze({ status: "paid", verification_status: "paid" });
  }
  if (normalized === "refunded" || normalized === "void") {
    // The schema has no refunded verification state. `realized` preserves the
    // measured savings truth while explicitly revoking paid/invoiced evidence;
    // the Invoice and PaymentEvent retain the refund/void financial truth.
    return Object.freeze({
      status: "calculated",
      verification_status: "realized",
    });
  }
  return Object.freeze({
    status: "invoiced",
    verification_status: "invoiced",
  });
}

export function reconciliationEventHash(
  inv: any,
  remote: any,
  kind = "reconciled",
): string {
  return [
    "p6",
    kind,
    String(inv?.id || ""),
    String(remote?.id || ""),
    String(remote?.status || ""),
    String(remote?.total ?? ""),
    String(remote?.amount_paid ?? ""),
    String(remote?.amount_due ?? ""),
  ].join(":");
}
