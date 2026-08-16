// P3/P4/P5 transport boundary. This module never writes P4 estimates to P3.
// Environment configuration is intentionally required: missing configuration
// fails closed rather than pretending P4 is connected.

export const P4_BRIDGE_VERSION = "p4-bridge-1.0.0";
export const P4_COST_RECEIPT_VERSION = "p4-cost-receipt.v1";
export const P4_CANONICAL_CONTEXT_VERSION = "p4-canonical-context.v1";
export const P4_DEPLOYMENT_GATE_VERSION = "p4-deployment-gate.v1";
const text = new TextEncoder();

function requiredString(value: unknown, code: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function optionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function requiredIso(value: unknown, code: string): string {
  const normalized = requiredString(value, code);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(code);
  return normalized;
}

function finiteNumber(value: unknown, code: string): number {
  if (value === null || value === undefined || value === "") {
    throw new Error(code);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function optionalFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedNumericMap(value: unknown, code: string) {
  const record = plainRecord(value) || {};
  const output: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (!/^[a-z0-9_.:-]{1,80}$/i.test(key)) throw new Error(code);
    const parsed = optionalFinite(raw);
    if (parsed === null || parsed < 0) throw new Error(code);
    output[key] = parsed;
  }
  return output;
}

function containsForbiddenP4Material(
  value: unknown,
  path = "root",
): string | null {
  if (typeof value === "string") {
    if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) {
      return `${path}:email`;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = containsForbiddenP4Material(
        value[index],
        `${path}[${index}]`,
      );
      if (found) return found;
    }
    return null;
  }
  const record = plainRecord(value);
  if (!record) return null;
  for (const [key, child] of Object.entries(record)) {
    if (
      /(?:token|secret|credential|password|authorization|cookie|email|phone|contact|person_name|full_name|raw_document|raw_observation|feature_snapshot|observations)/i
        .test(key)
    ) return `${path}.${key}`;
    const found = containsForbiddenP4Material(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function requireP4ServiceConfig() {
  const baseUrl = requiredString(
    Deno.env.get("P4_SERVICE_URL"),
    "p4_service_url_not_configured",
  ).replace(/\/$/, "");
  const token = requiredString(
    Deno.env.get("P4_SERVICE_TOKEN"),
    "p4_service_token_not_configured",
  );
  return { baseUrl, token };
}

/**
 * Resolves the only deployment that the Base44 control plane may ask the
 * optional P4 service to execute. Environment strings are configuration, not
 * proof of production: this gate authorizes an internal advisory call only.
 */
export function requireP4DeploymentConfig(at = new Date().toISOString()) {
  const evaluatedAt = requiredIso(at, "p4_deployment_evaluation_time_invalid");
  const availableAt = requiredIso(
    Deno.env.get("P4_APPROVED_DEPLOYMENT_AVAILABLE_AT"),
    "p4_approved_deployment_available_at_not_configured",
  );
  const expiresAt = requiredIso(
    Deno.env.get("P4_APPROVED_DEPLOYMENT_EXPIRES_AT"),
    "p4_approved_deployment_expires_at_not_configured",
  );
  const status = requiredString(
    Deno.env.get("P4_APPROVED_DEPLOYMENT_STATUS"),
    "p4_approved_deployment_status_not_configured",
  );
  if (status !== "APPROVED_ADVISORY") {
    throw new Error("p4_deployment_not_approved_for_advisory_use");
  }
  if (Date.parse(availableAt) > Date.parse(evaluatedAt)) {
    throw new Error("p4_deployment_not_yet_available");
  }
  if (Date.parse(expiresAt) <= Date.parse(evaluatedAt)) {
    throw new Error("p4_deployment_expired");
  }
  return {
    gate_version: P4_DEPLOYMENT_GATE_VERSION,
    deployment_id: requiredString(
      Deno.env.get("P4_APPROVED_DEPLOYMENT_ID"),
      "p4_approved_deployment_id_not_configured",
    ),
    model_version_id: requiredString(
      Deno.env.get("P4_APPROVED_MODEL_VERSION_ID"),
      "p4_approved_model_version_not_configured",
    ),
    target_spec_id: requiredString(
      Deno.env.get("P4_MERCHANT_EFFECTIVE_RATE_TARGET_SPEC_ID"),
      "p4_target_spec_not_configured",
    ),
    fee_perimeter: requiredString(
      Deno.env.get("P4_APPROVED_FEE_PERIMETER"),
      "p4_approved_fee_perimeter_not_configured",
    ),
    source_population: requiredString(
      Deno.env.get("P4_APPROVED_SOURCE_POPULATION"),
      "p4_approved_source_population_not_configured",
    ),
    horizon: requiredString(
      Deno.env.get("P4_APPROVED_HORIZON"),
      "p4_approved_horizon_not_configured",
    ),
    unit: requiredString(
      Deno.env.get("P4_APPROVED_TARGET_UNIT"),
      "p4_approved_target_unit_not_configured",
    ),
    status,
    available_at: availableAt,
    expires_at: expiresAt,
    evaluated_at: evaluatedAt,
    authority_granted: false,
    material_automation_allowed: false,
  };
}

/** Copies only the factual aggregate fields produced by our verified P4 projection. */
export function sanitizeP4ObservationForContext(value: unknown) {
  const observation = plainRecord(value);
  if (!observation) throw new Error("p4_projection_observation_required");
  const forbidden = containsForbiddenP4Material(observation);
  if (forbidden) throw new Error("p4_projection_contains_forbidden_material");
  const targetSpecId = requiredString(
    observation.target_spec_id,
    "p4_projection_target_spec_required",
  );
  const currency = requiredString(
    observation.currency,
    "p4_projection_currency_required",
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("p4_projection_currency_invalid");
  }
  return {
    observation_id: requiredString(
      observation.observation_id,
      "p4_projection_observation_id_required",
    ),
    tenant_scope_token: requiredString(
      observation.tenant_id,
      "p4_projection_tenant_scope_token_required",
    ),
    merchant_group_key: requiredString(
      observation.merchant_group_key,
      "p4_projection_merchant_key_required",
    ),
    contract_group_key: requiredString(
      observation.contract_group_key,
      "p4_projection_contract_key_required",
    ),
    observed_at: requiredIso(
      observation.observed_at,
      "p4_projection_observed_at_required",
    ),
    market: requiredString(observation.market, "p4_projection_market_required"),
    provider: requiredString(
      observation.provider,
      "p4_projection_provider_required",
    ),
    legal_entity: optionalString(observation.legal_entity),
    product: requiredString(
      observation.product,
      "p4_projection_product_required",
    ),
    channel: requiredString(
      observation.channel,
      "p4_projection_channel_required",
    ),
    pricing_model: requiredString(
      observation.pricing_model,
      "p4_projection_pricing_model_required",
    ),
    fee_perimeter: requiredString(
      observation.fee_perimeter,
      "p4_projection_fee_perimeter_required",
    ),
    currency,
    source_population: requiredString(
      observation.source_population,
      "p4_projection_source_population_required",
    ),
    target_spec_id: targetSpecId,
    target_value: finiteNumber(
      observation.target_value,
      "p4_projection_target_value_required",
    ),
    tpv: finiteNumber(observation.tpv, "p4_projection_tpv_required"),
    transaction_count: finiteNumber(
      observation.transaction_count,
      "p4_projection_transaction_count_required",
    ),
    avg_ticket: optionalFinite(observation.avg_ticket),
    merchant_segment: optionalString(observation.merchant_segment),
    card_mix: boundedNumericMap(
      observation.card_mix,
      "p4_projection_card_mix_invalid",
    ),
    payment_method_mix: boundedNumericMap(
      observation.payment_method_mix,
      "p4_projection_payment_method_mix_invalid",
    ),
    quality_weight: finiteNumber(
      observation.quality_weight,
      "p4_projection_quality_weight_required",
    ),
    is_synthetic: observation.is_synthetic === true,
    learning_eligibility_status: "QUARANTINED",
    learning_eligibility_ref: null,
  };
}

/**
 * Builds the external payload from committed server records. Raw Brand ids,
 * Integration credentials, caller context and free text never enter it.
 */
export function buildP4CanonicalContext(input: {
  brand: any;
  integration: any;
  projection: any;
  deployment: ReturnType<typeof requireP4DeploymentConfig>;
  prediction_time: string;
}) {
  const predictionTime = requiredIso(
    input.prediction_time,
    "p4_prediction_time_invalid",
  );
  const brandId = requiredString(input.brand?.id, "p4_brand_identity_required");
  if (input.brand?.is_demo === true) throw new Error("p4_demo_brand_forbidden");
  if (
    String(input.projection?.brand_id || "") !== brandId ||
    String(input.integration?.brand_id || "") !== brandId ||
    String(input.projection?.integration_id || "") !==
      String(input.integration?.id || "")
  ) throw new Error("p4_projection_tenant_binding_invalid");
  if (input.projection?.status !== "CURRENT") {
    throw new Error("p4_projection_not_current");
  }
  if (input.integration?.status !== "connected") {
    throw new Error("p4_integration_not_connected");
  }
  const observation = sanitizeP4ObservationForContext(
    input.projection?.observation_json,
  );
  const deployment = input.deployment;
  if (observation.target_spec_id !== deployment.target_spec_id) {
    throw new Error("p4_projection_target_spec_mismatch");
  }
  if (observation.fee_perimeter !== deployment.fee_perimeter) {
    throw new Error("p4_projection_fee_perimeter_mismatch");
  }
  if (observation.source_population !== deployment.source_population) {
    throw new Error("p4_projection_source_population_mismatch");
  }
  const projectionAvailableAt = requiredIso(
    input.projection?.known_at,
    "p4_projection_available_at_required",
  );
  if (Date.parse(projectionAvailableAt) > Date.parse(predictionTime)) {
    throw new Error("p4_projection_future_leakage");
  }
  return {
    schema_version: P4_CANONICAL_CONTEXT_VERSION,
    purpose: "CPIC_ADVISORY_ESTIMATE",
    prediction_time: predictionTime,
    tenant_scope_token: observation.tenant_scope_token,
    subject: {
      subject_type: "MERCHANT",
      canonical_pseudonym: observation.merchant_group_key,
      contract_pseudonym: observation.contract_group_key,
    },
    target: {
      target_spec_id: deployment.target_spec_id,
      unit: deployment.unit,
      currency: observation.currency,
      fee_perimeter: deployment.fee_perimeter,
      source_population: deployment.source_population,
      horizon: deployment.horizon,
    },
    evidence: {
      source_type: input.projection.source_type,
      source_fingerprint: input.projection.source_fingerprint,
      observed_at: observation.observed_at,
      available_at: projectionAvailableAt,
      projection_version: input.projection.projection_version,
    },
    observation,
    deployment: {
      deployment_id: deployment.deployment_id,
      model_version_id: deployment.model_version_id,
      available_at: deployment.available_at,
      expires_at: deployment.expires_at,
      status: deployment.status,
    },
  };
}

export function p4CostReceiptFromResponse(value: unknown) {
  const envelope = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const candidate = envelope?.cost_receipt;
  if (!candidate) {
    return {
      reliable: false,
      reason: "P4_COST_RECEIPT_MISSING",
      receipt: null,
    };
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return {
      reliable: false,
      reason: "P4_COST_RECEIPT_INVALID",
      receipt: null,
    };
  }
  const receipt = candidate as Record<string, unknown>;
  if (receipt.schema_version !== P4_COST_RECEIPT_VERSION) {
    return {
      reliable: false,
      reason: "P4_COST_RECEIPT_SCHEMA_UNSUPPORTED",
      receipt: null,
    };
  }
  const receiptId = String(receipt.receipt_id || "").trim();
  const providerOperationId = String(receipt.provider_operation_id || "")
    .trim();
  const issuedAt = String(receipt.issued_at || "").trim();
  if (
    !receiptId || !providerOperationId || !issuedAt ||
    !Number.isFinite(Date.parse(issuedAt))
  ) {
    return {
      reliable: false,
      reason: "P4_COST_RECEIPT_IDENTITY_OR_TIME_INVALID",
      receipt: null,
    };
  }
  if (receipt.currency !== "EUR") {
    return {
      reliable: false,
      reason: "P4_COST_RECEIPT_CURRENCY_UNSUPPORTED",
      receipt: null,
    };
  }
  if (
    !Number.isInteger(receipt.amount_minor) || Number(receipt.amount_minor) < 0
  ) {
    return {
      reliable: false,
      reason: "P4_COST_RECEIPT_AMOUNT_INVALID",
      receipt: null,
    };
  }
  if (receipt.final !== true) {
    return {
      reliable: false,
      reason: "P4_COST_RECEIPT_NOT_FINAL",
      receipt: null,
    };
  }
  return {
    reliable: true,
    reason: "P4_COST_RECEIPT_RELIABLE",
    receipt: {
      schema_version: P4_COST_RECEIPT_VERSION,
      receipt_id: receiptId,
      provider_operation_id: providerOperationId,
      amount_minor: Number(receipt.amount_minor),
      currency: "EUR",
      final: true,
      issued_at: issuedAt,
    },
  };
}

export async function p4Pseudonym(
  kind: "merchant" | "contract",
  sourceId: string,
): Promise<string> {
  const secret = requiredString(
    Deno.env.get("P4_PSEUDONYMIZATION_KEY"),
    "p4_pseudonymization_key_not_configured",
  );
  const key = await crypto.subtle.importKey(
    "raw",
    text.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    text.encode(`${kind}:${sourceId}`),
  );
  return `p4_${kind}_${
    Array.from(new Uint8Array(signature)).map((x) =>
      x.toString(16).padStart(2, "0")
    ).join("")
  }`;
}

export async function p4FetchWithCostReceipt(
  path: string,
  init: RequestInit = {},
) {
  const { baseUrl, token } = requireP4ServiceConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    let body: any = null;
    try {
      body = await response.json();
    } catch (error) {
      console.error(JSON.stringify({
        event: "p4_response_json_invalid",
        path,
        status: response.status,
        error_name: error instanceof Error ? error.name : typeof error,
        observed_at: new Date().toISOString(),
      }));
    }
    const receipt = p4CostReceiptFromResponse(body);
    const transportTrusted = baseUrl.startsWith("https://");
    return {
      ok: response.ok,
      status: response.status,
      body,
      cost_receipt: receipt.reliable && transportTrusted
        ? receipt
        : receipt.reliable
        ? {
          reliable: false,
          reason: "P4_COST_RECEIPT_TRANSPORT_UNTRUSTED",
          receipt: null,
        }
        : receipt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function p4Fetch(path: string, init: RequestInit = {}) {
  const result = await p4FetchWithCostReceipt(path, init);
  if (!result.ok) throw new Error(`p4_service_${result.status}`);
  if (result.body === null) throw new Error("p4_service_invalid_json");
  return result.body;
}

export function p4ObservationFromVerifiedPayment(input: any) {
  const verified = input?.verified;
  const context = input?.context || {};
  const targetSpecId = requiredString(
    Deno.env.get("P4_MERCHANT_EFFECTIVE_RATE_TARGET_SPEC_ID"),
    "p4_target_spec_not_configured",
  );
  if (
    !Number.isFinite(verified?.measured_current_bps) ||
    Number(verified.measured_current_bps) < 0
  ) throw new Error("p4_verified_effective_rate_required");
  if (
    !verified?.measurement_window?.to ||
    Number(verified?.sample_metrics?.gmv_eur) < 0 ||
    Number(verified?.sample_metrics?.tx_count) < 0
  ) throw new Error("p4_verified_measurement_window_or_metrics_required");
  for (
    const key of [
      "market",
      "provider",
      "product",
      "channel",
      "pricing_model",
      "currency",
      "fee_perimeter",
    ]
  ) requiredString(context[key], `p4_context_${key}_required`);
  return {
    observation_id: requiredString(
      input.projectionKey,
      "p4_projection_key_required",
    ),
    tenant_id: requiredString(
      input.tenantPseudonym,
      "p4_tenant_pseudonym_required",
    ),
    merchant_group_key: requiredString(
      input.merchantPseudonym,
      "p4_merchant_pseudonym_required",
    ),
    contract_group_key: requiredString(
      input.contractPseudonym,
      "p4_contract_pseudonym_required",
    ),
    observed_at: verified.measurement_window.to,
    market: context.market,
    provider: context.provider,
    legal_entity: context.legal_entity || null,
    product: context.product,
    channel: context.channel,
    pricing_model: context.pricing_model,
    fee_perimeter: context.fee_perimeter,
    currency: context.currency,
    source_population: "MERCHANT_OBSERVED",
    target_spec_id: targetSpecId,
    target_value: Number(verified.measured_current_bps),
    tpv: Number(verified.sample_metrics.gmv_eur) * 100,
    transaction_count: Number(verified.sample_metrics.tx_count),
    avg_ticket: Number.isFinite(verified.sample_metrics.avg_ticket_eur)
      ? Number(verified.sample_metrics.avg_ticket_eur) * 100
      : null,
    merchant_segment: context.merchant_segment || null,
    card_mix: context.card_mix || {},
    payment_method_mix: context.payment_method_mix || {},
    quality_weight: Number.isFinite(context.quality_weight)
      ? Number(context.quality_weight)
      : 1,
    // A factual producer never decides whether this row may train a model.
    // Eligibility is assigned only by the shared durable policy after purpose,
    // lineage, maturity, dispute and temporal checks.
    training_eligibility: "NOT_DECIDED",
    learning_eligibility_status: "QUARANTINED",
    learning_eligibility_ref: null,
    is_synthetic: false,
  };
}

export function tenantSafeP4Estimate(value: any) {
  if (!value || typeof value !== "object") {
    throw new Error("invalid_p4_response");
  }
  for (
    const key of [
      "estimate_id",
      "deployment_id",
      "target_spec_id",
      "model_version_id",
      "as_of",
      "available_at",
      "status",
      "lineage_hash",
    ]
  ) requiredString(value[key], `p4_response_${key}_required`);
  const forbidden = containsForbiddenP4Material(value);
  if (forbidden) throw new Error("p4_private_evidence_response_forbidden");

  const finiteRecord = (candidate: unknown) => {
    const record = plainRecord(candidate) || {};
    return Object.fromEntries(
      Object.entries(record).flatMap(([key, raw]) => {
        if (!/^[a-z0-9_.:-]{1,100}$/i.test(key)) return [];
        const parsed = optionalFinite(raw);
        return parsed === null ? [] : [[key, parsed]];
      }),
    );
  };
  const stringList = (candidate: unknown) =>
    Array.isArray(candidate)
      ? candidate.map(optionalString).filter((item): item is string =>
        Boolean(item)
      )
        .slice(0, 100)
      : [];
  const interval = plainRecord(value.interval) || {};
  const support = plainRecord(value.support) || {};
  const ood = plainRecord(value.ood) || {};
  const target = plainRecord(value.target) || {};

  // Explicit recursive projection allowlist: unknown provider fields are not
  // retained merely because the top-level object looked harmless.
  return {
    estimate_id: requiredString(
      value.estimate_id,
      "p4_response_estimate_id_required",
    ),
    deployment_id: requiredString(
      value.deployment_id,
      "p4_response_deployment_id_required",
    ),
    target_spec_id: requiredString(
      value.target_spec_id,
      "p4_response_target_spec_id_required",
    ),
    model_version_id: requiredString(
      value.model_version_id,
      "p4_response_model_version_id_required",
    ),
    as_of: requiredIso(value.as_of, "p4_response_as_of_required"),
    available_at: requiredIso(
      value.available_at,
      "p4_response_available_at_required",
    ),
    training_cutoff: optionalString(value.training_cutoff),
    expires_at: optionalString(value.expires_at),
    status: requiredString(value.status, "p4_response_status_required"),
    lineage_hash: requiredString(
      value.lineage_hash,
      "p4_response_lineage_hash_required",
    ),
    unit: optionalString(value.unit),
    currency: optionalString(value.currency),
    estimand_population: optionalString(value.estimand_population),
    fee_perimeter: optionalString(value.fee_perimeter),
    horizon: optionalString(value.horizon),
    mean: optionalFinite(value.mean),
    median: optionalFinite(value.median),
    variance: optionalFinite(value.variance),
    quantiles: finiteRecord(value.quantiles),
    threshold_probabilities: finiteRecord(value.threshold_probabilities),
    interval: {
      lower: optionalFinite(interval.lower),
      upper: optionalFinite(interval.upper),
      level: optionalFinite(interval.level),
      kind: optionalString(interval.kind),
      calibrated: interval.calibrated === true,
    },
    support: {
      unique_merchants: optionalFinite(support.unique_merchants),
      raw_n: optionalFinite(support.raw_n),
      n_eff: optionalFinite(support.n_eff),
      effective_n: optionalFinite(support.effective_n),
      source_family_count: optionalFinite(support.source_family_count),
    },
    ood: {
      status: optionalString(ood.status) || "UNKNOWN_SUPPORT",
      reason_codes: stringList(ood.reason_codes),
    },
    target: {
      unit: optionalString(target.unit),
      currency: optionalString(target.currency),
      fee_perimeter: optionalString(target.fee_perimeter),
      source_population: optionalString(target.source_population),
      horizon: optionalString(target.horizon),
    },
    calibrated: value.calibrated === true,
  };
}

export function validateP4EstimateAgainstDeployment(
  estimate: unknown,
  deployment: ReturnType<typeof requireP4DeploymentConfig>,
  predictionTime: string,
  expectedTarget: unknown = {},
) {
  const value = plainRecord(estimate);
  if (!value) throw new Error("p4_response_contract_required");
  const target = plainRecord(value.target) || {};
  const expected = plainRecord(expectedTarget) || {};
  const ood = plainRecord(value.ood) || {};
  const reasons: string[] = [];
  const at = requiredIso(predictionTime, "p4_prediction_time_invalid");
  const asOf = requiredIso(value.as_of, "p4_response_as_of_required");
  const availableAt = requiredIso(
    value.available_at,
    "p4_response_available_at_required",
  );
  const expiresAt = requiredIso(
    value.expires_at,
    "p4_response_expires_at_required",
  );
  const trainingCutoff = value.training_cutoff
    ? requiredIso(value.training_cutoff, "p4_response_training_cutoff_invalid")
    : null;
  if (!["VALID", "FALLBACK"].includes(String(value.status || ""))) {
    reasons.push("P4_RESPONSE_STATUS_NOT_SERVABLE");
  }
  if (String(value.deployment_id || "") !== deployment.deployment_id) {
    reasons.push("P4_DEPLOYMENT_ID_MISMATCH");
  }
  if (String(value.target_spec_id || "") !== deployment.target_spec_id) {
    reasons.push("P4_TARGET_SPEC_MISMATCH");
  }
  if (String(value.model_version_id || "") !== deployment.model_version_id) {
    reasons.push("P4_MODEL_VERSION_MISMATCH");
  }
  if (
    String(target.fee_perimeter || value.fee_perimeter || "") !==
      deployment.fee_perimeter
  ) {
    reasons.push("P4_FEE_PERIMETER_MISMATCH");
  }
  if (
    String(target.source_population || value.estimand_population || "") !==
      deployment.source_population
  ) {
    reasons.push("P4_SOURCE_POPULATION_MISMATCH");
  }
  if (String(target.horizon || value.horizon || "") !== deployment.horizon) {
    reasons.push("P4_HORIZON_MISMATCH");
  }
  if (String(target.unit || value.unit || "") !== deployment.unit) {
    reasons.push("P4_TARGET_UNIT_MISMATCH");
  }
  if (
    expected.currency &&
    String(target.currency || value.currency || "").toUpperCase() !==
      String(expected.currency).toUpperCase()
  ) reasons.push("P4_TARGET_CURRENCY_MISMATCH");
  if (Date.parse(deployment.available_at) > Date.parse(at)) {
    reasons.push("P4_DEPLOYMENT_FUTURE_LEAKAGE");
  }
  if (Date.parse(asOf) > Date.parse(at)) {
    reasons.push("P4_RESPONSE_FUTURE_LEAKAGE");
  }
  if (Date.parse(availableAt) > Date.parse(at)) {
    reasons.push("P4_RESPONSE_NOT_AVAILABLE_AT_PREDICTION_TIME");
  }
  if (availableAt !== deployment.available_at) {
    reasons.push("P4_RESPONSE_DEPLOYMENT_AVAILABLE_AT_MISMATCH");
  }
  if (Date.parse(expiresAt) <= Date.parse(at)) {
    reasons.push("P4_RESPONSE_EXPIRED");
  }
  if (trainingCutoff && Date.parse(trainingCutoff) >= Date.parse(at)) {
    reasons.push("P4_TRAINING_CUTOFF_FUTURE_LEAKAGE");
  }
  if (reasons.length) {
    throw new Error(
      `p4_response_contract_mismatch:${reasons.sort().join(",")}`,
    );
  }
  const sourceStatus = String(ood.status || "UNKNOWN_SUPPORT");
  return {
    gate_version: P4_DEPLOYMENT_GATE_VERSION,
    deployment_id: deployment.deployment_id,
    model_version_id: deployment.model_version_id,
    target_spec_id: deployment.target_spec_id,
    fee_perimeter: deployment.fee_perimeter,
    source_population: deployment.source_population,
    horizon: deployment.horizon,
    unit: deployment.unit,
    deployment_available_at: deployment.available_at,
    deployment_expires_at: deployment.expires_at,
    response_as_of: asOf,
    response_available_at: availableAt,
    response_expires_at: expiresAt,
    source_reported_support_status: sourceStatus,
    canonical_support_status: "UNKNOWN_SUPPORT",
    support_semantics:
      "SOURCE_REPORTED_OR_HEURISTIC_NOT_REGISTERED_OOD_DETECTOR",
    decision_status: "ABSTAIN",
    reason_codes: ["REGISTERED_SUPPORT_DETECTOR_NOT_RESOLVED"],
    registered_support_detector_resolved: false,
    calibrated_claim_allowed: false,
    model_claim_allowed: false,
    material_automation_allowed: false,
    authority_granted: false,
  };
}
