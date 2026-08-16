import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  guardReservedPaidProviderEffect,
  reservePaidOperation,
  settlePaidOperation,
} from "../../shared/costGovernance.ts";
import {
  APOLLO_EXPIRY_AT,
  classifyProfessionalEmail,
  discoveryProviderStatus,
  normalizeDiscoveryDomain,
} from "../../shared/discoveryRadar.ts";
import {
  CONTACT_LAST_CONTRACT_VERSION,
  durableQualificationSnapshot,
  evaluateContactResolutionEligibility,
  evaluateSuppressionLookup,
  readCompleteContactUsageWindow,
  sameEmployer,
  validateDurableOutreachWorthySnapshot,
} from "../../shared/contactLast.ts";
import {
  merchantPolicyBindingMatches,
  readExactActiveMerchantAcquisitionPolicy,
} from "../../shared/commercialPolicyAuthority.ts";
import {
  reconcileCommittedAdaptiveLeadDecisionProjection,
  verifyCommittedAdaptiveLeadDecisionProjection,
} from "../../shared/intelligenceFoundationContracts.ts";

const AGENT_NAME = "lead_enrichment";
const TASK_TYPE = "enrich_leads";
const RISK_LEVEL = 1;
const APOLLO_BASE = "https://api.apollo.io/api/v1";
const now = () => new Date().toISOString();
const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function boundedInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(maximum, Math.floor(parsed)))
    : fallback;
}

function contactPriority(person: any) {
  const title = String(person?.title || "");
  if (/chief financial|\bcfo\b|head of finance|finance director/i.test(title)) {
    return 7;
  }
  if (/head of payments|payments director|payments manager/i.test(title)) {
    return 6;
  }
  if (/head of e-?commerce|e-?commerce director/i.test(title)) return 5;
  if (/chief operating|\bcoo\b/i.test(title)) return 4;
  if (/founder|owner|chief executive|\bceo\b/i.test(title)) return 3;
  if (/\b(vp|head|director)\b/i.test(title)) return 2;
  return 0;
}

