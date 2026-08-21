import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { createCanonicalAgentTask, hashAgentTaskProjection, settleCanonicalAgentTask } from '../../shared/agentTaskEnvelope.ts';
import { commercialAgentErrorResponse, commercialInferenceReviewError, completedNoEffectTerminal, reviewRequiredNoEffectTerminal } from '../../shared/commercialAgentTask.ts';
import { requireCriticalOperation } from '../../shared/criticalExecution.ts';
import { redactSecrets } from '../../shared/internalSecret.ts';
import {
  revalidateLatestSpendSourceFence,
  selectAndRevalidateLatestAnalyzerInput,
  selectAndRevalidateLatestDiscoveryTask,
  selectExactSpendSource,
} from '../../shared/spendIntelligenceAuthority.ts';
import { buildSpendEstimates, buildSpendFailureEvidenceProjection, buildSpendTotals, collectSpendBenchmarkSourceRefs, deriveSpendDiscoveryCoverageStatus, deterministicSpendSummary, MAX_SPEND_FINDINGS, requireEurSpendAnalyzerInput, spendAuthorityReadsComplete, SPEND_INTELLIGENCE_RUNTIME_VERSION, unknownSpendTotals, validateSpendCountry, validateSpendFindings } from '../../shared/spendIntelligenceRuntime.ts';
import { requireExactBrandTask, requireOwnedBrand, tenantOwnershipErrorResponse } from '../../shared/tenantOwnership.ts';

/**
 * Spend Intelligence Agent — Brain B2
 *
 * Deterministic-only until a real, observed inference policy is bound. No
 * provider call is attempted from this route, so it cannot create hidden AI
 * spend or let generated prose replace deterministic monetary conclusions.
 *
 * Payload: { brand_id: string, discovery_task_id?: string,
 *            analyzer_input_id?: string }
 */

const AGENT_NAME = "spend_intelligence";
const TASK_TYPE = "estimate_tool_spend";
const RISK_LEVEL = 1;
const SAFE_ID = /^[a-zA-Z0-9_][a-zA-Z0-9._:/-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,159}$/;

function optionalRequestId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && SAFE_ID.test(value) ? value : undefined;
}

function optionalSourceHash(value: unknown) {
  const hash = String(value || "").trim().toLowerCase();
  return SHA256.test(hash) ? hash : null;
}

function optionalSourceVersion(row: any) {
  for (
    const value of [
      row?.snapshot_version,
      row?.version,
      row?.updated_date,
      row?.created_date,
    ]
  ) {
    const version = String(value || "").trim();
    if (SAFE_ID.test(version)) return version;
  }
  return null;
}

function failureShapeStatus(value: unknown) {
  if (value === undefined) return "NOT_OBSERVED";
  if (!Array.isArray(value)) return "NOT_ARRAY";
  return value.length <= MAX_SPEND_FINDINGS
    ? "ARRAY_WITHIN_LIMIT"
    : "ARRAY_OVER_LIMIT";
}

function failureCurrencyStatus(value: unknown) {
  if (value === undefined || value === null || value === "") return "MISSING";
  if (typeof value !== "string") return "INVALID_TYPE";
  return value === "EUR" ? "EUR" : "NON_EUR";
}

function presentFields(value: any, fields: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return fields.filter((field) =>
    Object.prototype.hasOwnProperty.call(value, field)
  );
}

async function failureEvidence(metadata: unknown) {
  const projection = buildSpendFailureEvidenceProjection(metadata);
  return {
    projection_sha256: await hashAgentTaskProjection(projection),
    digest_scope: "ALLOWLISTED_METADATA_ONLY",
    projection,
  };
}

function safeFailureCode(value: unknown) {
  const code = String(value || "").trim();
  return SAFE_ERROR_CODE.test(code)
    ? code
    : "SPEND_INTELLIGENCE_REVIEW_REQUIRED";
}

