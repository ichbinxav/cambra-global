import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  guardReservedPaidProviderEffect,
  reservePaidOperation,
  settlePaidOperation,
} from "../../shared/costGovernance.ts";
import {
  ApolloLeadProvider,
  InstantlySuperSearchLeadProvider,
} from "../../shared/leadIntelligenceProvider.ts";
import { instantlyRequest } from "../../shared/outboundProvider.ts";
import {
  APOLLO_EXPIRY_AT,
  APOLLO_MAX_PAGE,
  canonicalCompanyKey,
  cheapDiscoveryPreScore,
  checkpointBackoff,
  DISCOVERY_ENGINE_VERSION,
  discoveryPartitionKey,
  discoveryProviderStatus,
  normalizeDiscoveryDomain,
  safeApolloUsageSnapshot,
} from "../../shared/discoveryRadar.ts";

const AGENT_NAME = "lead_discovery";
const TASK_TYPE = "discover_leads";
const RISK_LEVEL = 1;
const APOLLO_BASE = "https://api.apollo.io/api/v1";
const now = () => new Date().toISOString();
const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// Company-first filtering is intentionally conservative. Uncertain merchants
// continue to deterministic pre-scoring; obvious services/education do not.
const NON_MERCHANT_ORG =
  /\b(university|universit[eé]|school|college|academy|agence|agency|consulting|consultant|marketing agency|growth agency|logistique|logistics|3pl|freight|software agency|web agency)\b/i;
const GENERIC_ORG = /^(e-?commerce|commerce|retail|online store|shop)$/i;
function merchantDiscoveryCandidate(
  organization: any,
): { ok: true } | { ok: false; reason: string } {
  const name = String(organization?.name || "").trim();
  const domain = normalizeDiscoveryDomain(
    organization?.primary_domain || organization?.website_url,
  );
  if (!name) return { ok: false, reason: "organization_missing" };
  if (GENERIC_ORG.test(name)) {
    return { ok: false, reason: "organization_generic" };
  }
  if (NON_MERCHANT_ORG.test(name)) {
    return { ok: false, reason: "obvious_non_merchant_organization" };
  }
  if (/\.(edu|edu\.[a-z]{2})$/i.test(domain)) {
    return { ok: false, reason: "education_domain" };
  }
  if (!domain) return { ok: false, reason: "canonical_domain_missing" };
  return { ok: true };
}

function safeErrorCode(error: any) {
  const status = Number(error?.status || 0);
  if (status === 401) return "APOLLO_UNAUTHORIZED";
  if (status === 403) return "APOLLO_SCOPE_OR_PLAN_FORBIDDEN";
  if (status === 429) return "APOLLO_RATE_LIMITED";
  if (status >= 500) return "APOLLO_UPSTREAM_UNAVAILABLE";
  return String(error?.code || "APOLLO_REQUEST_FAILED").slice(0, 80);
}

async function apolloRequest(path:string,key:string,options:any={},guard?:(effectKey:string,effect:()=>Promise<Response>)=>Promise<Response>) {
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const effect=()=>fetch(`${APOLLO_BASE}${path}`, {
        method: options.method || "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "x-api-key": key,
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      const response=guard?await guard(`apollo_http:${path}:attempt:${attempt+1}`,effect):await effect();
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        return { payload, status: response.status, headers: response.headers };
      }
      const error: any = new Error(`Apollo HTTP ${response.status}`);
      error.status = response.status;
      error.retryAfter = Number(response.headers.get("retry-after") || 0);
      error.providerMessage = String(payload?.error || payload?.message || "")
        .slice(0, 160);
      throw error;
    } catch (error: any) {
      lastError = error;
      if(['EMERGENCY_EFFECT_AMBIGUOUS','EMERGENCY_CONTROL_EPOCH_CHANGED','EMERGENCY_CONTROL_PAUSED'].includes(String(error?.code||'')))throw error;
      const retryable = Number(error?.status || 0) === 429 ||
        Number(error?.status || 0) >= 500 || !Number(error?.status || 0);
      if (!retryable || attempt === 2) break;
      const wait = error?.retryAfter
        ? Math.min(5_000, error.retryAfter * 1_000)
        : 250 * (2 ** attempt);
      await sleep(wait);
    }
  }
  throw lastError || new Error("Apollo request failed");
}

async function paidApolloDiagnostic(service:any,path:string,key:string,eventKey:string,options:any={}){
  const reservation=await reservePaidOperation(service,{event_key:eventKey,category:'api',provider:'apollo',source:'leadDiscoveryAgent',related_entity_type:'LeadDiscoveryCheckpoint',related_entity_id:'apollo:provider:diagnostic'});
  try{
    const result=await apolloRequest(path,key,options,(effectKey,effect)=>guardReservedPaidProviderEffect(service,reservation,{category:'api',provider:'apollo',source:'leadDiscoveryAgent',event_key:eventKey,effect_key:`apollo_diagnostic:${effectKey}`},effect));
    await settlePaidOperation(service,reservation,{ok:true,usage_json:{operation:'apollo_diagnostic',path}});
    return result;
  }catch(error){
    await settlePaidOperation(service,reservation,{ok:false,usage_json:{operation:'apollo_diagnostic',path,error_code:safeErrorCode(error)}}).catch((settlementError:any)=>safeBestEffort(settlementError,{operation:'leadDiscoveryAgent.settle_failed_paid_diagnostic',fallback:null,severity:'critical'}));
    throw error;
  }
}