async function apolloRequest(
  service:any,
  reservation:any,
  effectLabel:string,
  path: string,
  key: string,
  options: { body?: any; query?: URLSearchParams } = {},
) {
  let lastError: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const suffix = options.query?.toString()
        ? `?${options.query.toString()}`
        : "";
      const response = await guardReservedPaidProviderEffect(service,reservation,{
        category:'enrichment',provider:'apollo',source:'leadEnrichmentAgent',
        event_key:reservation?.event?.event_key,effect_key:`apollo_contact:${effectLabel}:attempt:${attempt+1}`,
      },()=>fetch(`${APOLLO_BASE}${path}${suffix}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "x-api-key": key,
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      }));
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const error: any = new Error(`Apollo contact HTTP ${response.status}`);
      error.status = response.status;
      error.retryAfter = Number(response.headers.get("retry-after") || 0);
      throw error;
    } catch (error: any) {
      lastError = error;
      if(['EMERGENCY_EFFECT_AMBIGUOUS','EMERGENCY_CONTROL_EPOCH_CHANGED','EMERGENCY_CONTROL_PAUSED'].includes(String(error?.code||'')))throw error;
      const status = Number(error?.status || 0);
      const retryable = status === 429 || status >= 500 || !status;
      if (!retryable || attempt === 2) break;
      await sleep(
        error?.retryAfter
          ? Math.min(5_000, error.retryAfter * 1_000)
          : 250 * (2 ** attempt),
      );
    }
  }
  throw lastError || new Error("Apollo contact resolution failed");
}

async function searchApolloContacts(
  service:any,
  reservation:any,
  key: string,
  lead: any,
  maximumContacts: number,
) {
  const organizationId = String(
    lead?.external_refs_json?.apollo_organization_id || "",
  ).trim();
  const domain = normalizeDiscoveryDomain(lead?.company_domain);
  if (!organizationId && !domain) return [];
  const payload = await apolloRequest(service,reservation,'people_search',"/mixed_people/api_search", key, {
    body: {
      ...(organizationId ? { organization_ids: [organizationId] } : {}),
      ...(!organizationId && domain
        ? { q_organization_domains_list: [domain] }
        : {}),
      person_titles: [
        "Chief Financial Officer",
        "Head of Finance",
        "Finance Director",
        "Head of Payments",
        "Payments Director",
        "Head of Ecommerce",
        "Ecommerce Director",
        "Chief Operating Officer",
        "Founder",
        "Chief Executive Officer",
      ],
      person_seniorities: [
        "owner",
        "founder",
        "c_suite",
        "vp",
        "head",
        "director",
      ],
      include_similar_titles: true,
      page: 1,
      per_page: maximumContacts,
    },
  });
  const people = Array.isArray(payload?.people) ? payload.people : [];
  return people.filter((person: any) => sameEmployer(lead, person)).sort(
    (left: any, right: any) => contactPriority(right) - contactPriority(left),
  ).slice(0, maximumContacts);
}

async function matchApolloContact(service:any,reservation:any,key: string, lead: any, person: any) {
  const query = new URLSearchParams();
  const personId = String(person?.id || person?.person_id || "").trim();
  if (personId) query.set("id", personId);
  else {
    const name = String(
      person?.name ||
        [person?.first_name, person?.last_name].filter(Boolean).join(" "),
    ).trim();
    if (name) query.set("name", name);
    const domain = normalizeDiscoveryDomain(lead?.company_domain);
    if (domain) query.set("domain", domain);
  }
  query.set("reveal_personal_emails", "false");
  query.set("reveal_phone_number", "false");
  return await apolloRequest(service,reservation,'person_match',"/people/match", key, { query });
}

function safeApolloPerson(payload: any) {
  const person = payload?.person || payload?.contact || payload || {};
  const organization = person?.organization || {};
  return {
    person,
    organization,
    snapshot: {
      provider: "apollo",
      provider_person_id: person?.id || null,
      provider_organization_id: organization?.id || null,
      title: person?.title || null,
      seniority: person?.seniority || null,
      email_status: person?.email_status || null,
      observed_at: now(),
      personal_email_requested: false,
      phone_requested: false,
      waterfall_requested: false,
    },
  };
}

function contactLastEvidence(
  lead: any,
  patch: Record<string, any>,
) {
  return {
    ...(lead?.source_evidence_json || {}),
    contact_last: {
      ...(lead?.source_evidence_json?.contact_last || {}),
      contract_version: CONTACT_LAST_CONTRACT_VERSION,
      ...patch,
    },
  };
}

async function readLeadForContactGate(service: any, leadId: string) {
  let lead: any = null;
  try {
    lead = await service.entities.OutboundLead.get(leadId);
  } catch (_) {
    // Converted below into the same fail-closed review path as an invalid read.
  }
  if (!lead?.id || String(lead.id) !== String(leadId)) {
    const error: any = new Error("contact_gate_lead_read_unavailable");
    error.code = "CONTACT_GATE_LEAD_READ_UNAVAILABLE";
    error.contactGate = true;
    error.blockers = ["contact_gate_lead_read_unavailable"];
    error.phase = "LEAD_SECURITY_STATE_REFRESH";
    error.gateStatus = "NEEDS_REVIEW_LEAD_SECURITY_STATE_UNAVAILABLE";
    error.suppressed = false;
    error.personPersisted = false;
    throw error;
  }
  return lead;
}

async function strictSuppressionLookup(
  service: any,
  email: unknown,
  phase: string,
) {
  if (!String(email || "").trim()) {
    return { ...evaluateSuppressionLookup(email, []), phase };
  }
  let rows: unknown;
  try {
    rows = await service.entities.ContactSuppression.filter(
      { email: String(email).trim().toLowerCase(), active: true },
      "-created_date",
      2,
    );
  } catch (_) {
    rows = undefined;
  }
  const decision = evaluateSuppressionLookup(email, rows);
  return { ...decision, phase };
}

async function strictCurrentPolicy(
  service: any,
  expected: any,
  expectedBinding: any,
  phase: string,
) {
  const authority = await readExactActiveMerchantAcquisitionPolicy(service);
  if (!authority.allowed) {
    return {
      allowed: false,
      policy: null,
      binding: null,
      blockers: authority.blockers,
      phase,
    };
  }
  const policy = authority.policy;
  const bindingMatch = merchantPolicyBindingMatches(
    expectedBinding,
    authority.binding,
  );
  if (
    String(policy?.policy_key || "") !== String(expected?.policy_key || "") ||
    String(policy?.version || "") !== String(expected?.version || "") ||
    !bindingMatch.allowed
  ) {
    return {
      allowed: false,
      policy,
      binding: authority.binding,
      blockers: [
        "commercial_policy_snapshot_changed",
        ...bindingMatch.blockers,
      ],
      phase,
    };
  }
  return {
    allowed: true,
    policy,
    binding: authority.binding,
    blockers: [],
    phase,
  };
}

function contactGateBlockPatch(
  lead: any,
  input: {
    status: string;
    blocker: string;
    phase: string;
    qualification?: any;
    roleTarget?: any;
    suppressed?: boolean;
    contactCalls?: number;
  },
) {
  return {
    contactability: "UNAVAILABLE",
    outreach_eligibility: input.suppressed ? "BLOCKED" : "REVIEW_REQUIRED",
    ...(input.suppressed
      ? {
        reservoir_state: "suppressed",
        suppression_reason: "contact_suppression",
        reservoir_updated_at: now(),
      }
      : {}),
    next_action: input.suppressed
      ? "Suppression confirmed; do not resolve or contact this person."
      : "Reconcile the fail-closed contact/suppression gate before any person lookup or persistence.",
    source_evidence_json: contactLastEvidence(lead, {
      status: input.status,
      blocker: input.blocker,
      gate_phase: input.phase,
      company_qualification: input.qualification || null,
      role_target: input.roleTarget || null,
      contact_calls: input.contactCalls || 0,
      person_persistence_allowed: false,
    }),
  };
}

async function currentContactGate(
  service: any,
  lead: any,
  policy: any,
  qualification: any,
  maximumContacts: number,
  phase: string,
) {
  const expectedBinding = lead?.score_breakdown_json?.adaptive_lead_v0
    ?.policy_binding;
  const policyGate = await strictCurrentPolicy(
    service,
    policy,
    expectedBinding,
    phase,
  );
  const eligibility = evaluateContactResolutionEligibility(
    lead,
    policyGate.policy,
    {
      maximum_contacts: maximumContacts,
      policy_binding: policyGate.binding,
    },
  );
  const durable = validateDurableOutreachWorthySnapshot(lead, qualification);
  const adaptiveProjection =
    await verifyCommittedAdaptiveLeadDecisionProjection(service, lead);
  return {
    allowed: policyGate.allowed && eligibility.allowed && durable.allowed &&
      adaptiveProjection.allowed,
    blockers: [
      ...new Set([
        ...policyGate.blockers,
        ...eligibility.blockers,
        ...durable.blockers,
        ...adaptiveProjection.blockers,
      ]),
    ],
    policy: policyGate.policy,
    policy_gate: policyGate,
    eligibility,
    durable,
    adaptive_projection: adaptiveProjection,
  };
}

function stopContactGate(input: {
  blocker: string;
  blockers?: string[];
  phase: string;
  status: string;
  suppressed?: boolean;
  personPersisted?: boolean;
}): never {
  const error: any = new Error(input.blocker);
  error.code = input.blocker.toUpperCase();
  error.contactGate = true;
  error.blockers = input.blockers?.length ? input.blockers : [input.blocker];
  error.phase = input.phase;
  error.gateStatus = input.status;
  error.suppressed = input.suppressed === true;
  error.requiresReview = !error.suppressed ||
    ["suppression_lookup_unavailable", "suppression_lookup_ambiguous"]
      .includes(input.blocker);
  error.personPersisted = input.personPersisted === true;
  throw error;
}

Deno.serve(async (req) => {
  let task: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) {
      return gate.response ||
        Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const service = base44.asServiceRole;
    const operation = String(body?.operation || "COMPANY_ENRICHMENT")
      .toUpperCase();
    const leadIds = Array.isArray(body?.lead_ids)
      ? body.lead_ids.map((value: any) => String(value)).filter(Boolean).slice(
        0,
        100,
      )
      : null;
    const requestedLimit = boundedInteger(body?.limit, 25, 100);
    const policyAuthority =
      await readExactActiveMerchantAcquisitionPolicy(service);
    const activePolicy = policyAuthority.policy;
    const activePolicyBinding = policyAuthority.binding;
    const policyLookupUnavailable = policyAuthority.status === "UNAVAILABLE";
    const policyGateError = policyAuthority.allowed
      ? null
      : policyAuthority.status === "UNAVAILABLE"
      ? "COMMERCIAL_POLICY_LOOKUP_UNAVAILABLE"
      : policyAuthority.status === "TRUNCATED"
      ? "COMMERCIAL_POLICY_AUTHORITY_SCOPE_TRUNCATED"
      : policyAuthority.status === "AMBIGUOUS"
      ? "AMBIGUOUS_ACTIVE_COMMERCIAL_POLICIES"
      : "EXACTLY_ONE_ACTIVE_COMMERCIAL_POLICY_REQUIRED";

    task = await service.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: operation === "CONTACT_RESOLUTION"
        ? `Contact-last resolution for up to ${requestedLimit} scored companies`
        : `Company-only enrichment review for up to ${requestedLimit} candidates`,
      started_at: now(),
    });

    // The historical default used people/match as "company enrichment". That
    // path is removed: a generic/enrichment run never acquires person data.
    if (operation !== "CONTACT_RESOLUTION") {
      await service.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary:
          "Company-only enrichment completed without a person endpoint; existing organization evidence remains available for scoring",
        output_payload_json: {
          count: 0,
          enriched: 0,
          skipped: 0,
          company_only: true,
          contact_calls: 0,
          status: "NO_COMPANY_ENRICHMENT_ADAPTER_CONFIGURED",
        },
        completed_at: now(),
      });
      return Response.json({
        ok: true,
        task_id: task.id,
        count: 0,
        enriched: 0,
        skipped: 0,
        company_only: true,
        contact_calls: 0,
        status: "NO_COMPANY_ENRICHMENT_ADAPTER_CONFIGURED",
      });
    }

    // Contact spend has one unambiguous authority source. Zero, multiple, or
    // unreadable active policies block before lead reads, reservations, and
    // provider/person endpoints.
    if (policyGateError) {
      await service.entities.AgentTask.update(task.id, {
        status: "waiting_input",
        output_summary:
          "Contact resolution blocked: exactly one readable active merchant-acquisition policy is required",
        output_payload_json: {
          count: 0,
          contact_calls: 0,
          paid_reservations: 0,
          person_persistence: 0,
          active_policy_count: policyAuthority.active_count,
          policy_lookup_unavailable: policyLookupUnavailable,
          blocker: policyGateError,
        },
        error: policyGateError,
        completed_at: now(),
      });
      return Response.json({
        ok: false,
        task_id: task.id,
        error: policyGateError,
        active_policy_count: policyAuthority.active_count,
        contact_calls: 0,
        paid_reservations: 0,
        person_persistence: 0,
      }, { status: 409 });
    }

    let leads: any[] = leadIds?.length
      ? await service.entities.OutboundLead.filter(
        { id: { $in: leadIds } },
        "-score",
        leadIds.length,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadEnrichmentAgent",
          fallback: [],
          severity: "secondary",
        })
      )
      : await service.entities.OutboundLead.filter(
        { stage: "scored" },
        "-score",
        Math.min(100, requestedLimit * 4),
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadEnrichmentAgent",
          fallback: [],
          severity: "secondary",
        })
      );
    leads = leads.slice(0, requestedLimit);
    if (!leads.length) {
      await service.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary:
          "No scored companies were supplied for contact resolution",
        output_payload_json: { count: 0, contact_calls: 0 },
        completed_at: now(),
      });
      return Response.json({ ok: true, task_id: task.id, count: 0 });
    }

    const apolloKey = Deno.env.get("APOLLO_API_KEY") || "";
    const apolloStatus = discoveryProviderStatus(Boolean(apolloKey));
    const configuredDailyLimit = Math.max(
      0,
      Math.min(
        250,
        Math.floor(
          Number(activePolicy?.icp_json?.enrichment_daily_limit),
        ),
      ),
    );
    const configuredWeeklyLimit = Math.max(
      0,
      Math.min(
        1250,
        Math.floor(
          Number(
            activePolicy?.icp_json?.enrichment_weekly_limit,
          ),
        ),
      ),
    );
    const clock = new Date();
    const todayStart = new Date(Date.UTC(
      clock.getUTCFullYear(),
      clock.getUTCMonth(),
      clock.getUTCDate(),
    )).toISOString();
    const rollingWeekStart = new Date(
      clock.getTime() - 7 * 86_400_000,
    ).toISOString();
    const [dailyUsage, weeklyUsage] = await Promise.all([
      readCompleteContactUsageWindow(service, {
        window_start: todayStart,
        limit: configuredDailyLimit,
      }),
      readCompleteContactUsageWindow(service, {
        window_start: rollingWeekStart,
        limit: configuredWeeklyLimit,
      }),
    ]);
    if (!dailyUsage.allowed || !weeklyUsage.allowed) {
      const blockers = [dailyUsage.blocker, weeklyUsage.blocker].filter(
        Boolean,
      );
      await service.entities.AgentTask.update(task.id, {
        status: "waiting_input",
        review_required: true,
        output_summary:
          "Contact resolution blocked: complete daily and weekly Apollo usage coverage could not be proven",
        output_payload_json: {
          contact_calls: 0,
          paid_reservations: 0,
          person_persistence: 0,
          daily_usage: dailyUsage,
          weekly_usage: weeklyUsage,
          blockers,
        },
        error: blockers[0] || "CONTACT_USAGE_COVERAGE_UNPROVEN",
        completed_at: now(),
      });
      return Response.json({
        ok: false,
        task_id: task.id,
        error: blockers[0] || "contact_usage_coverage_unproven",
        blockers,
        daily_usage: dailyUsage,
        weekly_usage: weeklyUsage,
        contact_calls: 0,
        paid_reservations: 0,
        person_persistence: 0,
      }, { status: 503 });
    }
    const usedToday = Number(dailyUsage.used || 0);
    const usedThisWeek = Number(weeklyUsage.used || 0);
    let remaining = Math.min(
      Math.max(0, configuredDailyLimit - usedToday),
      Math.max(0, configuredWeeklyLimit - usedThisWeek),
    );
    const maximumContacts = Math.max(
      1,
      Math.min(2, boundedInteger(body?.maximum_contacts, 2, 2)),
    );

    let resolved = 0;
    let noContact = 0;
    let skipped = 0;
    let failed = 0;
    let reviewRequired = 0;
    let providerCalls = 0;
    const resolvedIds: string[] = [];
    const blocked: any[] = [];

    for (const queuedLead of leads) {
      let currentLead = queuedLead;
      let eligibility: any = null;
      let qualification: any = null;
      let reservation: any = null;
      let leadProviderCalls = 0;
      let personWasPersisted = false;
      try {
        // Never authorize contact from a stale list result. Re-read immediately
        // before the initial suppression and company-only gates.
        currentLead = await readLeadForContactGate(service, queuedLead.id);
        const existingEmail = String(currentLead?.contact_email || "").trim()
          .toLowerCase();
        const initialSuppression = await strictSuppressionLookup(
          service,
          existingEmail,
          "PRE_QUALIFICATION",
        );
        if (!initialSuppression.allowed) {
          stopContactGate({
            blocker: initialSuppression.blocker ||
              "suppression_lookup_unavailable",
            phase: initialSuppression.phase,
            status: initialSuppression.suppressed
              ? "BLOCKED_KNOWN_SUPPRESSION_PRE_LOOKUP"
              : "NEEDS_REVIEW_SUPPRESSION_GATE_PRE_LOOKUP",
            suppressed: initialSuppression.suppressed,
          });
        }
        if (
          existingEmail &&
          currentLead?.contactability === "PROFESSIONAL_VERIFIED"
        ) {
          skipped++;
          blocked.push({
            lead_id: currentLead.id,
            blockers: ["valid_contact_already_resolved"],
          });
          continue;
        }

        eligibility = evaluateContactResolutionEligibility(
          currentLead,
          activePolicy,
          {
            maximum_contacts: maximumContacts,
            policy_binding: activePolicyBinding,
          },
        );
        if (!eligibility.allowed) {
          const needsRescore = eligibility.blockers.some((blocker: string) =>
            [
              "adaptive_outreach_worthiness_snapshot_required",
              "adaptive_decision_identity_required",
              "adaptive_candidate_reference_mismatch",
              "adaptive_company_reference_mismatch",
              "adaptive_exact_active_policy_binding_required",
              "current_exact_active_policy_binding_required",
              "commercial_policy_content_hash_mismatch",
              "governed_deterministic_contact_eligibility_required",
              "deterministic_company_score_below_policy_threshold",
              "privacy_safe_aggregate_coverage_incomplete",
              "rescore_or_backfill_required",
            ].includes(blocker)
          );
          skipped++;
          if (needsRescore) {
            reviewRequired++;
          }
          blocked.push({
            lead_id: currentLead.id,
            blockers: eligibility.blockers,
          });
          await service.entities.OutboundLead.update(currentLead.id, {
            ...(needsRescore
              ? {
                outreach_eligibility: "REVIEW_REQUIRED",
                next_action:
                  "Rescore/backfill this company to persist a valid Adaptive Lead OUTREACH_WORTHY snapshot before contact resolution.",
              }
              : {}),
            source_evidence_json: contactLastEvidence(currentLead, {
              status: needsRescore
                ? "BLOCKED_REQUIRES_ADAPTIVE_RESCORE_OR_BACKFILL"
                : "BLOCKED_PRE_CONTACT",
              company_qualification: eligibility.snapshot,
              contact_calls: 0,
              person_persistence_allowed: false,
            }),
          });
          continue;
        }

        // Crash-safe outbox equivalent: repair only the append-only Event
        // projection from this exact committed decision snapshot. This never
        // recalculates the score or mutates the source lead. Contact remains
        // blocked unless both required decision events read back exactly once.
        const projectionReconciliation =
          await reconcileCommittedAdaptiveLeadDecisionProjection(
            service,
            currentLead,
            `contact-gate:${task.id}:${currentLead.id}`,
          );
        if (!projectionReconciliation.allowed) {
          stopContactGate({
            blocker: projectionReconciliation.blockers[0] ||
              "adaptive_experience_projection_unverified",
            blockers: projectionReconciliation.blockers,
            phase: "ADAPTIVE_EXPERIENCE_RECONCILIATION",
            status: "NEEDS_REVIEW_ADAPTIVE_EXPERIENCE_PROJECTION",
          });
        }
        if (!apolloStatus.available || remaining <= 0) {
          skipped++;
          blocked.push({
            lead_id: currentLead.id,
            blockers: [
              !apolloStatus.available
                ? "contact_provider_unavailable"
                : "contact_resolution_budget_exhausted",
            ],
          });
          continue;
        }

        // Persist and read back the exact qualification snapshot. A numeric
        // legacy score alone can never authorize the paid person endpoint.
        qualification = durableQualificationSnapshot(eligibility.snapshot);
        await service.entities.OutboundLead.update(currentLead.id, {
          source_evidence_json: contactLastEvidence(currentLead, {
            status: "OUTREACH_WORTHY_CONTACT_PENDING",
            company_qualification: qualification,
            role_target: eligibility.role_target,
            contact_calls: 0,
            person_persistence_allowed: false,
          }),
          next_action:
            "Resolve at most two professional contacts; compliance and suppression remain separate gates.",
        });
        currentLead = await readLeadForContactGate(service, currentLead.id);
        const persistedGate = await currentContactGate(
          service,
          currentLead,
          activePolicy,
          qualification,
          maximumContacts,
          "AFTER_QUALIFICATION_PERSISTENCE",
        );
        const persistedSuppression = await strictSuppressionLookup(
          service,
          currentLead.contact_email,
          "AFTER_QUALIFICATION_PERSISTENCE",
        );
        if (!persistedGate.allowed || !persistedSuppression.allowed) {
          stopContactGate({
            blocker: persistedSuppression.blocker ||
              persistedGate.blockers[0] || "durable_contact_gate_failed",
            blockers: [
              ...persistedGate.blockers,
              ...(persistedSuppression.blocker
                ? [persistedSuppression.blocker]
                : []),
            ],
            phase: "AFTER_QUALIFICATION_PERSISTENCE",
            status: "NEEDS_REVIEW_DURABLE_CONTACT_GATE",
            suppressed: persistedSuppression.suppressed,
          });
        }

        reservation = await reservePaidOperation(service, {
          event_key:
            `contact-resolution:apollo:${currentLead.id}:${activePolicy.policy_key}:${activePolicy.version}`,
          category: "enrichment",
          provider: "apollo",
          source: "leadEnrichmentAgent",
          related_entity_type: body?.discovery_run_id
            ? "DiscoveryExecutionRun"
            : "OutboundLead",
          related_entity_id: body?.discovery_run_id || currentLead.id,
          max_related_spend_minor: body?.max_related_spend_minor,
          usage_json: {
            discovery_run_id: body?.discovery_run_id || null,
            lead_id: currentLead.id,
            stage: "CONTACT_RESOLUTION",
            role_target_id: eligibility.role_target?.role_target_id,
            maximum_contacts: maximumContacts,
            reason: "Company passed outreach-worthiness before contact lookup",
          },
        });
        if (reservation.duplicate) {
          reviewRequired++;
          blocked.push({
            lead_id: currentLead.id,
            blockers: ["duplicate_paid_contact_effect_requires_reconciliation"],
          });
          await service.entities.OutboundLead.update(currentLead.id, {
            source_evidence_json: contactLastEvidence(currentLead, {
              status: "NEEDS_REVIEW_DUPLICATE_EFFECT",
              error_code: "DUPLICATE_PAID_CONTACT_EFFECT_REVIEW_REQUIRED",
              company_qualification: qualification,
              role_target: eligibility.role_target,
              contact_calls: 0,
              replay_blocked: true,
            }),
          });
          continue;
        }

        // Reservation is not authority. Re-read all mutable safety inputs once
        // more immediately before the first provider/person endpoint.
        currentLead = await readLeadForContactGate(service, currentLead.id);
        const beforeProviderGate = await currentContactGate(
          service,
          currentLead,
          activePolicy,
          qualification,
          maximumContacts,
          "IMMEDIATELY_BEFORE_PROVIDER",
        );
        const beforeProviderSuppression = await strictSuppressionLookup(
          service,
          currentLead.contact_email,
          "IMMEDIATELY_BEFORE_PROVIDER",
        );
        if (!beforeProviderGate.allowed || !beforeProviderSuppression.allowed) {
          stopContactGate({
            blocker: beforeProviderSuppression.blocker ||
              beforeProviderGate.blockers[0] || "contact_gate_changed",
            blockers: [
              ...beforeProviderGate.blockers,
              ...(beforeProviderSuppression.blocker
                ? [beforeProviderSuppression.blocker]
                : []),
            ],
            phase: "IMMEDIATELY_BEFORE_PROVIDER",
            status: "NEEDS_REVIEW_PRE_PROVIDER_TOCTOU",
            suppressed: beforeProviderSuppression.suppressed,
          });
        }

        providerCalls++;
        leadProviderCalls++;
        remaining--;
        const candidates = await searchApolloContacts(
          service,
          reservation,
          apolloKey,
          currentLead,
          maximumContacts,
        );
        if (!candidates.length) {
          currentLead = await readLeadForContactGate(service, currentLead.id);
          const noContactGate = await currentContactGate(
            service,
            currentLead,
            activePolicy,
            qualification,
            maximumContacts,
            "AFTER_PROVIDER_NO_CONTACT",
          );
          const noContactSuppression = await strictSuppressionLookup(
            service,
            currentLead.contact_email,
            "AFTER_PROVIDER_NO_CONTACT",
          );
          if (!noContactGate.allowed || !noContactSuppression.allowed) {
            stopContactGate({
              blocker: noContactSuppression.blocker ||
                noContactGate.blockers[0] || "contact_gate_changed",
              blockers: [
                ...noContactGate.blockers,
                ...(noContactSuppression.blocker
                  ? [noContactSuppression.blocker]
                  : []),
              ],
              phase: "AFTER_PROVIDER_NO_CONTACT",
              status: "NEEDS_REVIEW_POST_PROVIDER_TOCTOU",
              suppressed: noContactSuppression.suppressed,
            });
          }
          noContact++;
          await service.entities.OutboundLead.update(currentLead.id, {
            contactability: "UNAVAILABLE",
            source_evidence_json: contactLastEvidence(currentLead, {
              status: "NO_VALID_CONTACT_SAFE_STOP",
              company_qualification: qualification,
              role_target: eligibility.role_target,
              requested_contacts: maximumContacts,
              returned_contacts: 0,
              contact_calls: 1,
              invented_contact: false,
            }),
          });
          await settlePaidOperation(service, reservation, {
            ok: true,
            usage_json: {
              endpoint: "mixed_people/api_search",
              requested_contacts: maximumContacts,
              returned_contacts: 0,
              selected_contact: false,
            },
          });
          continue;
        }

        const selected = candidates[0];
        // The provider search above and the person match below are distinct
        // person-data effects. Re-prove the immutable decision projection and
        // suppression state before advancing to the second endpoint.
        currentLead = await readLeadForContactGate(service, currentLead.id);
        const beforePersonMatchGate = await currentContactGate(
          service,
          currentLead,
          activePolicy,
          qualification,
          maximumContacts,
          "IMMEDIATELY_BEFORE_PERSON_MATCH",
        );
        const beforePersonMatchSuppression = await strictSuppressionLookup(
          service,
          selected?.email,
          "IMMEDIATELY_BEFORE_PERSON_MATCH",
        );
        if (
          !beforePersonMatchGate.allowed ||
          !beforePersonMatchSuppression.allowed
        ) {
          stopContactGate({
            blocker: beforePersonMatchSuppression.blocker ||
              beforePersonMatchGate.blockers[0] ||
              "contact_gate_changed_before_person_match",
            blockers: [
              ...beforePersonMatchGate.blockers,
              ...(beforePersonMatchSuppression.blocker
                ? [beforePersonMatchSuppression.blocker]
                : []),
            ],
            phase: "IMMEDIATELY_BEFORE_PERSON_MATCH",
            status: "NEEDS_REVIEW_PRE_PERSON_MATCH_TOCTOU",
            suppressed: beforePersonMatchSuppression.suppressed,
          });
        }
        providerCalls++;
        leadProviderCalls++;
        const payload = await matchApolloContact(
          service,
          reservation,
          apolloKey,
          currentLead,
          selected,
        );
        const safe = safeApolloPerson(payload);
        if (!sameEmployer(currentLead, safe.person, safe.organization)) {
          throw Object.assign(new Error("contact_employer_mismatch"), {
            code: "CONTACT_EMPLOYER_MISMATCH",
          });
        }
        const professional = classifyProfessionalEmail(
          safe.person?.email,
          currentLead.company_domain || safe.organization?.primary_domain,
        );
        if (!professional.accepted) {
          currentLead = await readLeadForContactGate(service, currentLead.id);
          const unavailableGate = await currentContactGate(
            service,
            currentLead,
            activePolicy,
            qualification,
            maximumContacts,
            "AFTER_PROVIDER_CHANNEL_UNAVAILABLE",
          );
          if (!unavailableGate.allowed) {
            stopContactGate({
              blocker: unavailableGate.blockers[0] || "contact_gate_changed",
              blockers: unavailableGate.blockers,
              phase: "AFTER_PROVIDER_CHANNEL_UNAVAILABLE",
              status: "NEEDS_REVIEW_POST_PROVIDER_TOCTOU",
            });
          }
          noContact++;
          await service.entities.OutboundLead.update(currentLead.id, {
            contactability: "UNAVAILABLE",
            source_evidence_json: contactLastEvidence(currentLead, {
              status: "CONTACT_CHANNEL_UNAVAILABLE_NO_PERSON_PERSISTENCE",
              company_qualification: qualification,
              role_target: eligibility.role_target,
              requested_contacts: maximumContacts,
              returned_contacts: candidates.length,
              discarded_contacts: candidates.length,
              contact_calls: leadProviderCalls,
              professional_email_reason: professional.reason ||
                "not_accepted",
              person_persistence_allowed: false,
            }),
          });
          await settlePaidOperation(service, reservation, {
            ok: true,
            usage_json: {
              endpoint: "mixed_people/api_search + people/match",
              returned_contacts: candidates.length,
              selected_contact: false,
              professional_email_returned: false,
              person_persisted: false,
            },
          });
          continue;
        }
        currentLead = await readLeadForContactGate(service, currentLead.id);
        const afterProviderGate = await currentContactGate(
          service,
          currentLead,
          activePolicy,
          qualification,
          maximumContacts,
          "AFTER_PROVIDER_BEFORE_PERSON_PERSISTENCE",
        );
        const selectedSuppression = await strictSuppressionLookup(
          service,
          professional.accepted ? professional.email : null,
          "AFTER_PROVIDER_BEFORE_PERSON_PERSISTENCE",
        );
        if (!afterProviderGate.allowed || !selectedSuppression.allowed) {
          stopContactGate({
            blocker: selectedSuppression.blocker ||
              afterProviderGate.blockers[0] || "contact_gate_changed",
            blockers: [
              ...afterProviderGate.blockers,
              ...(selectedSuppression.blocker
                ? [selectedSuppression.blocker]
                : []),
            ],
            phase: "AFTER_PROVIDER_BEFORE_PERSON_PERSISTENCE",
            status: selectedSuppression.suppressed
              ? "SUPPRESSED_AFTER_LOOKUP_NO_PERSON_PERSISTENCE"
              : "NEEDS_REVIEW_POST_PROVIDER_NO_PERSON_PERSISTENCE",
            suppressed: selectedSuppression.suppressed,
          });
        }

        // Close the widest practical TOCTOU window available without a Base44
        // compare-and-swap primitive: re-read after suppression and immediately
        // before the narrow contact-only update.
        currentLead = await readLeadForContactGate(service, currentLead.id);
        const immediatelyBeforePersistence = await currentContactGate(
          service,
          currentLead,
          activePolicy,
          qualification,
          maximumContacts,
          "IMMEDIATELY_BEFORE_PERSON_PERSISTENCE",
        );
        const finalSuppression = await strictSuppressionLookup(
          service,
          professional.accepted ? professional.email : null,
          "IMMEDIATELY_BEFORE_PERSON_PERSISTENCE",
        );
        if (
          !immediatelyBeforePersistence.allowed || !finalSuppression.allowed
        ) {
          stopContactGate({
            blocker: finalSuppression.blocker ||
              immediatelyBeforePersistence.blockers[0] ||
              "contact_gate_changed",
            blockers: [
              ...immediatelyBeforePersistence.blockers,
              ...(finalSuppression.blocker ? [finalSuppression.blocker] : []),
            ],
            phase: "IMMEDIATELY_BEFORE_PERSON_PERSISTENCE",
            status: finalSuppression.suppressed
              ? "SUPPRESSED_BEFORE_PERSON_PERSISTENCE"
              : "NEEDS_REVIEW_PRE_PERSISTENCE_TOCTOU",
            suppressed: finalSuppression.suppressed,
          });
        }
        const providerVerified = String(safe.person?.email_status || "")
          .toLowerCase() === "verified";
        const contactName = String(
          safe.person?.name || selected?.name ||
            [safe.person?.first_name, safe.person?.last_name].filter(Boolean)
              .join(" "),
        ).trim() || null;
        const contactTitle = safe.person?.title || selected?.title || null;
        const linkedIn = safe.person?.linkedin_url || selected?.linkedin_url ||
          null;
        await service.entities.OutboundLead.update(currentLead.id, {
          contact_full_name: contactName,
          contact_title: contactTitle,
          linkedin_url: linkedIn,
          ...(professional.accepted
            ? { contact_email: professional.email }
            : {}),
          email_verification_status: String(
            safe.person?.email_status || professional.reason || "unknown",
          ),
          contactability: professional.accepted && providerVerified
            ? "PROFESSIONAL_VERIFIED"
            : professional.accepted
            ? "UNVERIFIED"
            : "UNAVAILABLE",
          reservoir_updated_at: now(),
          last_enriched_at: now(),
          enrichment_json: {
            provider: "apollo",
            contact_resolution: safe.snapshot,
          },
          external_refs_json: {
            ...(currentLead.external_refs_json || {}),
            apollo_person_id: safe.person?.id || selected?.id || null,
          },
          source_evidence_json: contactLastEvidence(currentLead, {
            status: professional.accepted
              ? "CONTACT_RESOLVED_PENDING_COMPLIANCE"
              : "CONTACT_PROFILE_FOUND_CHANNEL_UNAVAILABLE",
            company_qualification: qualification,
            role_target: eligibility.role_target,
            provider: "apollo",
            provider_expiry_at: APOLLO_EXPIRY_AT,
            requested_contacts: maximumContacts,
            returned_contacts: candidates.length,
            selected_contact_provider_id: safe.person?.id || selected?.id ||
              null,
            discarded_contacts: Math.max(0, candidates.length - 1),
            contact_calls: 2,
            professional_email_reason: professional.reason || "accepted",
            compliance_gate_passed: false,
            person_persistence_allowed: true,
          }),
        });
        personWasPersisted = true;

        // Detect a suppression/state change that raced the final write. If the
        // post-write gate cannot be proven, immediately scrub every newly
        // persisted person field and require reconciliation.
        currentLead = await readLeadForContactGate(service, currentLead.id);
        const afterPersistenceGate = await currentContactGate(
          service,
          currentLead,
          activePolicy,
          qualification,
          maximumContacts,
          "AFTER_PERSON_PERSISTENCE",
        );
        const afterPersistenceSuppression = await strictSuppressionLookup(
          service,
          professional.accepted ? professional.email : null,
          "AFTER_PERSON_PERSISTENCE",
        );
        if (
          !afterPersistenceGate.allowed || !afterPersistenceSuppression.allowed
        ) {
          stopContactGate({
            blocker: afterPersistenceSuppression.blocker ||
              afterPersistenceGate.blockers[0] || "contact_gate_changed",
            blockers: [
              ...afterPersistenceGate.blockers,
              ...(afterPersistenceSuppression.blocker
                ? [afterPersistenceSuppression.blocker]
                : []),
            ],
            phase: "AFTER_PERSON_PERSISTENCE",
            status: "PERSON_PERSISTENCE_REVERTED_FAIL_CLOSED",
            suppressed: afterPersistenceSuppression.suppressed,
            personPersisted: true,
          });
        }
        await settlePaidOperation(service, reservation, {
          ok: true,
          usage_json: {
            endpoint: "mixed_people/api_search + people/match",
            provider_credit_cost_documented_range: "1-9",
            requested_contacts: maximumContacts,
            returned_contacts: candidates.length,
            selected_contact: true,
            professional_email_returned: professional.accepted,
            personal_email_requested: false,
            phone_requested: false,
            waterfall_requested: false,
          },
        });
        resolved++;
        resolvedIds.push(currentLead.id);
      } catch (error: any) {
        if (error?.contactGate) {
          error.personPersisted = error.personPersisted === true ||
            personWasPersisted;
          skipped++;
          if (error.requiresReview) {
            reviewRequired++;
          }
          const blockers = Array.isArray(error?.blockers)
            ? error.blockers
            : [String(error?.message || "contact_gate_failed")];
          blocked.push({
            lead_id: currentLead?.id || queuedLead.id,
            blockers,
            phase: error?.phase || "UNKNOWN",
          });
          if (reservation && !reservation.duplicate) {
            await settlePaidOperation(service, reservation, {
              // Once Apollo has been called, the cost remains consumed even
              // when a later safety gate blocks/scrubs the contact. Only a
              // pre-provider gate may void the reservation.
              ok: leadProviderCalls > 0,
              usage_json: {
                error_code: String(error?.code || "CONTACT_GATE_FAILED").slice(
                  0,
                  80,
                ),
                gate_phase: error?.phase || "UNKNOWN",
                provider_calls: leadProviderCalls,
                cost_consumed: leadProviderCalls > 0,
                selected_contact: false,
                person_persisted_then_scrubbed: error.personPersisted === true,
              },
            }).catch((settleError: any) =>
              safeBestEffort(settleError, {
                operation: "leadEnrichmentAgent.contactGateSettlement",
                fallback: null,
                severity: "critical",
              })
            );
          }
          const externalRefs = { ...(currentLead?.external_refs_json || {}) };
          delete externalRefs.apollo_person_id;
          const enrichment = { ...(currentLead?.enrichment_json || {}) };
          delete enrichment.contact_resolution;
          await service.entities.OutboundLead.update(
            currentLead?.id || queuedLead.id,
            {
              ...(error.personPersisted
                ? {
                  contact_full_name: null,
                  contact_title: null,
                  contact_email: null,
                  linkedin_url: null,
                  email_verification_status: "BLOCKED_BY_CONTACT_GATE",
                  external_refs_json: externalRefs,
                  enrichment_json: enrichment,
                }
                : {}),
              ...contactGateBlockPatch(currentLead || queuedLead, {
                status: error?.gateStatus || "CONTACT_GATE_FAILED_CLOSED",
                blocker: blockers[0],
                phase: error?.phase || "UNKNOWN",
                qualification,
                roleTarget: eligibility?.role_target,
                suppressed: error.suppressed === true,
                contactCalls: leadProviderCalls,
              }),
            },
          ).catch((updateError: any) =>
            safeBestEffort(updateError, {
              operation: "leadEnrichmentAgent.contactGateBlock",
              fallback: null,
              severity: "critical",
            })
          );
          continue;
        }
        failed++;
        if (reservation && !reservation.duplicate) {
          await settlePaidOperation(service, reservation, {
            ok: false,
            usage_json: {
              error_code: String(
                error?.code ||
                  (Number(error?.status || 0) === 429
                    ? "RATE_LIMITED"
                    : "CONTACT_RESOLUTION_FAILED"),
              ).slice(0, 80),
            },
          }).catch((settleError: any) =>
            safeBestEffort(settleError, {
              operation: "leadEnrichmentAgent",
              fallback: null,
              severity: "secondary",
            })
          );
        }
        await service.entities.OutboundLead.update(
          currentLead?.id || queuedLead.id,
          {
            source_evidence_json: contactLastEvidence(
              currentLead || queuedLead,
              {
                status: "CONTACT_RESOLUTION_FAILED_SAFE",
                company_qualification: qualification || eligibility?.snapshot,
                role_target: eligibility?.role_target,
                error_code: String(
                  error?.code || "CONTACT_RESOLUTION_FAILED",
                ).slice(0, 80),
              },
            ),
          },
        ).catch((updateError: any) =>
          safeBestEffort(updateError, {
            operation: "leadEnrichmentAgent",
            fallback: null,
            severity: "secondary",
          })
        );
      }
    }

    await service.entities.AgentTask.update(task.id, {
      status: reviewRequired ? "waiting_input" : "completed",
      output_summary:
        `Contact-last: resolved ${resolved}; no contact ${noContact}; blocked/skipped ${skipped}; review ${reviewRequired}; failed safely ${failed}`,
      output_payload_json: {
        count: leads.length,
        resolved,
        no_contact: noContact,
        skipped,
        failed,
        review_required: reviewRequired,
        provider_calls: providerCalls,
        blocked: blocked.slice(0, 50),
        daily_limit: configuredDailyLimit,
        weekly_limit: configuredWeeklyLimit,
        used_today_before: usedToday,
        used_this_week_before: usedThisWeek,
        daily_usage_coverage: dailyUsage,
        weekly_usage_coverage: weeklyUsage,
      },
      ...(reviewRequired ? { error: "CONTACT_GATE_REVIEW_REQUIRED" } : {}),
      completed_at: now(),
    });
    return Response.json({
      ok: reviewRequired === 0,
      task_id: task.id,
      count: leads.length,
      resolved,
      enriched: resolved,
      no_contact: noContact,
      skipped,
      failed,
      review_required: reviewRequired,
      provider_calls: providerCalls,
      resolved_ids: resolvedIds,
      blocked: blocked.slice(0, 50),
      contact_last: true,
      contact_calls_before_company_gate: 0,
      daily_usage_coverage: dailyUsage,
      weekly_usage_coverage: weeklyUsage,
      error: reviewRequired ? "CONTACT_GATE_REVIEW_REQUIRED" : undefined,
    }, { status: reviewRequired ? 409 : 200 });
  } catch (error: any) {
    if (task?.id) {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "failed",
        error: "lead_enrichment_failed",
        completed_at: now(),
      }).catch((updateError: any) =>
        safeBestEffort(updateError, {
          operation: "leadEnrichmentAgent",
          fallback: null,
          severity: "secondary",
        })
      );
    }
    console.error(
      "leadEnrichmentAgent failed",
      String(error?.message || error).slice(0, 160),
    );
    return Response.json({ ok: false, error: "lead_enrichment_failed" }, {
      status: 500,
    });
  }
});