Deno.serve(async (req) => {
  let task: any = null;
  let serviceRoleForTrace: any = null;
  let brandForTrace: any = null;
  let requestForTrace: any = null;
  let discoveryTask: any = null;
  let analyzerInput: any = null;
  let rawFindingsForTrace: unknown = undefined;
  let discoveryReadState = "NOT_ATTEMPTED";
  let analyzerReadState = "NOT_REQUIRED";
  let validationStage = "NOT_STARTED";
  let sourceValidationComplete = false;
  let intelligenceContext: any = { status: "UNKNOWN" };
  let observedFindingCount: number | null = null;
  let validatedFindings: any[] = [];
  let discoveryCoverageStatus = "UNKNOWN";
  let responseError: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsedBody = await req.json().catch(() => ({}));
    const body = parsedBody && typeof parsedBody === "object" &&
        !Array.isArray(parsedBody)
      ? parsedBody
      : {};
    const brandId = typeof body.brand_id === "string" ? body.brand_id : "";
    const discoveryTaskId = optionalRequestId(body.discovery_task_id);
    const analyzerInputId = optionalRequestId(body.analyzer_input_id);
    if (!brandId) {
      return Response.json({ ok: false, error: "Missing brand_id" }, { status: 400 });
    }
    if (!SAFE_ID.test(brandId)) {
      return Response.json({ ok: false, error: "Invalid brand_id" }, { status: 400 });
    }
    if (discoveryTaskId === undefined || analyzerInputId === undefined) {
      return Response.json({ ok: false, error: "Invalid source id" }, { status: 400 });
    }

    const brand = await requireOwnedBrand(base44.asServiceRole, user, brandId);
    serviceRoleForTrace = base44.asServiceRole;
    brandForTrace = brand;
    requestForTrace = redactSecrets({
      brand_id: brandId,
      requested_discovery_task_id: discoveryTaskId,
      requested_analyzer_input_id: analyzerInputId,
      provider_inference_policy: "DISABLED_UNTIL_OBSERVED_POLICY",
    });

    // Resolve B1 by explicit id, or by a provably unique newest timestamp.
    validationStage = "DISCOVERY_SOURCE_RESOLUTION";
    if (discoveryTaskId) {
      try {
        discoveryTask = await requireExactBrandTask(
          base44.asServiceRole,
          discoveryTaskId,
          {
            brandId,
            agentName: "discovery_tech_stack",
            status: "completed",
          },
        );
        discoveryReadState = "COMPLETE";
      } catch (sourceError: any) {
        discoveryReadState = String(sourceError?.code || "").includes(
            "authority_unavailable"
          )
          ? "UNAVAILABLE"
          : "COMPLETE";
        throw sourceError;
      }
    } else {
      try {
        const rows = await requireCriticalOperation(
          "spend_intelligence_discovery_task_read",
          () => base44.asServiceRole.entities.AgentTask.filter(
            {
              brand_id: brandId,
              agent_name: "discovery_tech_stack",
              status: "completed",
            },
            "-created_date",
            2,
          ),
        );
        discoveryTask = await selectAndRevalidateLatestDiscoveryTask(
          rows,
          brandId,
          (selectedTaskId) => requireExactBrandTask(
            base44.asServiceRole,
            selectedTaskId,
            {
              brandId,
              agentName: "discovery_tech_stack",
              status: "completed",
            },
          ),
        );
        discoveryReadState = "COMPLETE";
      } catch (sourceError: any) {
        discoveryReadState = String(sourceError?.code || "").includes(
            "authority_unavailable"
          )
          ? "UNAVAILABLE"
          : "COMPLETE";
        throw sourceError;
      }
    }
    if (!discoveryTask) {
      throw commercialInferenceReviewError(
        "SPEND_INTELLIGENCE_DISCOVERY_TASK_REQUIRED",
      );
    }
    intelligenceContext = {
      status: "OBSERVED",
      id: String(discoveryTask.id),
      key: `AgentTask:${String(discoveryTask.id)}`,
      version: SPEND_INTELLIGENCE_RUNTIME_VERSION,
    };

    rawFindingsForTrace = discoveryTask.output_payload_json?.findings;
    discoveryCoverageStatus = deriveSpendDiscoveryCoverageStatus(
      discoveryTask.output_payload_json?.source_coverage,
      Array.isArray(rawFindingsForTrace) ? rawFindingsForTrace.length : 0,
    );
    if (Array.isArray(rawFindingsForTrace) && rawFindingsForTrace.length <= MAX_SPEND_FINDINGS) {
      observedFindingCount = rawFindingsForTrace.length;
    }
    // Validate before creating the success root so its input hash can bind the
    // exact accepted findings rather than only caller-supplied source ids.
    validationStage = "DISCOVERY_CONTENT_VALIDATION";
    validatedFindings = validateSpendFindings(rawFindingsForTrace);
    validationStage = "DISCOVERY_CONTENT_VALIDATED";
    const usesPaymentInput = validatedFindings.some((finding) =>
      finding.vertical === "payments"
    );
    const usesShippingInput = validatedFindings.some((finding) =>
      finding.vertical === "shipping"
    );
    const usesSaasInput = validatedFindings.some((finding) =>
      String(finding.vertical).startsWith("saas_")
    );
    const countryUsed = usesPaymentInput || usesShippingInput;
    let countryForComputation = "";
    if (countryUsed) {
      validationStage = "BRAND_COUNTRY_VALIDATION";
      countryForComputation = validateSpendCountry(brand.country);
      validationStage = "BRAND_COUNTRY_VALIDATED";
    }

    let validatedAnalyzer: any = null;
    let estimates: any[] = [];
    let benchmarkContext: any = {
      benchmarks_applied: {},
      local_allocation_heuristic_applied: false,
    };

    if (validatedFindings.length > 0) {
      analyzerReadState = "NOT_ATTEMPTED";
      validationStage = "ANALYZER_SOURCE_RESOLUTION";
      if (analyzerInputId) {
        let rows: any[];
        try {
          rows = await requireCriticalOperation(
            "spend_intelligence_analyzer_input_exact_read",
            () => base44.asServiceRole.entities.AnalyzerInput.filter(
              { id: analyzerInputId },
              "-created_date",
              2,
            ),
          );
          analyzerReadState = "COMPLETE";
        } catch (sourceError) {
          analyzerReadState = "UNAVAILABLE";
          throw sourceError;
        }
        analyzerInput = selectExactSpendSource(
          rows,
          "analyzer_input",
          analyzerInputId,
          brandId,
        );
      } else {
        let rows: any[];
        try {
          rows = await requireCriticalOperation(
            "spend_intelligence_analyzer_input_read",
            () => base44.asServiceRole.entities.AnalyzerInput.filter(
              { brand_id: brandId },
              "-created_date",
              2,
            ),
          );
          analyzerReadState = "COMPLETE";
        } catch (sourceError) {
          analyzerReadState = "UNAVAILABLE";
          throw sourceError;
        }
        analyzerInput = await selectAndRevalidateLatestAnalyzerInput(
          rows,
          brandId,
          async (selectedInputId) => {
            const exactRows = await requireCriticalOperation(
              "spend_intelligence_analyzer_input_exact_revalidation",
              () => base44.asServiceRole.entities.AnalyzerInput.filter(
                { id: selectedInputId },
                "-created_date",
                2,
              ),
            );
            return selectExactSpendSource(
              exactRows,
              "analyzer_input",
              selectedInputId,
              brandId,
            );
          },
        );
      }
      if (!analyzerInput) {
        throw commercialInferenceReviewError(
          "SPEND_INTELLIGENCE_ANALYZER_INPUT_REQUIRED",
        );
      }
      intelligenceContext = {
        status: "OBSERVED",
        id: String(discoveryTask.id),
        key: `AgentTask:${String(discoveryTask.id)}/AnalyzerInput:${String(analyzerInput.id)}`,
        version: SPEND_INTELLIGENCE_RUNTIME_VERSION,
      };
      // Missing or non-EUR currency is a review blocker. Brand revenue ranges
      // never substitute for a durable money unit and no FX is inferred.
      validationStage = "ANALYZER_CONTENT_VALIDATION";
      validatedAnalyzer = requireEurSpendAnalyzerInput(analyzerInput);
      validationStage = "ANALYZER_CONTENT_VALIDATED";
      const built = buildSpendEstimates({
        findings: validatedFindings,
        analyzerInput: validatedAnalyzer,
        analyzerInputId: String(analyzerInput.id),
        country: countryForComputation,
      });
      estimates = built.estimates;
      benchmarkContext = built.benchmark_context;
    }
    const totals = buildSpendTotals(estimates);
    const summary = deterministicSpendSummary(totals);
    const analyzerInputUsed = validatedAnalyzer
      ? {
        id: String(analyzerInput.id),
        currency: validatedAnalyzer.currency,
        monthly_revenue: validatedAnalyzer.monthly_revenue,
        ...(usesPaymentInput
          ? { payment_provider: validatedAnalyzer.payment_provider }
          : {}),
        ...(usesShippingInput
          ? {
            shipping_provider: validatedAnalyzer.shipping_provider,
            monthly_shipping_cost: validatedAnalyzer.monthly_shipping_cost,
            monthly_shipments: validatedAnalyzer.monthly_shipments,
          }
          : {}),
        ...(usesSaasInput ? { saas_tools: validatedAnalyzer.saas_tools } : {}),
      }
      : null;
    const canonicalInput: any = redactSecrets({
      request: requestForTrace,
      selected_sources: {
        discovery_task_id: String(discoveryTask.id),
        analyzer_input_id: analyzerInput?.id ? String(analyzerInput.id) : null,
      },
      discovery_coverage_status: discoveryCoverageStatus,
      validated_findings: validatedFindings,
      analyzer_input_used: analyzerInputUsed,
      brand_context_used: countryUsed
        ? {
          country: countryForComputation || null,
        }
        : null,
      benchmark_context_used: benchmarkContext,
      runtime_version: SPEND_INTELLIGENCE_RUNTIME_VERSION,
    });
    const benchmarkSourceRefs = collectSpendBenchmarkSourceRefs(estimates);
    const brandVersion = optionalSourceVersion(brand);
    const discoveryVersion = optionalSourceVersion(discoveryTask);
    const analyzerVersion = optionalSourceVersion(analyzerInput);
    const discoveryOutputHash = optionalSourceHash(discoveryTask.output_hash);
    const sourceRefs: any[] = [
      {
        type: "Brand",
        id: String(brand.id),
        ...(brandVersion ? { version: brandVersion } : {}),
      },
      {
        type: "AgentTask",
        id: String(discoveryTask.id),
        ...(discoveryVersion ? { version: discoveryVersion } : {}),
        ...(discoveryOutputHash ? { hash: discoveryOutputHash } : {}),
      },
      ...(analyzerInput?.id
        ? [{
          type: "AnalyzerInput",
          id: String(analyzerInput.id),
          ...(analyzerVersion ? { version: analyzerVersion } : {}),
        }]
        : []),
      ...benchmarkSourceRefs,
    ];

    // Final optimistic datastore fence. This is deliberately the last awaited
    // authority read before the success root write. The persisted selection
    // label describes an exact revalidated observation, not immutable latest
    // authority (Base44 exposes no transaction spanning these entity reads).
    validationStage = "SOURCE_LATEST_FINAL_FENCE";
    if (!discoveryTaskId) {
      await revalidateLatestSpendSourceFence(
        discoveryTask,
        "discovery_task",
        brandId,
        () => requireCriticalOperation(
          "spend_intelligence_discovery_task_final_latest_read",
          () => base44.asServiceRole.entities.AgentTask.filter(
            {
              brand_id: brandId,
              agent_name: "discovery_tech_stack",
              status: "completed",
            },
            "-created_date",
            2,
          ),
        ),
      );
    }
    if (validatedFindings.length > 0 && !analyzerInputId) {
      await revalidateLatestSpendSourceFence(
        analyzerInput,
        "analyzer_input",
        brandId,
        () => requireCriticalOperation(
          "spend_intelligence_analyzer_input_final_latest_read",
          () => base44.asServiceRole.entities.AnalyzerInput.filter(
            { brand_id: brandId },
            "-created_date",
            2,
          ),
        ),
      );
    }
    sourceValidationComplete = true;
    validationStage = "SOURCE_VALIDATION_COMPLETE";

    // The success root is created only after all source authority and monetary
    // validation has succeeded. Its input hash therefore binds the exact
    // findings and durable EUR facts that produced the deterministic output.
    task = await createCanonicalAgentTask(base44.asServiceRole, req, {
      brand_id: brandId,
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      related_entity_type: "Brand",
      related_entity_id: String(brand.id),
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: "Deterministic EUR spend estimation from authoritative inputs",
      started_at: new Date().toISOString(),
    }, {
      workflowKey: "spend_intelligence_agent",
      workflowVersion: "v2.1.0",
      tenantKey: brandId,
      processingPurpose: "brand_tool_spend_estimation",
      functionName: "spendIntelligenceAgent",
      input: canonicalInput,
      sourceRefs,
      subjectType: "Brand",
      subjectId: String(brand.id),
      policyContext: { status: "NOT_APPLICABLE" },
      authorityContext: {
        status: "OBSERVED",
        id: String(brand.id),
        key: `Brand:${String(brand.id)}`,
      },
      intelligenceContext,
      materialEffect: false,
      costApplicable: false,
    });
    const benchmarkApplied = Object.keys(
      benchmarkContext.benchmarks_applied || {},
    ).length > 0;
    const outputPayload: any = redactSecrets({
      discovery_task_id: String(discoveryTask.id),
      analyzer_input_id: analyzerInput?.id ? String(analyzerInput.id) : null,
      basis_context: validatedAnalyzer
        ? {
          currency: "EUR",
          analyzer_input_id: String(analyzerInput.id),
          ...(benchmarkApplied
            ? {
              monthly_revenue: validatedAnalyzer.monthly_revenue,
              monthly_revenue_source: "AnalyzerInput.monthly_revenue",
              country: countryForComputation || null,
            }
            : {}),
          ...benchmarkContext,
        }
        : {
          currency: "EUR",
          benchmarks_applied: {},
          local_allocation_heuristic_applied: false,
        },
      estimates,
      totals,
      summary,
      interpretation: null,
      interpretation_status: "disabled_no_observed_inference_policy",
      provider_inference: {
        attempted: false,
        reason: "no_observed_inference_policy",
      },
      source_coverage: {
        estimate_coverage_complete: totals.coverage_complete,
        discovery_coverage_status: discoveryCoverageStatus,
        authority_reads_complete: true,
        unestimated_count: totals.unestimated_count,
        discovery_task_selection: discoveryTaskId
          ? "explicit"
          : "auto_exact_final_fence",
        analyzer_input_selection: validatedFindings.length === 0
          ? "not_required"
          : analyzerInputId
          ? "explicit"
          : "auto_exact_final_fence",
      },
      engine: {
        deterministic: SPEND_INTELLIGENCE_RUNTIME_VERSION,
        interpreter: "none",
      },
    });

    task = await settleCanonicalAgentTask(base44.asServiceRole, task, {
      status: "completed",
      output_summary: String(outputPayload.summary).slice(0, 500),
      output_payload_json: outputPayload,
      completed_at: new Date().toISOString(),
    }, {
      ...completedNoEffectTerminal(),
      intelligenceContext,
      result: outputPayload,
      terminalEvent: {
        eventType: "agent.task.terminal",
        source: "spendIntelligenceAgent",
        payload: outputPayload,
      },
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      discovery_task_id: outputPayload.discovery_task_id,
      analyzer_input_id: outputPayload.analyzer_input_id,
      basis_context: outputPayload.basis_context,
      estimates: outputPayload.estimates,
      totals: outputPayload.totals,
      summary: outputPayload.summary,
      interpretation_status: outputPayload.interpretation_status,
      source_coverage: outputPayload.source_coverage,
    });
  } catch (error: any) {
    if (!brandForTrace) {
      const tenantError = tenantOwnershipErrorResponse(error);
      if (tenantError) return tenantError;
    }
    const failureCode = safeFailureCode(error?.code);
    responseError = error?.status === 409 && error?.review_required === true &&
        failureCode === error?.code
      ? error
      : commercialInferenceReviewError(
        failureCode,
      );

    // Invalid/ambiguous source material gets its own non-material review root.
    // This root intentionally hashes only the request and evidence observed up
    // to the failure; it never substitutes for the fully bound success root.
    if (brandForTrace && serviceRoleForTrace && !task?.id) {
      const discoveryFailureEvidence = discoveryTask?.id
        ? await failureEvidence({
          source_type: "discovery_task",
          source_id: String(discoveryTask.id),
          source_version: optionalSourceVersion(discoveryTask),
          source_hash: optionalSourceHash(discoveryTask.output_hash),
          observed_item_count: Array.isArray(rawFindingsForTrace)
            ? rawFindingsForTrace.length
            : null,
          shape_status: failureShapeStatus(rawFindingsForTrace),
          present_fields: rawFindingsForTrace === undefined ? [] : ["findings"],
        })
        : null;
      const analyzerFailureEvidence = analyzerInput?.id
        ? await failureEvidence({
          source_type: "analyzer_input",
          source_id: String(analyzerInput.id),
          source_version: optionalSourceVersion(analyzerInput),
          observed_item_count: Array.isArray(analyzerInput.saas_tools)
            ? analyzerInput.saas_tools.length
            : null,
          shape_status: analyzerInput.saas_tools === undefined
            ? "NOT_OBSERVED"
            : failureShapeStatus(analyzerInput.saas_tools),
          currency_status: failureCurrencyStatus(analyzerInput.currency),
          present_fields: presentFields(analyzerInput, [
            "currency",
            "monthly_revenue",
            "payment_provider",
            "shipping_provider",
            "monthly_shipping_cost",
            "monthly_shipments",
            "saas_tools",
          ]),
        })
        : null;
      const brandFailureEvidence = await failureEvidence({
        source_type: "brand",
        source_id: String(brandForTrace.id),
        source_version: optionalSourceVersion(brandForTrace),
        present_fields: presentFields(brandForTrace, ["country"]),
      });
      const reviewInput: any = redactSecrets({
        request: requestForTrace,
        selected_sources_observed: {
          discovery_task_id: discoveryTask?.id
            ? String(discoveryTask.id)
            : null,
          analyzer_input_id: analyzerInput?.id
            ? String(analyzerInput.id)
            : null,
        },
        observed_finding_count: observedFindingCount,
        failure_source_evidence: {
          brand: brandFailureEvidence,
          discovery: discoveryFailureEvidence,
          analyzer_input: analyzerFailureEvidence,
        },
        read_state: {
          brand: "COMPLETE",
          discovery: discoveryReadState,
          analyzer_input: analyzerReadState,
        },
        validation_stage: validationStage,
        failure: {
          code: safeFailureCode(responseError.code),
          message: safeFailureCode(responseError.code).toLowerCase(),
        },
        provider_inference_policy: "DISABLED_UNTIL_OBSERVED_POLICY",
        runtime_version: SPEND_INTELLIGENCE_RUNTIME_VERSION,
      });
      const reviewBrandVersion = optionalSourceVersion(brandForTrace);
      const reviewDiscoveryVersion = optionalSourceVersion(discoveryTask);
      const reviewAnalyzerVersion = optionalSourceVersion(analyzerInput);
      const reviewDiscoveryHash = optionalSourceHash(discoveryTask?.output_hash);
      const reviewSourceRefs: any[] = [
        {
          type: "Brand",
          id: String(brandForTrace.id),
          ...(reviewBrandVersion ? { version: reviewBrandVersion } : {}),
        },
        ...(discoveryTask?.id
          ? [{
            type: "AgentTask",
            id: String(discoveryTask.id),
            ...(reviewDiscoveryVersion
              ? { version: reviewDiscoveryVersion }
              : {}),
            ...(reviewDiscoveryHash ? { hash: reviewDiscoveryHash } : {}),
          }]
          : []),
        ...(analyzerInput?.id
          ? [{
            type: "AnalyzerInput",
            id: String(analyzerInput.id),
            ...(reviewAnalyzerVersion
              ? { version: reviewAnalyzerVersion }
              : {}),
          }]
          : []),
      ];
      try {
        task = await createCanonicalAgentTask(serviceRoleForTrace, req, {
          brand_id: String(brandForTrace.id),
          agent_name: AGENT_NAME,
          task_type: TASK_TYPE,
          related_entity_type: "Brand",
          related_entity_id: String(brandForTrace.id),
          status: "running",
          requires_approval: false,
          risk_level: RISK_LEVEL,
          input_summary: "Spend estimation requires authoritative input review",
          started_at: new Date().toISOString(),
        }, {
          workflowKey: "spend_intelligence_agent",
          workflowVersion: "v2.1.0",
          tenantKey: String(brandForTrace.id),
          processingPurpose: "brand_tool_spend_estimation_review",
          functionName: "spendIntelligenceAgent",
          input: reviewInput,
          sourceRefs: reviewSourceRefs,
          subjectType: "Brand",
          subjectId: String(brandForTrace.id),
          policyContext: { status: "NOT_APPLICABLE" },
          authorityContext: {
            status: "OBSERVED",
            id: String(brandForTrace.id),
            key: `Brand:${String(brandForTrace.id)}`,
          },
          intelligenceContext,
          materialEffect: false,
          costApplicable: false,
        });
      } catch (traceRootError) {
        safeBestEffort(traceRootError, {
          operation: "spendIntelligenceAgent.trace_review_root",
          fallback: null,
          severity: "critical",
        });
      }
    }

    if (task?.id && serviceRoleForTrace) {
      try {
        const authorityReadsComplete = spendAuthorityReadsComplete({
          discovery: discoveryReadState,
          analyzer_input: analyzerReadState,
        });
        const outputPayload: any = redactSecrets({
          ok: false,
          error: String(responseError.code || responseError.message).slice(0, 160),
          review_required: true,
          automatic_retry_blocked: true,
          totals: unknownSpendTotals(observedFindingCount),
          source_coverage: {
            estimate_coverage_complete: false,
            discovery_coverage_status: discoveryCoverageStatus,
            authority_reads_complete: authorityReadsComplete,
            read_state: {
              brand: "COMPLETE",
              discovery: discoveryReadState,
              analyzer_input: analyzerReadState,
            },
            source_validation_complete: sourceValidationComplete,
            validation_stage: validationStage,
            unestimated_count: observedFindingCount,
          },
          provider_inference: {
            attempted: false,
            reason: "no_observed_inference_policy",
          },
        });
        task = await settleCanonicalAgentTask(serviceRoleForTrace, task, {
          status: "waiting_input",
          error: String(outputPayload.error).slice(0, 500),
          output_summary: "Spend estimation requires authoritative EUR input review",
          output_payload_json: outputPayload,
          completed_at: new Date().toISOString(),
        }, {
          ...reviewRequiredNoEffectTerminal(),
          intelligenceContext,
          result: outputPayload,
          terminalEvent: {
            eventType: "agent.task.terminal",
            source: "spendIntelligenceAgent",
            payload: outputPayload,
          },
        });
      } catch (markError) {
        safeBestEffort(markError, {
          operation: "spendIntelligenceAgent.trace_terminal",
          fallback: null,
          severity: "critical",
        });
      }
    }
    return commercialAgentErrorResponse(
      responseError,
      "spendIntelligenceAgent",
      "spend_intelligence_review_required",
    );
  }
});