function employeeRange(value: any) {
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  if (count < 10) return "1-9";
  if (count < 50) return "10-49";
  if (count < 200) return "50-199";
  if (count < 1000) return "200-999";
  return "1000+";
}

function observedTechnologies(organization: any): string[] {
  const rows = Array.isArray(organization?.current_technologies)
    ? organization.current_technologies
    : Array.isArray(organization?.technologies)
    ? organization.technologies
    : [];
  return [
    ...new Set(
      rows.map((item: any) =>
        String(item?.name || item?.uid || item || "").trim().toLowerCase()
      ).filter(Boolean),
    ),
  ].slice(0, 100) as string[];
}

function detectedStack(technologies: string[]) {
  const commerce =
    technologies.find((value) =>
      /shopify|woocommerce|bigcommerce|prestashop|magento|salesforce.commerce|commercetools/
        .test(value)
    ) || null;
  const payments = technologies.filter((value) =>
    /stripe|adyen|mollie|paypal|klarna|worldline|checkout.com|sumup|square/
      .test(value)
  ).slice(0, 10);
  return { commerce, payments };
}

async function upsertCheckpoint(svc: any, checkpoint: any, patch: any) {
  if (checkpoint?.id) {
    return svc.entities.LeadDiscoveryCheckpoint.update(checkpoint.id, patch);
  }
  return svc.entities.LeadDiscoveryCheckpoint.create(patch);
}

