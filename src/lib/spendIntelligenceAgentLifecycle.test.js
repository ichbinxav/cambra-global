import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAgentTaskTerminalEnvelope,
  buildRootAgentTaskEnvelope,
  hashAgentTaskProjection,
} from "../../base44/shared/agentTaskEnvelope.ts";
import {
  commercialAgentErrorResponse,
  reviewRequiredNoEffectTerminal,
} from "../../base44/shared/commercialAgentTask.ts";
import {
  dedupeDiscoveryFindings,
  isEligibleDiscoveryHttpResponse,
  normalizeDiscoveryTaskSourceCoverage,
} from "../../base44/shared/discoveryCoverage.ts";
import {
  revalidateLatestSpendSourceFence,
  selectAndRevalidateLatestAnalyzerInput,
  selectAndRevalidateLatestDiscoveryTask,
  selectExactSpendSource,
  selectUniqueLatestSpendSource,
} from "../../base44/shared/spendIntelligenceAuthority.ts";
import {
  buildSpendEstimates,
  buildSpendFailureEvidenceProjection,
  buildSpendTotals,
  collectSpendBenchmarkSourceRefs,
  deriveSpendDiscoveryCoverageStatus,
  deterministicSpendSummary,
  requireEurSpendAnalyzerInput,
  spendAuthorityReadsComplete,
  unknownSpendTotals,
  validateSpendCountry,
  validateSpendFindings,
} from "../../base44/shared/spendIntelligenceRuntime.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(
  path.join(ROOT, "base44/functions/spendIntelligenceAgent/entry.ts"),
  "utf8",
);

const finding = (override = {}) => ({
  tool: "Stripe",
  vertical: "payments",
  matched_catalog_id: "catalog-stripe",
  confidence: 0.95,
  ...override,
});

