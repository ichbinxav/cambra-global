// AUDIT 2026-08-18 — moved out of base44/functions/requestP4Estimate/entry.ts so hosts of this
// logical route can import it without a relative import escaping their bundle.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../internalGate.ts";
import { sha256 } from "../p3RateIntelligence.ts";
import {
  buildP4CanonicalContext,
  P4_BRIDGE_VERSION,
  p4FetchWithCostReceipt,
  requireP4DeploymentConfig,
  requireP4ServiceConfig,
  tenantSafeP4Estimate,
  validateP4EstimateAgainstDeployment,
} from "../p4Bridge.ts";
import {
  adaptCpicEstimateV0ToV1,
  adaptP4ServiceEstimateToCpicV0,
} from "../cpicFoundation.ts";
import {
  guardReservedPaidProviderEffect,
  reservePaidOperation,
  settlePaidOperation,
} from "../costGovernance.ts";

class P4RequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "P4RequestError";
    this.status = status;
    this.code = code;
  }
}

function fail(status: number, code: string): never {
  throw new P4RequestError(status, code);
}

async function strictGet(
  service: any,
  entity: string,
  id: string,
  notFoundCode: string,
) {
  let row: any;
  try {
    row = await service.entities[entity].get(id);
  } catch (error) {
    console.error(`requestP4Estimate ${entity}.get failed`, error);
    fail(503, "p4_control_plane_read_failed");
  }
  if (!row) fail(404, notFoundCode);
  return row;
}

async function strictFilter(
  service: any,
  entity: string,
  query: Record<string, unknown>,
  limit = 2,
) {
  let rows: any;
  try {
    rows = await service.entities[entity].filter(
      query,
      "-created_date",
      limit,
    );
  } catch (error) {
    console.error(`requestP4Estimate ${entity}.filter failed`, error);
    fail(503, "p4_control_plane_read_failed");
  }
  if (!Array.isArray(rows)) fail(503, "p4_control_plane_read_invalid");
  return rows;
}

function deliberateIdempotencyKey(value: unknown) {
  const key = String(value || "DERIVED_FROM_CANONICAL_REQUEST").trim();
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(key)) {
    fail(400, "p4_idempotency_key_invalid");
  }
  return key;
}

async function resolveProjection(
  service: any,
  body: Record<string, unknown>,
  brandId: string,
) {
  const legacyRefs = Array.isArray(body.source_projection_refs)
    ? body.source_projection_refs.map((item) => String(item || "").trim())
      .filter(Boolean)
    : [];
  const directRef = String(body.source_projection_ref || "").trim();
  const explicitRefs = [...new Set([directRef, ...legacyRefs].filter(Boolean))];
  if (explicitRefs.length > 1) {
    fail(400, "exactly_one_p4_source_projection_required");
  }
  if (explicitRefs.length === 1) {
    const projection = await strictGet(
      service,
      "P4EvidenceProjection",
      explicitRefs[0],
      "p4_source_projection_not_found",
    );
    if (String(projection.brand_id || "") !== brandId) {
      fail(409, "p4_source_projection_brand_mismatch");
    }
    if (projection.status !== "CURRENT") {
      fail(409, "p4_source_projection_not_current");
    }
    return projection;
  }
  const current = await strictFilter(service, "P4EvidenceProjection", {
    brand_id: brandId,
    status: "CURRENT",
  }, 2);
  if (!current.length) fail(404, "p4_current_source_projection_not_found");
  if (current.length !== 1) {
    fail(409, "p4_current_source_projection_ambiguous");
  }
  return current[0];
}

function validateCachedEstimate(
  row: any,
  requestFingerprint: string,
  brandId: string,
  projectionId: string,
  deployment: ReturnType<typeof requireP4DeploymentConfig>,
  predictionTime: string,
  expectedTarget: Record<string, unknown>,
) {
  if (String(row.brand_id || "") !== brandId) {
    fail(409, "p4_cached_estimate_brand_mismatch");
  }
  const stored = row.estimate_json;
  if (!stored || typeof stored !== "object") {
    fail(409, "p4_cached_estimate_contract_missing");
  }
  if (stored.request_contract_hash !== requestFingerprint) {
    fail(409, "p4_cached_estimate_request_hash_mismatch");
  }
  if (stored.deployment_gate?.deployment_id !== deployment.deployment_id) {
    fail(409, "p4_cached_estimate_deployment_mismatch");
  }
  if (
    !Array.isArray(row.source_projection_refs) ||
    row.source_projection_refs.length !== 1 ||
    row.source_projection_refs[0] !== projectionId
  ) fail(409, "p4_cached_estimate_projection_mismatch");
  let estimate: ReturnType<typeof tenantSafeP4Estimate>;
  try {
    estimate = tenantSafeP4Estimate(stored);
    validateP4EstimateAgainstDeployment(
      estimate,
      deployment,
      predictionTime,
      expectedTarget,
    );
  } catch (error) {
    console.error("requestP4Estimate cached contract invalid", error);
    fail(409, "p4_cached_estimate_expired_or_invalid");
  }
  return estimate;
}