async function runInstantlyPreviewDiscovery(service: any, body: any) {
  const apiKey = Deno.env.get("INSTANTLY_API_KEY") || "";
  if (!apiKey) {
    return Response.json({
      ok: false,
      error: "instantly_not_configured",
      provider_status: "NOT_CONFIGURED",
    }, { status: 409 });
  }
  const states = await service.entities.CommercialProviderState.filter(
    { provider_key: "instantly_supersearch", role: "lead_intelligence" },
    "-last_checked_at",
    1,
  ).catch((error: any) =>
    safeBestEffort(error, {
      operation: "leadDiscoveryAgent",
      fallback: [],
      severity: "secondary",
    })
  );
  if (states[0]?.metrics_json?.supersearch_permission_verified !== true) {
    return Response.json({
      ok: false,
      error: "instantly_supersearch_permission_not_verified",
      provider_status: states[0]?.status || "CONFIGURED",
    }, { status: 409 });
  }
  const country = String(body?.country || "").trim(),
    countryCode = String(body?.country_code || country).trim().toUpperCase(),
    industry = String(body?.industry || body?.vertical || "ecommerce").trim();
  const limit = Math.max(
    1,
    Math.min(100, Number(body?.per_page || body?.limit || 100)),
  );
  const partition = {
    country: countryCode,
    vertical: industry,
    employee_range: String(body?.employee_range || ""),
    technology: String(body?.technology || ""),
  };
  const checkpointKey = String(
    body?.checkpoint_key ||
      discoveryPartitionKey("instantly_supersearch", partition),
  );
  const existing = (await service.entities.LeadDiscoveryCheckpoint.filter(
    { checkpoint_key: checkpointKey },
    "-updated_date",
    1,
  ).catch((error: any) =>
    safeBestEffort(error, {
      operation: "leadDiscoveryAgent",
      fallback: [],
      severity: "secondary",
    })
  ))[0] || null;
  const timestamp = now();
  const checkpoint = await upsertCheckpoint(service, existing, {
    checkpoint_key: checkpointKey,
    source_key: "instantly_supersearch",
    provider_status: "ACTIVE",
    partition_json: partition,
    page: 1,
    maximum_page: 1,
    last_attempt_at: timestamp,
    consecutive_failures: 0,
    engine_version: DISCOVERY_ENGINE_VERSION,
    api_calls: Number(existing?.api_calls || 0),
    candidates_scanned: Number(existing?.candidates_scanned || 0),
    unique_companies_created: Number(existing?.unique_companies_created || 0),
    duplicates_rejected: Number(existing?.duplicates_rejected || 0),
    quality_rejected: Number(existing?.quality_rejected || 0),
    enrichment_candidates: Number(existing?.enrichment_candidates || 0),
  });
  const task = await service.entities.AgentTask.create({
    brand_id: "_platform",
    agent_name: AGENT_NAME,
    task_type: TASK_TYPE,
    status: "running",
    requires_approval: false,
    risk_level: RISK_LEVEL,
    input_summary:
      `Instantly SuperSearch preview: ${industry} · ${country}; max ${limit}`,
    started_at: timestamp,
  });
  const discoveryRunId = String(body?.discovery_run_id || "");
  const reservation = await reservePaidOperation(service, {
    event_key: `api:instantly:supersearch-preview:${checkpointKey}:${
      timestamp.slice(0, 13)
    }`,
    category: "api",
    provider: "instantly",
    source: "leadDiscoveryAgent",
    related_entity_type: discoveryRunId
      ? "DiscoveryExecutionRun"
      : "LeadDiscoveryCheckpoint",
    related_entity_id: discoveryRunId || checkpoint.id,
    max_related_spend_minor: body?.max_related_spend_minor,
    usage_json: {
      discovery_run_id: discoveryRunId || null,
      checkpoint_id: checkpoint.id,
      stage: body?.cost_stage || "NATIVE_DISCOVERY",
      reason: body?.cost_reason || "provider_native_search",
    },
  });
  if (reservation.duplicate) {
    await service.entities.AgentTask.update(task.id, {
      status: "waiting_input",
      output_summary:
        "A prior SuperSearch cost reservation exists without a run receipt; provider replay was blocked and requires reconciliation",
      error: "DUPLICATE_PAID_DISCOVERY_EFFECT_REVIEW_REQUIRED",
      completed_at: now(),
    });
    return Response.json({
      ok: false,
      provider: "instantly_supersearch",
      duplicate_blocked: true,
      review_required: true,
      error: "DUPLICATE_PAID_DISCOVERY_EFFECT_REVIEW_REQUIRED",
      created_ids: [],
      matched_existing_ids: [],
      enrichment_ids: [],
      task_id: task.id,
      checkpoint_id: checkpoint.id,
    }, { status: 409 });
  }
  const adapter = new InstantlySuperSearchLeadProvider(
    (path, options) => instantlyRequest(apiKey, path, options),
    true,
    true,
  );
  try {
    const preview = await guardReservedPaidProviderEffect(service,reservation,{
      category:'api',provider:'instantly',source:'leadDiscoveryAgent',
      event_key:reservation.event?.event_key,effect_key:`instantly_supersearch_preview:${checkpointKey}`,
    },()=>adapter.searchCompanies({
      countries: [country],
      industries: [industry],
      // Broad discovery is company-only. SuperSearch may bundle person-shaped
      // preview rows, but CAMBRA neither requests role filters nor retains or
      // scores any person field before the contact gate.
      titles: [],
      employee_ranges: body?.employee_range
        ? [String(body.employee_range)]
        : [],
      technologies: body?.technology ? [String(body.technology)] : [],
      limit,
      one_lead_per_company: true,
    }));
    const leads = (Array.isArray(preview?.leads) ? preview.leads : []).slice(
      0,
      limit,
    );
    const best = new Map<string, any>();
    for (const item of leads) {
      const companyName = String(item?.companyName || "").trim();
      const key = canonicalCompanyKey("", companyName);
      if (
        !key || GENERIC_ORG.test(companyName) ||
        NON_MERCHANT_ORG.test(companyName)
      ) continue;
      if (!best.has(key)) best.set(key, item);
    }
    const keys = [...best.keys()];
    const present = keys.length
      ? await service.entities.OutboundLead.filter(
        { canonical_company_key: { $in: keys } },
        "-created_date",
        Math.min(5000, keys.length * 3),
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadDiscoveryAgent",
          fallback: [],
          severity: "secondary",
        })
      )
      : [];
    const existingKeys = new Set(
      present.map((lead: any) => String(lead.canonical_company_key)),
    );
    const rows: any[] = [];
    for (const [key, item] of best) {
      if (existingKeys.has(key)) continue;
      const pre = cheapDiscoveryPreScore({
        organization: { name: item?.companyName, industry },
      });
      rows.push({
        company_name: item?.companyName || null,
        company_domain: null,
        canonical_company_key: key,
        country: countryCode,
        industry,
        source: "instantly_supersearch",
        stage: "lead",
        reservoir_state: "discovered",
        reservoir_updated_at: timestamp,
        external_refs_json: {
          instantly_company_id: item?.companyId || null,
          source_adapter: "instantly_supersearch",
        },
        source_evidence_json: {
          source: "instantly_supersearch",
          source_endpoint:
            "supersearch-enrichment/preview-leads-from-supersearch",
          source_observed_at: timestamp,
          country_source: "CAMBRA:target_profile",
          pre_score_source: "CAMBRA:deterministic_pre_score",
          pre_score_reasons: pre.reasons,
          estimation_boundary:
            "SuperSearch preview intelligence is not verified merchant savings or a verified email.",
          bundled_person_data_policy:
            "DISCARDED_NOT_PERSISTED_NOT_SCORED_PRE_CONTACT_GATE",
          person_filters_applied: false,
        },
        discovered_at: timestamp,
        last_source_checked_at: timestamp,
        employee_range: String(body?.employee_range || "") || null,
        revenue_range: null,
        detected_technologies: body?.technology
          ? [String(body.technology)]
          : [],
        ecommerce_platform: body?.technology || null,
        probable_payment_stack: [],
        estimation_status: "UNKNOWN",
        pre_score: pre.score,
        enrichment_worthy: false,
        contactability: "UNAVAILABLE",
        outreach_eligibility: "NOT_ASSESSED",
        compliance_status: "REVIEW_REQUIRED",
        legal_basis: "legitimate_interest",
        legal_basis_note:
          `B2B company intelligence about a ${industry} merchant in ${country}. No person data is retained at discovery; outreach remains separately governed and suppression-aware.`,
        raw_json: {
          source_adapter: "instantly_supersearch",
          company_id: item?.companyId || null,
        },
      });
    }
    const created = rows.length
      ? await service.entities.OutboundLead.bulkCreate(rows).catch(async () => {
        const output = [];
        for (const row of rows) {
          const saved = await service.entities.OutboundLead.create(row).catch((
            error: any,
          ) =>
            safeBestEffort(error, {
              operation: "leadDiscoveryAgent",
              fallback: null,
              severity: "secondary",
            })
          );
          if (saved) output.push(saved);
        }
        return output;
      })
      : [];
    const ids = created.map((row: any) => row.id).filter(Boolean);
    const matchedExistingIds = present.map((row: any) => row.id).filter(
      Boolean,
    );
    await settlePaidOperation(service, reservation, {
      ok: true,
      usage_json: {
        endpoint: "supersearch-enrichment/preview-leads-from-supersearch",
        previewed: leads.length,
        unique_companies_created: ids.length,
        matched_existing: matchedExistingIds.length,
        enrichment_started: false,
      },
    });
    await service.entities.LeadDiscoveryCheckpoint.update(checkpoint.id, {
      last_success_at: timestamp,
      next_eligible_at: new Date(Date.now() + 3600000).toISOString(),
      api_calls: Number(checkpoint.api_calls || 0) + 1,
      candidates_scanned: Number(checkpoint.candidates_scanned || 0) +
        leads.length,
      unique_companies_created:
        Number(checkpoint.unique_companies_created || 0) + ids.length,
      duplicates_rejected: Number(checkpoint.duplicates_rejected || 0) +
        (keys.length - rows.length),
    });
    await service.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary:
        `Previewed ${leads.length} Instantly leads; stored ${ids.length} provider-independent companies`,
      output_payload_json: {
        previewed: leads.length,
        created: ids.length,
        matched_existing: matchedExistingIds.length,
        enrichment_started: false,
      },
      completed_at: now(),
    });
    return Response.json({
      ok: true,
      provider: "instantly_supersearch",
      provider_status: "ACTIVE",
      scanned: leads.length,
      decision_makers_found: 0,
      contact_records_acquired: 0,
      bundled_person_rows_discarded: leads.filter((item: any) =>
        item?.fullName || item?.firstName || item?.lastName || item?.jobTitle ||
        item?.linkedIn || item?.email
      ).length,
      count: ids.length,
      rejected_count: leads.length - best.size,
      duplicate_rejected: keys.length - rows.length,
      created_ids: ids,
      matched_existing_ids: matchedExistingIds,
      enrichment_ids: [],
      source_credit_cost_documented: null,
      checkpoint_id: checkpoint.id,
      task_id: task.id,
    });
  } catch (error: any) {
    await settlePaidOperation(service, reservation, {
      ok: false,
      usage_json: {
        endpoint: "supersearch-enrichment/preview-leads-from-supersearch",
        error_code: String(error?.code || "INSTANTLY_SUPERSEARCH_FAILED"),
      },
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "leadDiscoveryAgent",
        fallback: null,
        severity: "secondary",
      })
    );
    await service.entities.AgentTask.update(task.id, {
      status: "failed",
      error: String(error?.code || "INSTANTLY_SUPERSEARCH_FAILED"),
      completed_at: now(),
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "leadDiscoveryAgent",
        fallback: null,
        severity: "secondary",
      })
    );
    return Response.json({
      ok: false,
      error: String(error?.code || "INSTANTLY_SUPERSEARCH_FAILED"),
      provider: "instantly_supersearch",
      secret_exposed: false,
    }, { status: Number(error?.status || 500) });
  }
}