describe("spend intelligence canonical deterministic lifecycle", () => {
  it("requires authoritative EUR and never derives money from Brand revenue ranges", () => {
    expect(requireEurSpendAnalyzerInput({
      id: "input-eur",
      currency: "EUR",
      monthly_revenue: 100000,
    })).toMatchObject({ currency: "EUR", monthly_revenue: 100000 });
    expect(() => requireEurSpendAnalyzerInput({
      id: "input-missing",
      monthly_revenue: 100000,
    })).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_ANALYZER_CURRENCY_REQUIRED",
      status: 409,
      review_required: true,
    }));
    expect(() => requireEurSpendAnalyzerInput({
      id: "input-usd",
      currency: "USD",
      monthly_revenue: 100000,
    })).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_ANALYZER_CURRENCY_NOT_EUR",
      status: 409,
      automatic_retry_blocked: true,
    }));
    expect(() => requireEurSpendAnalyzerInput({
      id: "input-over-limit",
      currency: "EUR",
      monthly_revenue: Number.MAX_VALUE,
    })).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_ANALYZER_MONTHLY_REVENUE_INVALID",
    }));
    expect(source).not.toContain("annual_revenue");
    expect(source).not.toContain("RANGE_MIDPOINT_MONTHLY");
  });

  it("uses exact sources and honest shipping/SaaS provenance", () => {
    const findings = validateSpendFindings([
      finding(),
      finding({
        tool: "DHL",
        vertical: "shipping",
        matched_catalog_id: "catalog-dhl",
      }),
      finding({
        tool: "Shopify",
        vertical: "saas_commerce",
        matched_catalog_id: "catalog-shopify",
      }),
      finding({
        tool: "Unknown Suite",
        vertical: "other",
        matched_catalog_id: null,
      }),
    ]);
    const analyzer = requireEurSpendAnalyzerInput({
      id: "input-eur",
      currency: "EUR",
      monthly_revenue: 100000,
      payment_provider: "Stripe",
      shipping_provider: "DHL",
      monthly_shipping_cost: 5000,
      monthly_shipments: 1000,
      saas_tools: [{ name: "Shopify", monthly_cost: 1000 }],
    });
    const built = buildSpendEstimates({
      findings,
      analyzerInput: analyzer,
      analyzerInputId: "input-eur",
      country: "Spain",
    });
    expect(built.estimates).toHaveLength(4);
    expect(built.estimates[0]).toMatchObject({
      estimated_spend_monthly: 1900,
      estimate_method: "SCORE_ENGINE_PAYMENT_RATE",
      source_refs: [
        { type: "AnalyzerInput", id: "input-eur" },
        {
          type: "ScoreEngineBenchmark",
          id: "payments:mid:EU",
          version: "1.0.0",
        },
      ],
    });
    expect(built.estimates[1]).toMatchObject({
      estimated_spend_monthly: 5000,
      estimate_method: "OBSERVED_ANALYZER_SHIPPING_COST",
    });
    expect(built.estimates[1].basis).toContain("comparison-only");
    expect(built.estimates[2]).toMatchObject({
      estimated_spend_monthly: 1000,
      estimate_method: "OBSERVED_ANALYZER_SAAS_COST",
      source_refs: [{ type: "AnalyzerInput", id: "input-eur" }],
    });
    expect(built.estimates[3]).toMatchObject({
      estimated_spend_monthly: null,
      estimate_method: "UNAVAILABLE",
      source_refs: [],
    });
    expect(built.benchmark_context).toMatchObject({
      benchmarks_applied: {
        payments_rate_pct: 1.9,
        shipping_per_unit_eur_comparison_only: 4.6,
      },
      local_allocation_heuristic_applied: false,
    });
    expect(built.benchmark_context.benchmarks_applied)
      .not.toHaveProperty("saas_pct_of_revenue");
    expect(collectSpendBenchmarkSourceRefs(built.estimates)).toEqual([
      {
        type: "ScoreEngineBenchmark",
        id: "payments:mid:EU",
        version: "1.0.0",
      },
      {
        type: "ScoreEngineBenchmark",
        id: "shipping:mid:EU:comparison_only",
        version: "1.0.0",
      },
    ]);
    expect(source).not.toContain("VERTICAL_WEIGHT");
    expect(source).not.toContain("SHIPPING_REVENUE_SHARE");

    const shippingWithoutRegionalAuthority = buildSpendEstimates({
      findings: validateSpendFindings([
        finding({
          tool: "DHL",
          vertical: "shipping",
          matched_catalog_id: "catalog-dhl",
        }),
      ]),
      analyzerInput: analyzer,
      analyzerInputId: "input-eur",
      country: "",
    });
    expect(shippingWithoutRegionalAuthority.estimates[0]).toMatchObject({
      estimated_spend_monthly: 5000,
      estimate_method: "OBSERVED_ANALYZER_SHIPPING_COST",
      source_refs: [{ type: "AnalyzerInput", id: "input-eur" }],
    });
    expect(shippingWithoutRegionalAuthority.estimates[0].basis)
      .toContain("No regional benchmark was applied");
    expect(shippingWithoutRegionalAuthority.benchmark_context).toEqual({
      benchmarks_applied: {},
      local_allocation_heuristic_applied: false,
    });
  });

  it("does not convert unknown estimates into zero or a complete total", () => {
    const unknown = buildSpendTotals([{
      estimated_spend_monthly: null,
      estimated_spend_annual: null,
    }]);
    expect(unknown).toEqual({
      currency: "EUR",
      known_subtotal_monthly: null,
      known_subtotal_annual: null,
      known_estimate_count: 0,
      unestimated_count: 1,
      coverage_complete: false,
    });
    expect(deterministicSpendSummary(unknown)).not.toContain("€0");
    expect(unknownSpendTotals(2)).toMatchObject({
      known_subtotal_monthly: null,
      unestimated_count: 2,
      coverage_complete: false,
    });

    const empty = buildSpendTotals([]);
    expect(empty).toMatchObject({
      known_subtotal_monthly: 0,
      known_estimate_count: 0,
      unestimated_count: 0,
      coverage_complete: true,
    });
    expect(deterministicSpendSummary(empty)).toBe(
      "No tools were present in the validated B1 findings; the known EUR subtotal is €0. Discovery coverage is not asserted here.",
    );

    const partial = buildSpendTotals([
      { estimated_spend_monthly: 1900 },
      { estimated_spend_monthly: 5000 },
      { estimated_spend_monthly: 1000 },
      { estimated_spend_monthly: null },
    ]);
    expect(partial).toMatchObject({
      known_subtotal_monthly: 7900,
      known_subtotal_annual: 94800,
      known_estimate_count: 3,
      unestimated_count: 1,
      coverage_complete: false,
    });
    expect(deterministicSpendSummary(partial)).toContain(
      "not a total-stack claim",
    );
    expect(deterministicSpendSummary(partial)).toBe(
      "Known EUR subtotal €7,900/mo (€94,800/yr) across 3 tool(s). 1 tool(s) remain unestimated; this is not a total-stack claim.",
    );
  });

  it("separates estimate coverage from explicit B1 discovery coverage", () => {
    const scannerComplete = {
      status: "COMPLETE",
      scope: "PRIMARY_DOCUMENT_HTTPS_RESPONSE",
      scanner: "discoverCompanyInfrastructure",
      engine_version: "1.0.0",
      body_truncated: false,
      body_eof_observed: true,
      http_status: 200,
      content_type: "text/html; charset=utf-8",
      finding_count: 2,
    };
    const explicitComplete = normalizeDiscoveryTaskSourceCoverage(
      scannerComplete,
      2,
    );
    expect(deriveSpendDiscoveryCoverageStatus(explicitComplete, 2))
      .toBe("COMPLETE");
    expect(normalizeDiscoveryTaskSourceCoverage({
      ...scannerComplete,
      status: "PARTIAL",
      body_truncated: true,
      finding_count: 0,
    }, 0).discovery_coverage_status).toBe("UNKNOWN");
    expect(normalizeDiscoveryTaskSourceCoverage({
      ...scannerComplete,
      finding_count: 1,
    }, 2).discovery_coverage_status).toBe("UNKNOWN");
    const partial = normalizeDiscoveryTaskSourceCoverage({
      ...scannerComplete,
      status: "PARTIAL",
      body_truncated: true,
    }, 2);
    expect(partial.discovery_coverage_status).toBe("PARTIAL");
    expect(deriveSpendDiscoveryCoverageStatus(partial, 2)).toBe("PARTIAL");
    expect(deriveSpendDiscoveryCoverageStatus({
      ...explicitComplete,
      finding_count: 0,
    }, 0))
      .toBe("UNKNOWN");
    expect(deriveSpendDiscoveryCoverageStatus({}, 2)).toBe("UNKNOWN");
    for (const status of [404, 500]) {
      const errorPageReceipt = normalizeDiscoveryTaskSourceCoverage({
        ...scannerComplete,
        http_status: status,
        finding_count: 1,
      }, 1);
      expect(isEligibleDiscoveryHttpResponse(status, "text/html")).toBe(false);
      expect(errorPageReceipt.discovery_coverage_status).toBe("UNKNOWN");
      expect(deriveSpendDiscoveryCoverageStatus(errorPageReceipt, 1))
        .toBe("UNKNOWN");
    }
    expect(isEligibleDiscoveryHttpResponse(200, "application/json")).toBe(false);
    expect(normalizeDiscoveryTaskSourceCoverage({
      ...scannerComplete,
      content_type: "application/json",
    }, 2).discovery_coverage_status).toBe("UNKNOWN");
    expect(normalizeDiscoveryTaskSourceCoverage({
      ...scannerComplete,
      body_eof_observed: false,
    }, 2).discovery_coverage_status).toBe("UNKNOWN");
    expect(source).toContain("estimate_coverage_complete: totals.coverage_complete");
    expect(source).toContain("discovery_coverage_status: discoveryCoverageStatus");
    expect(source).not.toContain("source_coverage: {\n        complete:");
  });

  it("deduplicates B1 findings deterministically before coverage counting", () => {
    const duplicatePayPal = [
      {
        category: "payment_provider",
        provider_or_tool: "PayPal",
        confidence_score: 0.9,
        evidence_type: "body_text",
        evidence_value: "paypal.com/sdk",
      },
      {
        category: "payment_provider",
        provider_or_tool: "PayPal",
        confidence_score: 0.95,
        evidence_type: "script_tag",
        evidence_value: "paypalobjects.com",
      },
      {
        category: "analytics",
        provider_or_tool: "Segment",
        confidence_score: 0.9,
        evidence_type: "script_tag",
      },
    ];
    const forward = dedupeDiscoveryFindings(duplicatePayPal);
    const reversed = dedupeDiscoveryFindings([...duplicatePayPal].reverse());
    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(2);
    expect(forward.find((row) => row.provider_or_tool === "PayPal"))
      .toMatchObject({ confidence_score: 0.95, evidence_type: "script_tag" });
  });

  it("projects failure evidence without raw PII, arbitrary keys or values", async () => {
    const projection = buildSpendFailureEvidenceProjection({
      source_type: "discovery_task",
      source_id: "person@example.test",
      source_version: "version-1",
      observed_item_count: 1,
      shape_status: "ARRAY_WITHIN_LIMIT",
      present_fields: ["findings", "email", "private_note"],
      email: "person@example.test",
      private_note: "Bearer super-secret-token",
      findings: [{ tool: "person@example.test" }],
    });
    expect(projection).toEqual({
      evidence_schema: "spend-failure-metadata-v1",
      source_type: "discovery_task",
      source_ref: null,
      observed_item_count: 1,
      shape_status: "ARRAY_WITHIN_LIMIT",
      currency_status: "NOT_OBSERVED",
      present_fields: ["findings"],
    });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("person@example.test");
    expect(serialized).not.toContain("super-secret-token");
    expect(await hashAgentTaskProjection(projection)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects unsafe strings, excess input, and confidence outside [0,1]", () => {
    expect(validateSpendCountry("Spain")).toBe("Spain");
    expect(validateSpendCountry("Czechia")).toBe("Czech Republic");
    expect(validateSpendCountry(null)).toBe("");
    expect(() => validateSpendCountry("Atlantis"))
      .toThrowError(expect.objectContaining({
        code: "SPEND_INTELLIGENCE_BRAND_COUNTRY_UNKNOWN",
      }));
    expect(() => validateSpendCountry(" api_key=secret-value"))
      .toThrowError(expect.objectContaining({
        code: "SPEND_INTELLIGENCE_BRAND_COUNTRY_INVALID",
      }));
    expect(() => validateSpendFindings([
      finding({ tool: "api_key=super-secret-value" }),
    ])).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_TOOL_INVALID",
    }));
    expect(() => validateSpendFindings([
      finding({ tool: "x".repeat(121) }),
    ])).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_TOOL_INVALID",
    }));
    expect(() => validateSpendFindings([
      finding({ confidence: 1.01 }),
    ])).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_CONFIDENCE_INVALID",
    }));
    expect(() => validateSpendFindings([
      finding({ matched_catalog_id: "bad id with spaces" }),
    ])).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_MATCHED_CATALOG_ID_INVALID",
    }));
    expect(() => validateSpendFindings(
      Array.from({ length: 101 }, (_, index) => finding({
        tool: `Tool ${index}`,
        matched_catalog_id: `catalog-${index}`,
      })),
    )).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_DISCOVERY_OUTPUT_INVALID",
    }));
    expect(() => validateSpendFindings([
      finding(),
      finding({
        tool: "stripe",
        vertical: "saas_finance",
        matched_catalog_id: "catalog-stripe-alias",
      }),
    ])).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_DUPLICATE_TOOL_AMBIGUOUS",
    }));
    expect(() => validateSpendFindings([
      finding(),
      finding({
        tool: "Different Tool",
        vertical: "saas_finance",
        matched_catalog_id: "CATALOG-STRIPE",
      }),
    ])).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_DUPLICATE_CATALOG_ID_AMBIGUOUS",
    }));
  });

  it("does not call a provider without an observed policy or accept AI narrative", () => {
    expect(source).not.toContain("callCambraClaude");
    expect(source).not.toContain("ANTHROPIC_API_KEY");
    expect(source).not.toContain("providerPrompt");
    expect(source).not.toContain('effectClass: "SPEND"');
    expect(source).toContain('policyContext: { status: "NOT_APPLICABLE" }');
    expect(source).toContain("materialEffect: false");
    expect(source).toContain('interpretation_status: "disabled_no_observed_inference_policy"');
    expect(source).toContain("const summary = deterministicSpendSummary(totals)");
    expect(source).not.toMatch(/summary:\s*interpretation/);
  });

  it("represents review-required without falsely classifying a no-effect run failed", async () => {
    expect(spendAuthorityReadsComplete({
      discovery: "COMPLETE",
      analyzer_input: "COMPLETE",
    })).toBe(true);
    expect(spendAuthorityReadsComplete({
      discovery: "COMPLETE",
      analyzer_input: "NOT_REQUIRED",
    })).toBe(true);
    expect(spendAuthorityReadsComplete({
      discovery: "UNAVAILABLE",
      analyzer_input: "NOT_REQUIRED",
    })).toBe(false);
    const req = new Request("https://example.test/functions/spendIntelligenceAgent");
    const root = await buildRootAgentTaskEnvelope(req, {
      workflowKey: "spend_intelligence_agent",
      workflowVersion: "v2.1.0",
      tenantKey: "brand-1",
      processingPurpose: "brand_tool_spend_estimation",
      functionName: "spendIntelligenceAgent",
      input: { brand_id: "brand-1" },
      subjectType: "Brand",
      subjectId: "brand-1",
      policyContext: { status: "NOT_APPLICABLE" },
      authorityContext: { status: "OBSERVED", id: "brand-1" },
      intelligenceContext: { status: "OBSERVED", id: "discovery-1" },
      materialEffect: false,
      costApplicable: false,
    });
    const task = {
      ...root,
      id: "task-1",
      root_task_id: "task-1",
      trace_revision: 1,
    };
    const terminal = await buildAgentTaskTerminalEnvelope(task, {
      ...reviewRequiredNoEffectTerminal(),
      result: { ok: false, error: "currency_required" },
    });
    expect(terminal).toMatchObject({
      terminal_state: "REVIEW_REQUIRED",
      effect_state: "NOT_APPLICABLE",
      effect_coverage_state: "NOT_APPLICABLE",
      ambiguity_state: "NONE",
      lineage_state: "COMPLETE",
    });
    const reviewError = Object.assign(new Error("currency_required"), {
      code: "SPEND_INTELLIGENCE_ANALYZER_CURRENCY_REQUIRED",
      status: 409,
      review_required: true,
      automatic_retry_blocked: true,
    });
    const response = commercialAgentErrorResponse(
      reviewError,
      "spendIntelligenceAgent",
      "spend_intelligence_review_required",
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      review_required: true,
      automatic_retry_blocked: true,
    });
    expect(source).toContain('status: "waiting_input"');
    expect(source).toContain("reviewRequiredNoEffectTerminal()");
  });

  it("binds validated success evidence and creates a separate review root on failure", () => {
    const successRootIndex = source.indexOf(
      "task = await createCanonicalAgentTask(base44.asServiceRole",
    );
    expect(successRootIndex).toBeGreaterThan(-1);
    expect(source.indexOf("validateSpendFindings(rawFindingsForTrace)"))
      .toBeLessThan(successRootIndex);
    expect(source.indexOf("requireEurSpendAnalyzerInput(analyzerInput)"))
      .toBeLessThan(successRootIndex);
    expect(source.indexOf("const canonicalInput")).toBeLessThan(successRootIndex);
    expect(source).toContain("validated_findings: validatedFindings");
    expect(source).toContain("analyzer_input_used: analyzerInputUsed");
    expect(source).toContain("brand_context_used: countryUsed");
    expect(source).toContain("benchmark_context_used: benchmarkContext");
    expect(source).toContain(
      "const benchmarkSourceRefs = collectSpendBenchmarkSourceRefs(estimates)",
    );
    expect(source).toContain("...benchmarkSourceRefs");
    expect(source).toContain('type: "AgentTask"');
    expect(source).toContain('type: "AnalyzerInput"');
    expect(source).toContain(
      "if (brandForTrace && serviceRoleForTrace && !task?.id)",
    );
    expect(source).toContain("input: reviewInput");
    expect(source).toContain("failure_source_evidence");
    expect(source.match(/validated_findings: validatedFindings/g) || [])
      .toHaveLength(1);
    expect(source).toContain("projection_sha256");
    expect(source).toContain('digest_scope: "ALLOWLISTED_METADATA_ONLY"');
    expect(source).not.toContain("boundedFailureProjection");
    expect(source).toContain("reviewDiscoveryHash");
    expect(source).toContain("spendAuthorityReadsComplete({");
    expect(source).toContain("authority_reads_complete: authorityReadsComplete");
    expect(source).toContain("source_validation_complete: sourceValidationComplete");
    expect(source.match(/createCanonicalAgentTask\s*\(/g) || []).toHaveLength(2);
    expect(source).not.toContain(".entities.AgentTask.create(");
    expect(source).not.toContain(".entities.AgentTask.update(");
    const settlements = source.match(/settleCanonicalAgentTask\s*\(/g) || [];
    expect(source.match(/output_payload_json:\s*outputPayload/g) || [])
      .toHaveLength(settlements.length);
    expect(source.match(/result:\s*outputPayload/g) || [])
      .toHaveLength(settlements.length);
    expect(source.match(/terminalEvent\s*:/g) || [])
      .toHaveLength(settlements.length);
    expect(source.match(/payload:\s*outputPayload/g) || [])
      .toHaveLength(settlements.length);
  });

  it("fails closed on equal newest source authority and revalidates B1 by exact id", async () => {
    const older = {
      id: "input-old",
      brand_id: "brand-1",
      created_date: "2026-08-20T09:00:00.000Z",
    };
    const newer = {
      id: "input-new",
      brand_id: "brand-1",
      created_date: "2026-08-21T09:00:00.000Z",
    };
    expect(selectUniqueLatestSpendSource([older, newer], "analyzer_input", "brand-1"))
      .toBe(newer);
    expect(() => selectUniqueLatestSpendSource([
      { ...older, id: "input-a", created_date: newer.created_date },
      { ...newer, id: "input-b" },
    ], "analyzer_input", "brand-1")).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_ANALYZER_INPUT_AUTHORITY_AMBIGUOUS",
      status: 409,
    }));
    expect(() => selectExactSpendSource(
      [{ ...newer, brand_id: "brand-2" }],
      "analyzer_input",
      "input-new",
      "brand-1",
    )).toThrowError(expect.objectContaining({
      code: "SPEND_INTELLIGENCE_ANALYZER_INPUT_BRAND_BINDING_INVALID",
    }));
    const olderTask = {
      ...older,
      id: "task-old",
      agent_name: "discovery_tech_stack",
      status: "completed",
      output_payload_json: { findings: [], source_coverage: {} },
    };
    const exactTask = {
      ...newer,
      id: "task-new",
      agent_name: "discovery_tech_stack",
      status: "completed",
      output_payload_json: {
        findings: [{ tool: "Stripe" }],
        source_coverage: { discovery_coverage_status: "COMPLETE" },
      },
    };
    const exactRead = vi.fn(async (id) => ({ ...exactTask, id }));
    await expect(selectAndRevalidateLatestDiscoveryTask(
      [olderTask, exactTask],
      "brand-1",
      exactRead,
    )).resolves.toEqual(exactTask);
    expect(exactRead).toHaveBeenCalledOnce();
    expect(exactRead).toHaveBeenCalledWith("task-new");
    await expect(selectAndRevalidateLatestDiscoveryTask(
      [exactTask],
      "brand-1",
      async () => ({ ...exactTask, status: "running" }),
    )).rejects.toMatchObject({
      code: "SPEND_INTELLIGENCE_DISCOVERY_TASK_BRAND_BINDING_INVALID",
      status: 409,
    });

    const exactAnalyzerRead = vi.fn(async () => ({
      ...newer,
      currency: "EUR",
      monthly_revenue: 100,
    }));
    const analyzerCandidate = await selectAndRevalidateLatestAnalyzerInput(
      [{ ...newer, currency: "EUR", monthly_revenue: 100 }],
      "brand-1",
      exactAnalyzerRead,
    );
    expect(analyzerCandidate).toMatchObject({ id: "input-new", currency: "EUR" });
    await expect(selectAndRevalidateLatestAnalyzerInput(
      [{ ...newer, currency: "EUR", monthly_revenue: 100 }],
      "brand-1",
      async () => ({ ...newer, currency: "USD", monthly_revenue: 100 }),
    )).rejects.toMatchObject({
      code: "SPEND_INTELLIGENCE_ANALYZER_INPUT_AUTHORITY_DRIFT",
    });

    await expect(revalidateLatestSpendSourceFence(
      exactTask,
      "discovery_task",
      "brand-1",
      async () => [exactTask, olderTask],
    )).resolves.toEqual(exactTask);
    const interleaved = {
      ...exactTask,
      id: "task-interleaved",
      created_date: "2026-08-22T09:00:00.000Z",
    };
    await expect(revalidateLatestSpendSourceFence(
      exactTask,
      "discovery_task",
      "brand-1",
      async () => [interleaved, exactTask],
    )).rejects.toMatchObject({
      code: "SPEND_INTELLIGENCE_DISCOVERY_TASK_LATEST_CHANGED",
      automatic_retry_blocked: true,
    });
    await expect(revalidateLatestSpendSourceFence(
      exactTask,
      "discovery_task",
      "brand-1",
      async () => [{
        ...exactTask,
        output_payload_json: {
          ...exactTask.output_payload_json,
          findings: [{ tool: "PayPal" }],
        },
      }],
    )).rejects.toMatchObject({
      code: "SPEND_INTELLIGENCE_DISCOVERY_TASK_AUTHORITY_DRIFT",
    });
    expect(source).toContain("spend_intelligence_discovery_task_final_latest_read");
    expect(source).toContain("spend_intelligence_analyzer_input_final_latest_read");
    expect(source).not.toContain('"unique_latest"');
  });
});