export async function handleRequestP4Estimate(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const parsedBody = await req.json().catch(() => ({}));
    const body = parsedBody && typeof parsedBody === "object"
      ? parsedBody as Record<string, unknown>
      : {};
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    // The caller selects an existing brand/projection. All tenant, identity,
    // target and feature context is then rebuilt from committed server rows.
    const brandId = String(body.brand_id || "").trim();
    if (!brandId) fail(400, "brand_id_required");
    const service = base44.asServiceRole;
    const brand = await strictGet(service, "Brand", brandId, "brand_not_found");
    if (brand.is_demo === true) fail(409, "p4_demo_brand_forbidden");
    const projection = await resolveProjection(service, body, brandId);
    const integrationId = String(projection.integration_id || "").trim();
    if (!integrationId) fail(409, "p4_projection_integration_missing");
    const integration = await strictGet(
      service,
      "Integration",
      integrationId,
      "p4_projection_integration_not_found",
    );

    const predictionTime = new Date().toISOString();
    const deployment = requireP4DeploymentConfig(predictionTime);
    const canonicalContext = buildP4CanonicalContext({
      brand,
      integration,
      projection,
      deployment,
      prediction_time: predictionTime,
    });
    const idempotencyKey = deliberateIdempotencyKey(body.idempotency_key);
    // Wall-clock execution time is recorded in the provider request/receipt but
    // does not defeat idempotency. The cache as-of is the server-recorded
    // projection availability carried in the otherwise canonical context.
    const semanticContext = Object.fromEntries(
      Object.entries(canonicalContext).filter(([key]) =>
        key !== "prediction_time"
      ),
    );
    const contextHash = await sha256({
      ...semanticContext,
      as_of_time: canonicalContext.evidence.available_at,
    });
    const requestFingerprint = await sha256({
      bridge_version: P4_BRIDGE_VERSION,
      operation: "POST /v1/p4/estimate",
      deployment_id: deployment.deployment_id,
      model_version_id: deployment.model_version_id,
      canonical_context_hash: contextHash,
      idempotency_key: idempotencyKey,
    });
    const estimateKey = `p4-estimate:${requestFingerprint}`;

    // Cache lookup deliberately precedes transport config and cost reservation.
    // A valid hit performs no paid operation and cannot be double-billed.
    const cachedRows = await strictFilter(service, "P4StatisticalEstimate", {
      estimate_key: estimateKey,
    }, 2);
    if (cachedRows.length > 1) {
      fail(409, "p4_cached_estimate_duplicate_requires_reconciliation");
    }
    if (cachedRows.length === 1) {
      const cached = cachedRows[0];
      const cachedEstimate = validateCachedEstimate(
        cached,
        requestFingerprint,
        brandId,
        projection.id,
        deployment,
        predictionTime,
        canonicalContext.target,
      );
      const cacheAccessReceipt = await service.entities.Event.create({
        brand_id: brandId,
        tenant_id: brandId,
        tenant_scope: "TENANT",
        event_type: "cpic.p4.cache.accessed",
        source: "requestP4Estimate",
        entity_type: "P4StatisticalEstimate",
        entity_id: cached.id,
        payload_json: {
          request_fingerprint: requestFingerprint,
          deployment_id: deployment.deployment_id,
          source_projection_ref: projection.id,
          cache_hit: true,
          paid_operation_executed: false,
          material_automation_allowed: false,
        },
        status: "processed",
        processed_at: predictionTime,
      });
      if (!cacheAccessReceipt?.id) {
        fail(503, "p4_cache_access_receipt_not_persisted");
      }
      return Response.json({
        ok: true,
        created: false,
        cache_hit: true,
        paid_operation_executed: false,
        estimate_id: cached.id,
        estimate_key: estimateKey,
        cache_access_receipt_id: cacheAccessReceipt.id,
        p4_status: cachedEstimate.status,
        ood_status: cachedEstimate.ood?.status || "UNKNOWN_SUPPORT",
        canonical_support_status: "UNKNOWN_SUPPORT",
        cpic_status: cached.estimate_json?.cpic_contract?.status || "ABSTAIN",
        cpic_v1_status:
          cached.estimate_json?.cpic_contract_v1?.contract_status ||
          "INVALID_FAIL_CLOSED",
        material_automation_allowed: false,
        authority_granted: false,
      });
    }

    // Provider credentials are required only when no reusable estimate exists.
    requireP4ServiceConfig();
    const costEventKey = `api:p4:estimate:${requestFingerprint}`;
    const reservation = await reservePaidOperation(service, {
      event_key: costEventKey,
      category: "api",
      provider: "p4_service",
      source: "requestP4Estimate",
      related_entity_type: "Brand",
      related_entity_id: brandId,
      usage_json: {
        operation: "estimate",
        request_fingerprint: requestFingerprint,
        canonical_context_hash: contextHash,
        bridge_version: P4_BRIDGE_VERSION,
        deployment_id: deployment.deployment_id,
        source_projection_ref: projection.id,
      },
    });
    if (reservation.duplicate) {
      return Response.json({
        ok: false,
        error: "p4_estimate_replay_requires_reconciliation",
        duplicate_blocked: true,
        review_required: true,
        cost_event_id: reservation.event?.id || null,
      }, { status: 409 });
    }

    let settlementAttempted = false;
    let costEvent: any = null;
    let p4Response: ReturnType<typeof tenantSafeP4Estimate>;
    try {
      const providerResult = await guardReservedPaidProviderEffect(service,reservation,{
        category:'api',provider:'p4_service',source:'requestP4Estimate',
        event_key:costEventKey,effect_key:`p4_estimate:${requestFingerprint}`,
      },()=>p4FetchWithCostReceipt(
        "/v1/p4/estimate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: canonicalContext,
            deployment_id: deployment.deployment_id,
            trace_id: requestFingerprint,
            idempotency_key: requestFingerprint,
            deadline_ms: 12_000,
            requested_output_contract: {
              target_spec_id: deployment.target_spec_id,
              fee_perimeter: deployment.fee_perimeter,
              source_population: deployment.source_population,
              horizon: deployment.horizon,
              unit: deployment.unit,
              currency: canonicalContext.target.currency,
            },
            cost_reservation_ref: reservation.event?.id || null,
          }),
        },
      ));
      const receiptState = providerResult.cost_receipt;
      const receipt = receiptState.reliable ? receiptState.receipt : null;
      settlementAttempted = true;
      costEvent = await settlePaidOperation(service, reservation, {
        ok: providerResult.ok,
        ...(receipt
          ? {
            reconciled: true,
            amount_minor: receipt.amount_minor,
            amount_quality: "PROVIDER_FINAL_RECEIPT",
            reconciliation_ref: `p4:${receipt.receipt_id}`,
          }
          : { amount_quality: "CONSERVATIVE_RESERVATION" }),
        usage_json: {
          operation: "estimate",
          request_fingerprint: requestFingerprint,
          http_status: providerResult.status,
          provider_receipt_status: receiptState.reason,
          provider_receipt_id: receipt?.receipt_id || null,
          provider_operation_id: receipt?.provider_operation_id || null,
        },
      });
      if (!costEvent) {
        throw Object.assign(new Error("p4_cost_settlement_not_persisted"), {
          code: "P4_COST_SETTLEMENT_NOT_PERSISTED",
        });
      }
      if (!providerResult.ok) {
        throw Object.assign(
          new Error(`p4_service_${providerResult.status}`),
          { code: "P4_SERVICE_ERROR", status: providerResult.status },
        );
      }
      p4Response = tenantSafeP4Estimate(providerResult.body);
      validateP4EstimateAgainstDeployment(
        p4Response,
        deployment,
        predictionTime,
        canonicalContext.target,
      );
    } catch (error) {
      if (!settlementAttempted) {
        const failedEvent = await settlePaidOperation(service, reservation, {
          ok: false,
          amount_quality: "CONSERVATIVE_RESERVATION",
          usage_json: {
            operation: "estimate",
            request_fingerprint: requestFingerprint,
            transport_error: String((error as Error)?.message || error).slice(
              0,
              200,
            ),
          },
        });
        if (!failedEvent) {
          throw Object.assign(
            new Error("p4_cost_settlement_not_persisted"),
            { code: "P4_COST_SETTLEMENT_NOT_PERSISTED", cause: error },
          );
        }
      }
      throw error;
    }

    const deploymentGate = validateP4EstimateAgainstDeployment(
      p4Response,
      deployment,
      predictionTime,
      canonicalContext.target,
    );
    const sourceRefs = [
      `P4EvidenceProjection:${projection.id}`,
      `PaymentsAnalysisVerified:${projection.source_id}`,
    ];
    const cpicContract = adaptP4ServiceEstimateToCpicV0(p4Response, {
      problem_id: deployment.target_spec_id,
      subject_ref:
        `p4:${canonicalContext.subject.canonical_pseudonym}:${deployment.target_spec_id}`,
      unit: deployment.unit,
      currency: canonicalContext.target.currency,
      available_at: p4Response.available_at,
      prediction_time: predictionTime,
      source_refs: sourceRefs,
      support_dimensions: [{
        name: "external_p4_support_report",
        observed: true,
        in_reference_support: null,
      }],
      assumptions: [
        "External P4 output is advisory statistical evidence only.",
        "Support and OOD remain unknown until an approved registered detector is resolved.",
      ],
    });
    const cpicContractV1 = await adaptCpicEstimateV0ToV1(cpicContract, {
      trace_id: requestFingerprint,
      estimand_id: deployment.target_spec_id,
      subject_ref: {
        subject_type: "MERCHANT",
        canonical_id: canonicalContext.subject.canonical_pseudonym,
        identity_version: String(
          projection.projection_version || P4_BRIDGE_VERSION,
        ),
        tenant_id: canonicalContext.tenant_scope_token,
        scope: "P4_ADVISORY_ESTIMATION",
        merge_state: "STABLE",
      },
      tenant_scope: {
        tenant_id: canonicalContext.tenant_scope_token,
        purpose: "CPIC_ADVISORY_ESTIMATE",
        data_classification: "PSEUDONYMIZED_AGGREGATE",
        allowed_consumers: ["FOUNDER_ADMIN", "RATE_INTELLIGENCE_QUERY"],
        retention_policy_ref: "EXISTING_CAMBRA_RETENTION_POLICY",
        deletion_behavior: "FOLLOW_SOURCE_PROJECTION_LIFECYCLE",
      },
      ingested_time: predictionTime,
      as_of_time: p4Response.as_of,
      horizon: deployment.horizon,
      expires_at: p4Response.expires_at,
      deployment_ref: deployment.deployment_id,
      policy_version: deployment.gate_version,
      created_at: predictionTime,
    });
    const sourceReportedCalibration =
      p4Response.interval?.calibrated === true ||
      p4Response.calibrated === true;
    const storedEstimate = {
      ...p4Response,
      interval: {
        ...p4Response.interval,
        calibrated: false,
        source_reported_calibrated: sourceReportedCalibration,
      },
      calibrated: false,
      request_contract_hash: requestFingerprint,
      canonical_context_hash: contextHash,
      source_projection_ref: projection.id,
      deployment_gate: deploymentGate,
      source_claims: {
        calibration_reported: sourceReportedCalibration,
        calibration_locally_verified: false,
        model_locally_registered: false,
        support_detector_registered: false,
      },
      cost_governance: {
        event_key: costEventKey,
        cost_usage_event_id: costEvent.id,
        status: costEvent.status,
        amount_quality: costEvent.usage_json?.amount_quality ||
          "CONSERVATIVE_RESERVATION",
        actual_cost_reconciled: costEvent.status === "RECONCILED",
      },
      cpic_contract: cpicContract,
      cpic_contract_v1: cpicContractV1,
    };
    const row = await service.entities.P4StatisticalEstimate.create({
      estimate_key: estimateKey,
      brand_id: brandId,
      p4_estimate_id: p4Response.estimate_id,
      target_spec_id: p4Response.target_spec_id,
      model_version_id: p4Response.model_version_id,
      lineage_hash: p4Response.lineage_hash,
      as_of: p4Response.as_of,
      known_at: predictionTime,
      training_cutoff: p4Response.training_cutoff || null,
      expires_at: p4Response.expires_at,
      status: p4Response.status,
      ood_status: p4Response.ood?.status || "UNKNOWN_SUPPORT",
      estimate_json: storedEstimate,
      source_projection_refs: [projection.id],
    });
    if (!row?.id) fail(503, "p4_estimate_persistence_failed");
    const committed = await strictFilter(service, "P4StatisticalEstimate", {
      estimate_key: estimateKey,
    }, 2);
    if (committed.length !== 1 || committed[0].id !== row.id) {
      fail(409, "p4_estimate_commit_requires_reconciliation");
    }
    return Response.json({
      ok: true,
      created: true,
      cache_hit: false,
      paid_operation_executed: true,
      estimate_id: row.id,
      estimate_key: estimateKey,
      p4_status: p4Response.status,
      ood_status: p4Response.ood?.status || "UNKNOWN_SUPPORT",
      canonical_support_status: "UNKNOWN_SUPPORT",
      cpic_status: cpicContract.status,
      cpic_recommendation: cpicContract.decision_safety.recommendation,
      cpic_v1_status: cpicContractV1.contract_status,
      cost_event_id: costEvent.id,
      cost_status: costEvent.status,
      actual_cost_reconciled: costEvent.status === "RECONCILED",
      material_automation_allowed: false,
      authority_granted: false,
    });
  } catch (error) {
    console.error("requestP4Estimate failed", error);
    if (error instanceof P4RequestError) {
      return Response.json({ ok: false, error: error.code }, {
        status: error.status,
      });
    }
    return Response.json({ ok: false, error: "p4_estimate_unavailable" }, {
      status: 503,
    });
  }
}