Deno.serve(async (req) => {
  let task: any = null;
  let service: any = null;
  let checkpoint: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) {
      return gate.response || Response.json({
        ok: false,
        error: "admin_or_internal_authority_required",
      }, { status: 403 });
    }
    service = base44.asServiceRole;
    if (
      String(body?.provider || "").toLowerCase() === "instantly_supersearch"
    ) return runInstantlyPreviewDiscovery(service, body);
    const apolloKey = Deno.env.get("APOLLO_API_KEY") || "";
    const provider = discoveryProviderStatus(Boolean(apolloKey));
    let activeApolloReservation:any=null;
    const providerAdapter = new ApolloLeadProvider(
      (path, options) => apolloRequest(path,apolloKey,options,(effectKey,effect)=>guardReservedPaidProviderEffect(service,activeApolloReservation,{category:'api',provider:'apollo',source:'leadDiscoveryAgent',event_key:activeApolloReservation?.event?.event_key,effect_key:effectKey},effect)),
      Boolean(apolloKey),
    );

    if (body?.action === "diagnose") {
      let auth = {
        pass: false,
        healthy: false,
        is_logged_in: false,
        error_code: provider.reason,
      };
      let usage: any = { available: false, reason: "not_requested" };
      if (provider.available) {
        try {
          const result = await paidApolloDiagnostic(service,"/auth/health",apolloKey,`api:apollo:diagnose:auth:${crypto.randomUUID()}`, {
            method: "GET",
          });
          auth = {
            pass: result.payload?.healthy === true &&
              result.payload?.is_logged_in === true,
            healthy: result.payload?.healthy === true,
            is_logged_in: result.payload?.is_logged_in === true,
            error_code: null,
          };
        } catch (error: any) {
          auth = {
            pass: false,
            healthy: false,
            is_logged_in: false,
            error_code: safeErrorCode(error),
          };
        }
        if (auth.pass) {
          try {
            const result = await paidApolloDiagnostic(
              service,
              "/usage_stats/api_usage_stats",
              apolloKey,
              `api:apollo:diagnose:usage:${crypto.randomUUID()}`,
            );
            usage = safeApolloUsageSnapshot(result.payload);
          } catch (error: any) {
            usage = {
              available: false,
              error_code: safeErrorCode(error),
              observed_at: now(),
              note:
                "Usage scope may require a master key; discovery auth is assessed separately.",
            };
          }
        }
      }
      const key = "apollo:provider:diagnostic";
      const rows = await service.entities.LeadDiscoveryCheckpoint.filter(
        { checkpoint_key: key },
        "-updated_date",
        1,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadDiscoveryAgent",
          fallback: [],
          severity: "secondary",
        })
      );
      checkpoint = await upsertCheckpoint(service, rows[0], {
        checkpoint_key: key,
        source_key: "apollo",
        provider_status: auth.pass
          ? "ACTIVE"
          : provider.status === "ACTIVE"
          ? "DEGRADED"
          : provider.status,
        provider_expires_at: APOLLO_EXPIRY_AT,
        partition_json: { kind: "provider_diagnostic" },
        page: 1,
        maximum_page: APOLLO_MAX_PAGE,
        last_attempt_at: now(),
        ...(auth.pass ? { last_success_at: now(), consecutive_failures: 0 } : {
          consecutive_failures: Number(rows[0]?.consecutive_failures || 0) +
            1,
        }),
        provider_usage_json: { auth, usage },
        last_error_code: auth.error_code || null,
        engine_version: DISCOVERY_ENGINE_VERSION,
      });
      return Response.json({
        ok: true,
        provider: "apollo",
        configured: Boolean(apolloKey),
        status: checkpoint.provider_status,
        auth,
        usage,
        expires_at: APOLLO_EXPIRY_AT,
        secret_exposed: false,
      });
    }

    if (!provider.available) {
      return Response.json({
        ok: false,
        error: provider.reason,
        provider_status: provider.status,
        expires_at: APOLLO_EXPIRY_AT,
      }, { status: 409 });
    }

    const country = String(body?.country || "France").trim();
    const countryCode = String(body?.country_code || country).trim()
      .toUpperCase();
    const industry = String(body?.industry || body?.vertical || "ecommerce")
      .trim();
    const perPage = Math.max(
      1,
      Math.min(Number(body?.per_page || body?.limit || 100), 100),
    );
    const page = Math.max(
      1,
      Math.min(Number(body?.page || 1), APOLLO_MAX_PAGE),
    );
    const manualDomain = normalizeDiscoveryDomain(
      body?.company_domain || body?.manual_domain || "",
    );
    const partition = {
      country: countryCode,
      vertical: industry,
      employee_range: String(body?.employee_range || ""),
      technology: String(body?.technology || ""),
      manual_domain: manualDomain || null,
    };
    const checkpointKey = String(
      body?.checkpoint_key || discoveryPartitionKey("apollo", partition),
    );
    const existingCheckpoints = body?.checkpoint_id
      ? [
        await service.entities.LeadDiscoveryCheckpoint.get(
          String(body.checkpoint_id),
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "leadDiscoveryAgent",
            fallback: null,
            severity: "secondary",
          })
        ),
      ].filter(Boolean)
      : await service.entities.LeadDiscoveryCheckpoint.filter(
        { checkpoint_key: checkpointKey },
        "-updated_date",
        1,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadDiscoveryAgent",
          fallback: [],
          severity: "secondary",
        })
      );
    checkpoint = existingCheckpoints[0] || null;
    if (
      checkpoint?.circuit_open_until &&
      Date.parse(checkpoint.circuit_open_until) > Date.now()
    ) {
      return Response.json({
        ok: true,
        status: "circuit_open",
        checkpoint_id: checkpoint.id,
        next_eligible_at: checkpoint.circuit_open_until,
        created_ids: [],
        matched_existing_ids: [],
      });
    }

    task = await service.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary:
        `Apollo provider-adapter page ${page}: ${industry} · ${country}; max ${perPage}`,
      started_at: now(),
    });
    checkpoint = await upsertCheckpoint(service, checkpoint, {
      checkpoint_key: checkpointKey,
      source_key: "apollo",
      provider_status: "ACTIVE",
      provider_expires_at: APOLLO_EXPIRY_AT,
      partition_json: partition,
      page,
      maximum_page: APOLLO_MAX_PAGE,
      last_attempt_at: now(),
      consecutive_failures: Number(checkpoint?.consecutive_failures || 0),
      engine_version: DISCOVERY_ENGINE_VERSION,
      api_calls: Number(checkpoint?.api_calls || 0),
      candidates_scanned: Number(checkpoint?.candidates_scanned || 0),
      unique_companies_created: Number(
        checkpoint?.unique_companies_created || 0,
      ),
      duplicates_rejected: Number(checkpoint?.duplicates_rejected || 0),
      quality_rejected: Number(checkpoint?.quality_rejected || 0),
      enrichment_candidates: Number(checkpoint?.enrichment_candidates || 0),
    });

    // Broad discovery is strictly company-only. Person lookup lives exclusively
    // behind leadEnrichmentAgent's explicit CONTACT_RESOLUTION gate.
    const discoveryRunId = String(body?.discovery_run_id || "");
    const costReservation = await reservePaidOperation(service, {
      event_key: `api:apollo:organization-search:${checkpointKey}:page:${page}`,
      category: "api",
      provider: "apollo",
      source: "leadDiscoveryAgent",
      related_entity_type: discoveryRunId
        ? "DiscoveryExecutionRun"
        : "LeadDiscoveryCheckpoint",
      related_entity_id: discoveryRunId || checkpoint.id,
      max_related_spend_minor: body?.max_related_spend_minor,
      usage_json: {
        discovery_run_id: discoveryRunId || null,
        checkpoint_id: checkpoint.id,
        stage: body?.cost_stage || "NATIVE_DISCOVERY",
        reason: body?.cost_reason || "provider_native_search",
      },
    });
    if (costReservation.duplicate) {
      await service.entities.AgentTask.update(task.id, {
        status: "waiting_input",
        output_summary:
          "A prior Apollo cost reservation exists without a run receipt; provider replay was blocked and requires reconciliation",
        error: "DUPLICATE_PAID_DISCOVERY_EFFECT_REVIEW_REQUIRED",
        completed_at: now(),
      });
      return Response.json({
        ok: false,
        provider: "apollo",
        duplicate_blocked: true,
        review_required: true,
        error: "DUPLICATE_PAID_DISCOVERY_EFFECT_REVIEW_REQUIRED",
        created_ids: [],
        matched_existing_ids: [],
        enrichment_ids: [],
        task_id: task.id,
        checkpoint_id: checkpoint.id,
      }, { status: 409 });
    }
    activeApolloReservation=costReservation;
    const organizationSearchBody: any = {
      organization_locations: [country],
      page,
      per_page: perPage,
    };
    if (manualDomain) {
      organizationSearchBody.q_organization_domains_list = [manualDomain];
    } else if (industry) {
      organizationSearchBody.q_organization_keyword_tags = [industry];
    }
    if (body?.employee_range) {
      organizationSearchBody.organization_num_employees_ranges = [
        String(body.employee_range),
      ];
    }
    if (body?.technology) {
      organizationSearchBody.currently_using_any_of_technology_uids = [
        String(body.technology),
      ];
    }
    const result = await guardReservedPaidProviderEffect(service,costReservation,{
      category:'api',provider:'apollo',source:'leadDiscoveryAgent',
      event_key:costReservation.event?.event_key,effect_key:`apollo_organization_search:${checkpointKey}:page:${page}`,
    },()=>providerAdapter.searchCompanies(organizationSearchBody));
    const organizations = Array.isArray(result.payload?.organizations)
      ? result.payload.organizations
      : Array.isArray(result.payload?.accounts)
      ? result.payload.accounts
      : [];
    const pagination = result.payload?.pagination || {};

    const rejected: any[] = [];
    const bestByCompany = new Map<string, any>();
    for (const organization of organizations) {
      const quality = merchantDiscoveryCandidate(organization);
      if (!quality.ok) {
        rejected.push({ reason: quality.reason });
        continue;
      }
      const domain = normalizeDiscoveryDomain(
        organization.primary_domain || organization.website_url,
      );
      const key = canonicalCompanyKey(domain, organization.name);
      const pre = cheapDiscoveryPreScore({ organization });
      if (pre.score < 20) {
        rejected.push({ reason: "low_pre_score" });
        continue;
      }
      const previous = bestByCompany.get(key);
      if (!previous || pre.score > previous.pre.score) {
        bestByCompany.set(key, {
          organization,
          domain,
          key,
          pre,
        });
      }
    }

    const candidateKeys = [...bestByCompany.keys()];
    const existingRows = candidateKeys.length
      ? await service.entities.OutboundLead.filter(
        { canonical_company_key: { $in: candidateKeys } },
        "-created_date",
        Math.min(5000, candidateKeys.length * 3),
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadDiscoveryAgent",
          fallback: [],
          severity: "secondary",
        })
      )
      : [];
    const existingKeys = new Set(
      existingRows.map((lead: any) =>
        String(
          lead.canonical_company_key ||
            canonicalCompanyKey(lead.company_domain, lead.company_name),
        )
      ).filter(Boolean),
    );
    const duplicates = candidateKeys.filter((key) =>
      existingKeys.has(key)
    ).length;
    const timestamp = now();
    const rows: any[] = [];
    for (const candidate of bestByCompany.values()) {
      if (existingKeys.has(candidate.key)) continue;
      const technologies = observedTechnologies(candidate.organization);
      const stack = detectedStack(technologies);
      rows.push({
        company_name: candidate.organization.name || null,
        company_domain: candidate.domain,
        canonical_company_key: candidate.key,
        country: countryCode,
        industry: candidate.organization.industry || industry,
        source: "apollo",
        stage: "lead",
        reservoir_state: "discovered",
        reservoir_updated_at: timestamp,
        external_refs_json: {
          apollo_organization_id: candidate.organization.id ||
            candidate.organization.organization_id || null,
          source_adapter: "apollo",
        },
        source_evidence_json: {
          source: "apollo",
          source_endpoint: "mixed_companies/search",
          source_observed_at: timestamp,
          country_source: "apollo:organization_location",
          technology_source: "apollo:organization_technologies",
          pre_score_source: "CAMBRA:deterministic_pre_score",
          pre_score_reasons: candidate.pre.reasons,
          provider_expiry_at: APOLLO_EXPIRY_AT,
          estimation_boundary:
            "Discovery inference is not verified merchant savings.",
        },
        discovered_at: timestamp,
        last_source_checked_at: timestamp,
        employee_range: employeeRange(
          candidate.organization.estimated_num_employees ||
            candidate.organization.num_employees,
        ),
        revenue_range: candidate.organization.annual_revenue_printed || null,
        detected_technologies: technologies,
        ecommerce_platform: stack.commerce,
        probable_payment_stack: stack.payments,
        estimation_status: "UNKNOWN",
        pre_score: candidate.pre.score,
        enrichment_worthy: candidate.pre.enrichment_worthy,
        contactability: "UNAVAILABLE",
        outreach_eligibility: "NOT_ASSESSED",
        compliance_status: "REVIEW_REQUIRED",
        legal_basis: "legitimate_interest",
        legal_basis_note:
          `B2B company intelligence about a ${industry} merchant in ${country}. No person endpoint or person field is used at discovery; outreach remains separately governed, suppression-aware and subject to jurisdiction review.`,
        raw_json: {
          source_adapter: "apollo",
          organization: {
            id: candidate.organization.id || null,
            name: candidate.organization.name || null,
            primary_domain: candidate.domain,
            industry: candidate.organization.industry || null,
            estimated_num_employees:
              candidate.organization.estimated_num_employees ?? null,
            annual_revenue: candidate.organization.annual_revenue ?? null,
          },
        },
      });
    }
    const created = rows.length
      ? await service.entities.OutboundLead.bulkCreate(rows).catch(async () => {
        const output = [];
        for (const row of rows) {
          const saved = await service.entities.OutboundLead.create(row).catch((
            error: any,
          ) =>
            safeBestEffort(error, {
              operation: "leadDiscoveryAgent",
              fallback: null,
              severity: "secondary",
            })
          );
          if (saved) output.push(saved);
        }
        return output;
      })
      : [];
    const createdIds = created.map((row: any) => row?.id).filter(Boolean);
    const enrichmentThreshold = Number(body?.enrichment_threshold || 45);
    const enrichmentKeys = new Set(
      rows.filter((row: any) =>
        row.enrichment_worthy === true ||
        Number(row.pre_score) >= enrichmentThreshold
      ).map((row: any) => row.canonical_company_key),
    );
    const enrichmentIds = created.filter((row: any, index: number) =>
      enrichmentKeys.has(
        row?.canonical_company_key || rows[index]?.canonical_company_key,
      )
    ).map((row: any) => row.id).filter(Boolean);
    const totalPages = Math.max(
      0,
      Math.min(APOLLO_MAX_PAGE, Number(pagination?.total_pages || 0)),
    );
    const nextPage = totalPages && page >= totalPages
      ? 1
      : page >= APOLLO_MAX_PAGE
      ? 1
      : page + 1;
    checkpoint = await service.entities.LeadDiscoveryCheckpoint.update(
      checkpoint.id,
      {
        provider_status: "ACTIVE",
        page: nextPage,
        total_pages_reported: totalPages,
        last_success_at: timestamp,
        next_eligible_at: new Date(Date.now() + 60_000).toISOString(),
        consecutive_failures: 0,
        circuit_open_until: null,
        last_error_code: null,
        api_calls: Number(checkpoint.api_calls || 0) + 1,
        candidates_scanned: Number(checkpoint.candidates_scanned || 0) +
          organizations.length,
        unique_companies_created:
          Number(checkpoint.unique_companies_created || 0) + createdIds.length,
        duplicates_rejected: Number(checkpoint.duplicates_rejected || 0) +
          duplicates,
        quality_rejected: Number(checkpoint.quality_rejected || 0) +
          rejected.length,
        enrichment_candidates: Number(checkpoint.enrichment_candidates || 0) +
          enrichmentIds.length,
      },
    );
    const rejectedByReason = rejected.reduce(
      (counts: Record<string, number>, row: any) => {
        const reason = String(row.reason || "unknown");
        counts[reason] = (counts[reason] || 0) + 1;
        return counts;
      },
      {},
    );
    await settlePaidOperation(service, costReservation, {
      ok: true,
      usage_json: {
        endpoint: "mixed_companies/search",
        provider_credit_cost_documented: 1,
        contact_endpoint_called: false,
        page,
        organizations_returned: organizations.length,
        people_returned: 0,
        unique_companies_created: createdIds.length,
      },
    });
    await service.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary:
        `Scanned ${organizations.length} companies; stored ${createdIds.length} company-only candidates; acquired 0 contacts; rejected ${duplicates} duplicates and ${rejected.length} low-quality candidates`,
      output_payload_json: {
        checkpoint_id: checkpoint.id,
        page,
        next_page: nextPage,
        scanned: organizations.length,
        decision_makers_found: 0,
        contact_records_acquired: 0,
        created: createdIds.length,
        enrichment_candidates: enrichmentIds.length,
        duplicate_rejected: duplicates,
        quality_rejected: rejected.length,
        rejected_by_reason: rejectedByReason,
      },
      completed_at: timestamp,
    });
    return Response.json({
      ok: true,
      task_id: task.id,
      checkpoint_id: checkpoint.id,
      provider: "apollo",
      provider_status: "ACTIVE",
      page,
      next_page: nextPage,
      scanned: organizations.length,
      decision_makers_found: 0,
      contact_records_acquired: 0,
      count: createdIds.length,
      rejected_count: rejected.length,
      rejected_by_reason: rejectedByReason,
      duplicate_rejected: duplicates,
      created_ids: createdIds,
      matched_existing_ids: existingRows.map((row: any) => row.id).filter(
        Boolean,
      ),
      enrichment_ids: enrichmentIds,
      source_credit_cost_documented: 1,
      decision_maker_credit_cost_documented: null,
      provider_expires_at: APOLLO_EXPIRY_AT,
    });
  } catch (error: any) {
    const code = safeErrorCode(error);
    const failures = Number(checkpoint?.consecutive_failures || 0) + 1;
    if (service && checkpoint?.id) {
      await service.entities.LeadDiscoveryCheckpoint.update(checkpoint.id, {
        provider_status: failures >= 3 ? "CIRCUIT_OPEN" : "DEGRADED",
        consecutive_failures: failures,
        circuit_open_until: failures >= 3 ? checkpointBackoff(failures) : null,
        next_eligible_at: checkpointBackoff(failures),
        last_error_code: code,
        last_attempt_at: now(),
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadDiscoveryAgent",
          fallback: null,
          severity: "secondary",
        })
      );
    }
    if (service && task?.id) {
      await service.entities.AgentTask.update(task.id, {
        status: "failed",
        error: code,
        output_summary: `Discovery provider failed safely: ${code}`,
        completed_at: now(),
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadDiscoveryAgent",
          fallback: null,
          severity: "secondary",
        })
      );
    }
    return Response.json({
      ok: false,
      error: code,
      task_id: task?.id || null,
      checkpoint_id: checkpoint?.id || null,
      retryable: [
        "APOLLO_RATE_LIMITED",
        "APOLLO_UPSTREAM_UNAVAILABLE",
        "APOLLO_REQUEST_FAILED",
      ].includes(code),
      secret_exposed: false,
    }, { status: Number(error?.status || 500) === 429 ? 429 : 500 });
  }
});
