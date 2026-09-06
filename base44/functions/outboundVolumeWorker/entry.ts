import { safeBestEffort } from "../../shared/bestEffort.ts";
import {
  claimSchedulerRun,
  finishSchedulerRunOrThrow,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from "../../shared/schedulerRun.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  isBusinessHour,
  normalizeEmail,
  policyIsActive,
  sanitizeExternalText,
} from "../../shared/commercialAutonomy.ts";
import {
  cohortKey,
  learnedPriority,
} from "../../shared/acquisitionLearning.ts";
import { compactFacts, personalizationFacts } from "../../shared/outreachExperiment.ts";
import { canonicalMarket } from "../../shared/marketContext.ts";
import { sendingProfileIsValid } from "../../shared/commercialActivation.ts";
import { buildCommercialStrategy } from "../../shared/commercialStrategy.ts";
import { evaluateSuppressionLookup } from "../../shared/contactLast.ts";
import { validateDurableOutreachWorthySnapshot } from "../../shared/contactLast.ts";
import { verifyCommittedAdaptiveLeadDecisionProjection } from "../../shared/intelligenceFoundationContracts.ts";
import { readSingletonAuthority } from "../../shared/singletonAuthority.ts";
import { COMMUNICATION_TENANT_RESOLVER_VERSION } from "../../shared/communicationTenant.ts";
import { commercialMarketDecision } from "../../shared/marketLaunchScope.ts";
import {
  evaluateClaimsGate,
  extractVariables,
  resolveContentVariables,
} from "../../shared/campaignContentValidator.ts";
import { evaluatePermit } from "../../shared/founderPermitAuthority.ts";
import { sha256 } from "../../shared/intelligenceCore.ts";
function dayStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function relatedDomain(a: string, b: string) {
  const x = String(a || "").toLowerCase().replace(/\.$/, "");
  const y = String(b || "").toLowerCase().replace(/\.$/, "");
  return !!x && !!y && (x === y || x.endsWith("." + y) || y.endsWith("." + x));
}
async function strictOutboundSuppressionClear(svc: any, email: string) {
  let rows: unknown;
  try {
    rows = await svc.entities.ContactSuppression.filter(
      { email, active: true },
      "-created_date",
      2,
    );
  } catch (error: any) {
    rows = undefined;
    safeBestEffort(error, {
      operation: "outboundVolumeWorker.suppressionLookup",
      fallback: null,
      severity: "critical",
    });
  }
  return evaluateSuppressionLookup(email, rows);
}
async function strictRows(
  svc: any,
  entity: string,
  query: any,
  sort: string,
  limit: number,
  blocker: string,
) {
  try {
    const rows = await svc.entities[entity].filter(query, sort, limit);
    if (!Array.isArray(rows)) throw new Error(blocker);
    return rows;
  } catch (_) {
    throw Object.assign(new Error(blocker), {
      code: blocker.toUpperCase(),
      status: 409,
    });
  }
}
async function contactLastSendReady(svc: any, lead: any) {
  const qualification = lead?.source_evidence_json?.contact_last
    ?.company_qualification;
  const durable = validateDurableOutreachWorthySnapshot(lead, qualification);
  const projection = await verifyCommittedAdaptiveLeadDecisionProjection(
    svc,
    lead,
  );
  return {
    allowed: durable.allowed && projection.allowed,
    blockers: [...new Set([...durable.blockers, ...projection.blockers])],
  };
}
function updatedExactlyOne(result: any) {
  return Boolean(
    result &&
      (result.updated === 1 || result.modified_count === 1 ||
        result.matched_count === 1),
  );
}

async function strictGet(
  svc: any,
  entity: string,
  id: string,
  blocker: string,
) {
  if (!id) throw Object.assign(new Error(blocker), { code: blocker.toUpperCase(), status: 409 });
  try {
    const row = await svc.entities[entity].get(id);
    if (!row) throw new Error(blocker);
    return row;
  } catch (_) {
    throw Object.assign(new Error(blocker), {
      code: blocker.toUpperCase(),
      status: 409,
    });
  }
}

function sameStrings(left: unknown, right: unknown) {
  const sorted = (value: unknown) =>
    [...new Set((Array.isArray(value) ? value : []).map(String))].sort();
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function campaignBindingCurrent(input: any) {
  const { campaign, audience, content, sequence, policy, emergency, permit } = input;
  const binding = campaign?.approval_binding_json || {};
  const limits = binding.limits || {};
  const approvedAt = Date.parse(String(campaign?.approved_at || ""));
  const bindingExpiry = Date.parse(String(binding.expires_at || ""));
  const blockers = [
    !String(binding.approval_hash || "") ? "campaign_approval_hash_required" : "",
    !Number.isFinite(approvedAt) ? "campaign_approved_at_required" : "",
    !Number.isFinite(bindingExpiry) || approvedAt > bindingExpiry
      ? "campaign_approval_was_not_valid_when_granted"
      : "",
    String(binding.campaign_id || "") !== String(campaign?.id || "")
      ? "campaign_approval_campaign_mismatch"
      : "",
    String(binding.audience_content_hash || "") !== String(audience?.content_hash || "")
      ? "campaign_approval_audience_changed"
      : "",
    String(binding.content_hash || "") !== String(content?.content_hash || "")
      ? "campaign_approval_content_changed"
      : "",
    String(binding.sequence_hash || "") !== String(sequence?.sequence_hash || "")
      ? "campaign_approval_sequence_changed"
      : "",
    String(binding.policy_version || "") !== String(policy?.version || "")
      ? "campaign_approval_policy_changed"
      : "",
    !sameStrings(binding.market_scope, campaign?.market_scope)
      ? "campaign_approval_market_scope_changed"
      : "",
    !sameStrings(binding.sending_profile_keys, campaign?.sending_profile_keys)
      ? "campaign_approval_sender_scope_changed"
      : "",
    Number(limits.contact_limit) !== Number(campaign?.contact_limit)
      ? "campaign_approval_contact_limit_changed"
      : "",
    Number(limits.company_contact_limit) !== Number(campaign?.company_contact_limit)
      ? "campaign_approval_company_limit_changed"
      : "",
    Number(binding.budget_limit_minor) !== Number(campaign?.budget_limit_minor)
      ? "campaign_approval_budget_changed"
      : "",
    Number(binding.emergency_control_revision) !== Number(emergency?.control_revision)
      ? "campaign_approval_emergency_epoch_changed"
      : "",
    String(binding.permit_hash || "") !== String(permit?.permit_hash || "")
      ? "campaign_approval_permit_changed"
      : "",
  ].filter(Boolean);
  return { allowed: blockers.length === 0, blockers };
}

function renderCampaignContent(content: any, lead: any) {
  const firstName = String(lead?.contact_full_name || "").trim().split(/\s+/)[0] || "";
  const variables = extractVariables(content?.subject, content?.text_body);
  const resolution = resolveContentVariables({
    variables,
    schema: content?.variable_schema_json || {},
    values: {
      first_name: firstName,
      company_name: lead?.company_name || "",
      city: lead?.city || "",
      country: lead?.country || "",
      vertical: lead?.industry || lead?.vertical || "",
      detected_psp: lead?.probable_payment_stack || "",
      sender_name: "Xavi",
      analyzer_link: "https://cambra.global/Analyzer",
    },
  });
  if (resolution.blocked) return { ok: false, blockers: ["campaign_content_variables_unresolved"] };
  const render = (template: unknown) => {
    let value = String(template || "");
    for (const [name, replacement] of Object.entries(resolution.resolved)) {
      value = value.replaceAll(
        new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi"),
        String(replacement),
      );
    }
    return value;
  };
  const subject = render(content?.subject);
  const body = render(content?.text_body);
  const claims = evaluateClaimsGate({ body, subject_id: String(lead?.id || ""), evidence: [] });
  if (!claims.passed) return { ok: false, blockers: ["campaign_content_claim_blocked"] };
  return { ok: Boolean(subject.trim() && body.trim()), subject, body, blockers: [] };
}

function nextCampaignActionAt(sequence: any) {
  const followUp = (Array.isArray(sequence?.steps_json) ? sequence.steps_json : [])
    .filter((step: any) => Number(step?.ordinal) > 1)
    .sort((left: any, right: any) => Number(left.ordinal) - Number(right.ordinal))[0];
  if (!followUp) return null;
  const amount = Math.max(1, Number(followUp.delay_amount || 1));
  const unit = String(followUp.delay_unit || "HOURS").toUpperCase();
  const hours = unit === "HOURS" ? amount : amount * 24;
  return new Date(Date.now() + hours * 3600000).toISOString();
}
Deno.serve(async (req) => {
  let __schedulerSvc: any = null;
  let __schedulerClaim: any = null;
  let __schedulerOk = true;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) {
      return gate.response ||
        Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const svc = base44.asServiceRole;
    __schedulerSvc = svc;
    __schedulerClaim = await claimSchedulerRun(svc, req, {
      worker_key: "outboundVolumeWorker",
      cadence_seconds: 3600,
    });
    { const denied = schedulerClaimDeniedResponse(__schedulerClaim); if (denied) return denied; }
    const controlAuthority = await readSingletonAuthority(svc, {
      entity: "OutboundControl",
      query: { control_key: "global" },
      sort: "-created_date",
      authority: "outbound_control",
    });
    if (!controlAuthority.ok) {
      __schedulerOk = false;
      return Response.json({
        ok: false,
        sent: 0,
        queued: 0,
        reason: controlAuthority.blocker ||
          "outbound_control_authority_unavailable",
      }, { status: 409 });
    }
    const control = controlAuthority.row;
    if (!control?.acquisition_enabled) {
      return Response.json({
        ok: true,
        sent: 0,
        queued: 0,
        reason: "volume_outbound_paused",
      });
    }
    let policyRows: any = null;
    try {
      policyRows = await svc.entities.CommercialPolicy.filter(
        { engine: "merchant_acquisition", status: "active" },
        "-approved_at",
        10,
      );
    } catch (error: any) {
      safeBestEffort(error, {
        operation: "outboundVolumeWorker.policyLookup",
        fallback: null,
        severity: "critical",
      });
    }
    const activePolicies = Array.isArray(policyRows)
      ? policyRows.filter((p: any) => policyIsActive(p))
      : [];
    if (activePolicies.length !== 1) {
      __schedulerOk = false;
      return Response.json({
        ok: false,
        sent: 0,
        queued: 0,
        reason: Array.isArray(policyRows)
          ? activePolicies.length > 1
            ? "ambiguous_active_commercial_policies"
            : "exactly_one_active_commercial_policy_required"
          : "commercial_policy_lookup_unavailable",
        active_policy_count: activePolicies.length,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const mp = activePolicies[0];
    const policy = mp;
    const policyMarketDecisions = (
      Array.isArray(policy.countries) ? policy.countries : []
    ).map((value: any) => commercialMarketDecision(value));
    const blockedPolicyMarket = policyMarketDecisions.find(
      (decision: any) => !decision.ok,
    ) || null;
    if (!policyMarketDecisions.length || blockedPolicyMarket) {
      __schedulerOk = false;
      return Response.json({
        ok: false,
        sent: 0,
        queued: 0,
        reason: blockedPolicyMarket?.error ||
          "commercial_policy_market_scope_required",
        blocked_reason: blockedPolicyMarket?.blocked_reason ||
          "commercial_policy_market_scope_required",
        market: blockedPolicyMarket?.iso2 || null,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const allowedPolicyMarkets = new Set(
      policyMarketDecisions.map((decision: any) => decision.iso2),
    );
    const campaignRows = await strictRows(
      svc,
      "CommercialCampaign",
      { status: { $in: ["APPROVED", "RUNNING"] } },
      "-approved_at",
      10,
      "approved_campaign_lookup_unavailable",
    );
    const matchingCampaigns = campaignRows.filter((campaign: any) =>
      String(campaign.target_profile_id || "") === String(policy.id || "") &&
      String(campaign.policy_key || "") === String(policy.policy_key || "") &&
      String(campaign.policy_version || "") === String(policy.version || "")
    );
    if (matchingCampaigns.length !== 1) {
      __schedulerOk = false;
      return Response.json({
        ok: false,
        sent: 0,
        queued: 0,
        reason: matchingCampaigns.length > 1
          ? "ambiguous_approved_campaigns_for_policy"
          : "approved_campaign_for_policy_required",
        approved_campaign_count: matchingCampaigns.length,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const campaign = matchingCampaigns[0];
    const campaignLimit = Number(campaign.contact_limit);
    if (!Number.isInteger(campaignLimit) || campaignLimit < 1 || campaignLimit > 50) {
      __schedulerOk = false;
      return Response.json({
        ok: false,
        sent: 0,
        queued: 0,
        reason: "approved_campaign_contact_limit_must_be_1_to_50",
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const [audience, content, sequence, permit] = await Promise.all([
      strictGet(svc, "CampaignAudienceVersion", String(campaign.audience_current_version_id || ""), "approved_campaign_audience_required"),
      strictGet(svc, "CampaignContentVersion", String(campaign.content_current_version_id || ""), "approved_campaign_content_required"),
      strictGet(svc, "CampaignSequenceVersion", String(campaign.sequence_current_version_id || ""), "approved_campaign_sequence_required"),
      strictGet(svc, "FounderPermit", String(campaign.founder_permit_id || ""), "approved_campaign_permit_required"),
    ]);
    const emergencyAuthority = await readSingletonAuthority(svc, {
      entity: "EmergencyControl",
      query: { control_key: "global" },
      sort: "-updated_at",
      authority: "emergency_control",
    });
    if (!emergencyAuthority.ok) {
      __schedulerOk = false;
      return Response.json({ ok: false, sent: 0, queued: 0, reason: emergencyAuthority.blocker || "emergency_control_authority_unavailable" }, { status: 409 });
    }
    const emergency = emergencyAuthority.row;
    const binding = campaignBindingCurrent({ campaign, audience, content, sequence, policy, emergency, permit });
    if (!binding.allowed || String(audience.status) !== "FROZEN" || String(content.status) !== "VALIDATED" || String(sequence.status) !== "VALIDATED") {
      __schedulerOk = false;
      return Response.json({
        ok: false,
        sent: 0,
        queued: 0,
        reason: "approved_campaign_binding_changed",
        blockers: [
          ...binding.blockers,
          ...(String(audience.status) === "FROZEN" ? [] : ["campaign_audience_not_frozen"]),
          ...(String(content.status) === "VALIDATED" ? [] : ["campaign_content_not_validated"]),
          ...(String(sequence.status) === "VALIDATED" ? [] : ["campaign_sequence_not_validated"]),
        ],
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    for (const market of campaign.market_scope || []) {
      const permitCheck = evaluatePermit({
        permit,
        now: new Date().toISOString(),
        presented_permit_hash: campaign.approval_binding_json?.permit_hash,
        request: {
          domain: "campaign",
          tool_id: "cambra.campaign.send",
          read_or_write: "WRITE",
          effect_class: "external_message",
          entity_type: "CommercialCampaign",
          entity_id: campaign.id,
          actor: "outbound_volume_worker",
          tenant: "platform",
          market,
          environment: "production",
          external_messages: 0,
        },
        controls: {
          emergency,
          emergencyAvailable: true,
          suppressionAvailable: true,
          recipient_suppressed: false,
          tenant_matches: true,
          exposes_secret: false,
          market_commercially_eligible: commercialMarketDecision(market).ok,
          legal_block: false,
        },
      });
      if (!permitCheck.allowed) {
        __schedulerOk = false;
        return Response.json({ ok: false, sent: 0, queued: 0, reason: "campaign_permit_not_valid", blockers: permitCheck.blockers }, { status: 409 });
      }
    }
    if (!isBusinessHour(policy, new Date())) {
      return Response.json({
        ok: true,
        sent: 0,
        queued: 0,
        reason: "outside_business_hours_or_policy",
      });
    }
    const since = dayStart();
    const campaignThreads = await strictRows(
      svc,
      "CommunicationThread",
      { campaign_id: campaign.id },
      "-created_date",
      campaignLimit + 1,
      "campaign_contact_usage_lookup_unavailable",
    );
    const campaignRemaining = Math.max(0, campaignLimit - campaignThreads.length);
    if (!campaignRemaining) {
      await svc.entities.CommercialCampaign.update(campaign.id, {
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, sent: 0, queued: 0, reason: "campaign_contact_limit", campaign_id: campaign.id });
    }
    const policyAlready = await strictRows(
      svc,
      "CommunicationMessage",
      {
        direction: "outbound",
        policy_key: policy.policy_key,
        policy_version: policy.version,
        sent_at: { $gte: since },
      },
      "-sent_at",
      Math.max(2, Number(policy.daily_send_limit || 0) + 1),
      "commercial_policy_daily_usage_lookup_unavailable",
    );
    const campaignProfileKeys = new Set(
      (Array.isArray(campaign.sending_profile_keys) ? campaign.sending_profile_keys : []).map(String),
    );
    let profile: any = null;
    let already: any[] = [];
    for (const profileKey of policy.sending_profile_keys || []) {
      if (!campaignProfileKeys.has(String(profileKey))) continue;
      const rows = await strictRows(
        svc,
        "OutboundSendingProfile",
        { profile_key: profileKey },
        "-created_date",
        2,
        "sending_profile_lookup_unavailable",
      );
      if (rows.length > 1) {
        return Response.json({
          ok: false,
          sent: 0,
          queued: 0,
          reason: "sending_profile_lookup_ambiguous",
        }, { status: 409 });
      }
      const candidate = rows[0];
      const enabled = candidate?.provider === "resend"
        ? control.volume_resend_enabled === true
        : candidate?.provider === "instantly"
        ? control.instantly_enabled === true
        : candidate?.provider === "outlook"
        ? control.premium_outlook_enabled === true
        : false;
      if (enabled && sendingProfileIsValid(candidate)) {
        const usage = await strictRows(
          svc,
          "CommunicationMessage",
          {
            direction: "outbound",
            sending_profile_key: candidate.profile_key,
            sent_at: { $gte: since },
          },
          "-sent_at",
          Math.max(2, Number(candidate.current_daily_cap || 0) + 1),
          "sending_profile_daily_usage_lookup_unavailable",
        );
        if (usage.length >= Number(candidate.current_daily_cap || 0)) continue;
        profile = candidate;
        already = usage;
        break;
      }
    }
    if (!profile) {
      return Response.json({
        ok: true,
        sent: 0,
        queued: 0,
        reason: "merchant_policy_enabled_transport_profile_missing",
      });
    }
    let remaining = Math.max(
      0,
      Math.min(
        Number(profile.current_daily_cap) - already.length,
        Number(policy.daily_send_limit) - policyAlready.length,
        campaignRemaining,
      ),
    );
    if (!remaining) {
      return Response.json({
        ok: true,
        sent: 0,
        queued: 0,
        reason: "profile_or_policy_daily_cap",
      });
    }
    const tranche = Math.max(
      1,
      Math.ceil(Number(policy.daily_send_limit || 15) / 8),
    );
    remaining = Math.min(remaining, tranche);
    const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";
    const audienceLeadIds = [...new Set(
      (Array.isArray(audience.canonical_subject_ids) ? audience.canonical_subject_ids : []).map(String),
    )].slice(0, 1000);
    if (!audienceLeadIds.length) {
      __schedulerOk = false;
      return Response.json({ ok: false, sent: 0, queued: 0, reason: "frozen_campaign_audience_is_empty" }, { status: 409 });
    }
    const merchants = await strictRows(
      svc,
      "OutboundLead",
      { id: { $in: audienceLeadIds }, reservoir_state: "ready" },
      "-score",
      Math.min(1000, Math.max(100, remaining * 8)),
      "ready_campaign_audience_lookup_unavailable",
    );
    const cohorts = await strictRows(
      svc,
      "AcquisitionLearningCohort",
      {},
      "-updated_at",
      500,
      "acquisition_learning_cohort_lookup_unavailable",
    );
    const cohortMap = new Map(cohorts.map((c: any) => [c.cohort_key, c]));
    const queue = [...merchants.map((x: any) => ({
      kind: "merchant",
      x,
      score: Number(x.score || 0),
      opportunity: Number(
        x.score_breakdown_json?.opportunity_score || x.score || 0,
      ),
      confidence: Number(x.score_breakdown_json?.evidence_confidence || 0),
      priority: learnedPriority(
        Number(x.score_breakdown_json?.opportunity_score || x.score || 0),
        Number(x.score_breakdown_json?.evidence_confidence || 0),
        cohortMap.get(cohortKey(x)),
      ),
    }))].sort((a, b) => b.priority - a.priority);
    const priorContacted = await strictRows(
      svc,
      "OutboundLead",
      { stage: { $in: ["contacted", "meeting", "won"] } },
      "-created_date",
      1000,
      "prior_contact_history_lookup_unavailable",
    );
    const contactedDomains = new Set(
      priorContacted.map((l: any) =>
        String(l.company_domain || "").replace(/^https?:\/\//, "").replace(
          /^www\./,
          "",
        ).split("/")[0].toLowerCase()
      ).filter(Boolean),
    );
    const seenCompanies = new Set<string>();
    let sent = 0, queued = 0, skipped = 0;
    if (queue.length > 0) {
      __schedulerClaim = await markSchedulerEffectStarted(svc, __schedulerClaim);
      { const denied = schedulerClaimDeniedResponse(__schedulerClaim); if (denied) return denied; }
    }
    for (const item of queue) {
      if (sent + queued >= remaining) break;
      const x = item.x;
      const email = normalizeEmail(x.contact_email);
      if (
        !email || x.outreach_eligibility !== "ELIGIBLE" ||
        x.compliance_status !== "CLEARED" ||
        x.contactability !== "PROFESSIONAL_VERIFIED" ||
        x.revenue_stage !== "outreach_ready"
      ) {
        skipped++;
        continue;
      }
      const marketDecision = commercialMarketDecision(x.country);
      if (!marketDecision.ok || !allowedPolicyMarkets.has(marketDecision.iso2)) {
        skipped++;
        continue;
      }
      const initialSuppression = await strictOutboundSuppressionClear(
        svc,
        email,
      );
      if (!initialSuppression.allowed) {
        skipped++;
        continue;
      }
      if (
        item.kind === "merchant" &&
        Number(x.score || 0) < Number(mp.min_lead_score || 70)
      ) {
        skipped++;
        continue;
      }
      const corporateDomain = String(x.company_domain || "").replace(
        /^https?:\/\//,
        "",
      ).replace(/^www\./, "").split("/")[0].toLowerCase();
      if (
        seenCompanies.has(corporateDomain) ||
        contactedDomains.has(corporateDomain)
      ) {
        skipped++;
        continue;
      }
      seenCompanies.add(corporateDomain);
      const emailDomain = email.split("@")[1] || "";
      if (!relatedDomain(emailDomain, corporateDomain)) {
        skipped++;
        continue;
      }
      const bd = x.score_breakdown_json?.breakdown || {};
      if (
        Number(bd.commerce_fit || 0) < 10 ||
        Number(bd.economic_potential || 0) < 8 ||
        Number(x.score_breakdown_json?.evidence_confidence || 0) < 0.55
      ) {
        skipped++;
        continue;
      }
      const initialContactGate = await contactLastSendReady(svc, x);
      if (!initialContactGate.allowed) {
        skipped++;
        continue;
      }
      let existing: any[];
      try {
        existing = await strictRows(
          svc,
          "CommunicationThread",
          { engine: "merchant_acquisition", counterparty_email: email },
          "-created_date",
          2,
          "commercial_thread_lookup_unavailable",
        );
      } catch (_) {
        // An unavailable negative lookup is never permission to create a new
        // canonical thread.
        skipped++;
        continue;
      }
      if (existing.length) {
        skipped++;
        continue;
      }
      const strategyValue = buildCommercialStrategy(x, policy, {
        suppressed: false,
      });
      if (strategyValue.status !== "READY") {
        skipped++;
        continue;
      }
      let priorStrategies: any[];
      try {
        priorStrategies = await strictRows(
          svc,
          "CommercialStrategy",
          { strategy_key: strategyValue.strategy_key },
          "-created_at",
          2,
          "commercial_strategy_lookup_unavailable",
        );
      } catch (_) {
        skipped++;
        continue;
      }
      if (priorStrategies.length > 1) {
        skipped++;
        continue;
      }
      const strategy = priorStrategies[0] ||
        await svc.entities.CommercialStrategy.create({
          ...strategyValue,
          created_at: new Date().toISOString(),
          created_by: "outbound_volume_worker",
        });
      const country = String(marketDecision.iso2 || "");
      const lang = String(content.language || strategy.language || "en");
      const facts = compactFacts(personalizationFacts(x, "merchant"));
      const rendered = renderCampaignContent(content, x);
      if (!rendered.ok) {
        skipped++;
        continue;
      }
      const finalSuppression = await strictOutboundSuppressionClear(svc, email);
      let finalLead: any = null;
      try {
        finalLead = await svc.entities.OutboundLead.get(String(x.id));
      } catch (_) {
        finalLead = null;
      }
      const finalContactGate = finalLead
        ? await contactLastSendReady(svc, finalLead)
        : { allowed: false, blockers: ["outbound_lead_lookup_unavailable"] };
      if (
        !finalSuppression.allowed || !finalContactGate.allowed ||
        normalizeEmail(finalLead?.contact_email) !== email ||
        String(finalLead?.canonical_company_key || "") !==
          String(x.canonical_company_key || "")
      ) {
        skipped++;
        continue;
      }
      // Re-read canonical thread absence immediately before create. Failure or
      // ambiguity produces no thread and therefore no send.
      let finalExisting: any[];
      try {
        finalExisting = await strictRows(
          svc,
          "CommunicationThread",
          { engine: "merchant_acquisition", counterparty_email: email },
          "-created_date",
          2,
          "commercial_thread_lookup_unavailable_before_create",
        );
      } catch (_) {
        skipped++;
        continue;
      }
      if (finalExisting.length) {
        skipped++;
        continue;
      }
      const existingEnrollments = await strictRows(
        svc,
        "CampaignEnrollment",
        { campaign_id: campaign.id, lead_id: x.id },
        "-updated_at",
        2,
        "campaign_enrollment_lookup_unavailable",
      );
      if (existingEnrollments.length) {
        skipped++;
        continue;
      }
      const freshEmergencyAuthority = await readSingletonAuthority(svc, {
        entity: "EmergencyControl",
        query: { control_key: "global" },
        sort: "-updated_at",
        authority: "emergency_control",
      });
      const freshEmergency = freshEmergencyAuthority.ok
        ? freshEmergencyAuthority.row
        : null;
      const permitCheck = evaluatePermit({
        permit,
        now: new Date().toISOString(),
        presented_permit_hash: campaign.approval_binding_json?.permit_hash,
        request: {
          domain: "campaign",
          tool_id: "cambra.campaign.send",
          read_or_write: "WRITE",
          effect_class: "external_message",
          entity_type: "CommercialCampaign",
          entity_id: campaign.id,
          actor: "outbound_volume_worker",
          tenant: "platform",
          market: country,
          environment: "production",
          records_affected: 1,
          external_messages: 1,
        },
        controls: {
          emergency: freshEmergency,
          emergencyAvailable: freshEmergencyAuthority.ok,
          suppressionAvailable: true,
          recipient_suppressed: !finalSuppression.allowed,
          tenant_matches: true,
          exposes_secret: false,
          market_commercially_eligible: marketDecision.ok,
          legal_block: false,
        },
      });
      if (!permitCheck.allowed) {
        skipped++;
        continue;
      }
      const permitRevision = Number(permit.consumption_revision || 0);
      const permitMessages = Number(permit.consumed_external_messages || 0);
      const permitRecords = Number(permit.consumed_records_affected || 0);
      const permitClaim = await svc.entities.FounderPermit.updateMany(
        {
          id: permit.id,
          status: "ACTIVE",
          permit_hash: permit.permit_hash,
          consumption_revision: permitRevision,
        },
        { $set: {
          consumed_external_messages: permitMessages + 1,
          consumed_records_affected: permitRecords + 1,
          consumption_revision: permitRevision + 1,
          updated_at: new Date().toISOString(),
        } },
      ).catch((error: any) => safeBestEffort(error, {
        operation: "outboundVolumeWorker.claimPermitMessage",
        fallback: null,
        severity: "critical",
      }));
      if (!updatedExactlyOne(permitClaim)) {
        skipped++;
        continue;
      }
      permit.consumed_external_messages = permitMessages + 1;
      permit.consumed_records_affected = permitRecords + 1;
      permit.consumption_revision = permitRevision + 1;
      const emailHash = await sha256(email);
      const enrollment = await svc.entities.CampaignEnrollment.create({
        enrollment_key: `${campaign.id}:${audience.id}:${emailHash}`,
        campaign_id: campaign.id,
        audience_version_id: audience.id,
        lane: campaign.lane,
        objective_type: campaign.objective_type,
        subject_type: "OutboundLead",
        subject_id: x.id,
        lead_id: x.id,
        company_key: x.canonical_company_key || corporateDomain,
        company_name: x.company_name || "",
        contact_id: x.contact_id || x.id,
        email_normalized: email,
        email_hash: emailHash,
        market: country,
        city: x.city || "",
        language: lang,
        eligibility_status: "ELIGIBLE",
        company_contact_rank: 1,
        content_version_id: content.id,
        sequence_version_id: sequence.id,
        current_step: 0,
        sending_profile_key: profile.profile_key,
        operation_key: `campaign-send:${campaign.id}:${x.id}:1`,
        effect_key: `campaign-effect:${campaign.id}:${x.id}:1`,
        state: "CLAIMED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        revision: 1,
      });
      const engine = "merchant_acquisition";
      const pol = mp;
      const thread = await svc.entities.CommunicationThread.create({
        thread_key: `campaign:${campaign.id}:${x.id}`,
        engine,
        related_entity_type: "OutboundLead",
        related_entity_id: x.id,
        lead_id: x.id,
        campaign_id: campaign.id,
        enrollment_id: enrollment.id,
        tenant_scope: "platform",
        brand_id: "_platform",
        tenant_resolution_status: "RESOLVED",
        tenant_resolution_reason: "platform_acquisition_or_aggregate_scope",
        tenant_resolver_version: COMMUNICATION_TENANT_RESOLVER_VERSION,
        tenant_resolved_at: new Date().toISOString(),
        counterparty_email: email,
        counterparty_name: x.contact_full_name || "",
        counterparty_role: x.contact_title || "",
        company_name: x.company_name || "",
        language: lang,
        status: "open",
        policy_key: pol.policy_key,
        policy_version: pol.version,
        automation_paused: false,
        summary: `${campaign.name} outreach`,
        sending_profile_key: profile.profile_key,
        market_jurisdiction: canonicalMarket(country)?.iso2 || "",
        experiment_key: `campaign:${campaign.id}`,
        experiment_variant: `content-v${content.version}`,
        personalization_json: {
          facts,
          campaign_id: campaign.id,
          campaign_content_version_id: content.id,
          campaign_sequence_version_id: sequence.id,
          commercial_strategy_id: strategy.id,
          commercial_strategy_version: strategy.strategy_version,
        },
      });
      const action = "initial_outreach";
      const next = nextCampaignActionAt(sequence);
      const rr = await svc.functions.invoke("commercialSendMessage", {
        thread_id: thread.id,
        action,
        classification: "initial_outreach",
        subject: sanitizeExternalText(rendered.subject, 300),
        text: sanitizeExternalText(rendered.body, 5000),
        agent_name: "outbound_volume_worker",
        idempotency_key: `campaign:${campaign.id}:${x.id}:1`,
        sending_profile_key: profile.profile_key,
        ...(next ? { next_action_at: next } : {}),
        internal_secret: internal,
      }).catch((e: any) => ({
        data: { ok: false, error: String(e?.message || e) },
      }));
      const rd = rr?.data || rr || {};
      if (rd.ok === false) {
        await svc.entities.CommunicationThread.update(thread.id, {
          automation_paused: true,
          pause_reason: rd.error || "send_failed",
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "outboundVolumeWorker",
            fallback: null,
            severity: "critical",
          })
        );
        await svc.entities.CampaignEnrollment.update(enrollment.id, {
          state: "REVIEW_REQUIRED",
          thread_id: thread.id,
          stop_reason: rd.error || "send_failed",
          updated_at: new Date().toISOString(),
          revision: 2,
        }).catch((error: any) => safeBestEffort(error, {
          operation: "outboundVolumeWorker.updateFailedEnrollment",
          fallback: null,
          severity: "critical",
        }));
        skipped++;
        continue;
      }
      contactedDomains.add(corporateDomain);
      await svc.entities.CommercialStrategy.update(strategy.id, {
        status: "EXECUTED",
        executed_at: new Date().toISOString(),
        thread_id: thread.id,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "outboundVolumeWorker",
          fallback: null,
          severity: "critical",
        })
      );
      if (rd.queued) {
        queued++;
        await svc.entities.CampaignEnrollment.update(enrollment.id, {
          state: "QUEUED",
          thread_id: thread.id,
          current_step: 1,
          ...(next ? { next_action_at: next } : {}),
          provider_refs_json: { provider: profile.provider, campaign_id: profile.external_campaign_id || null },
          updated_at: new Date().toISOString(),
          revision: 2,
        });
        await svc.entities.OutboundLead.update(x.id, {
          stage: "waiting_window",
          reservoir_state: "queued",
          next_action:
            "Queued with governed outbound provider; awaiting provider sent event",
          ...(next ? { next_action_at: next } : {}),
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "outboundVolumeWorker",
            fallback: null,
            severity: "critical",
          })
        );
      } else {
        sent++;
        await svc.entities.CampaignEnrollment.update(enrollment.id, {
          state: "PROVIDER_ACCEPTED",
          thread_id: thread.id,
          current_step: 1,
          ...(next ? { next_action_at: next } : {}),
          provider_refs_json: { provider: profile.provider, message_id: rd.message_id || rd.external_message_id || null },
          updated_at: new Date().toISOString(),
          revision: 2,
        });
        await svc.entities.OutboundLead.update(x.id, {
          stage: "contacted",
          revenue_stage: "contacted",
          next_action: next ? `Await reply; follow-up due ${next}` : "Await reply; no follow-up scheduled",
          ...(next ? { next_action_at: next } : {}),
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "outboundVolumeWorker",
            fallback: null,
            severity: "critical",
          })
        );
      }
    }
    if (sent + queued > 0) {
      const previousMetrics = campaign.metrics_json || {};
      await svc.entities.CommercialCampaign.update(campaign.id, {
        status: "RUNNING",
        launched_at: campaign.launched_at || new Date().toISOString(),
        metrics_json: {
          ...previousMetrics,
          selected_leads: Number(previousMetrics.selected_leads || audience.final_eligible_count || 0),
          provider_accepted: Number(previousMetrics.provider_accepted || 0) + sent + queued,
          sent: Number(previousMetrics.sent || 0) + sent,
          queued: Number(previousMetrics.queued || 0) + queued,
        },
        updated_at: new Date().toISOString(),
      });
    }
    return Response.json({
      ok: true,
      campaign_id: campaign.id,
      sent,
      queued,
      skipped,
      tranche,
      provider: profile.provider,
      cap: profile.current_daily_cap,
      policy_limit: policy.daily_send_limit,
      remaining_after: Math.max(
        0,
        Math.min(
          Number(profile.current_daily_cap) - already.length - sent - queued,
          Number(policy.daily_send_limit) - policyAlready.length - sent -
            queued,
          campaignRemaining - sent - queued,
        ),
      ),
    });
  } catch (e: any) {
    __schedulerOk = false;
    console.error("outboundVolumeWorker failed", e);
    // AUDIT SEC-07 (2026-08-17): bounded error CODE only, never raw e.message.
    return Response.json(
      {
        ok: false,
        error: String(e?.code || "outbound_volume_worker_failed").slice(0, 80),
        sent: 0,
        queued: 0,
        material_effects_fail_closed: true,
      },
      { status: Number(e?.status || 500) },
    );
  } finally {
    if (__schedulerSvc && __schedulerClaim?.allowed === true) {
      await finishSchedulerRunOrThrow(__schedulerSvc, __schedulerClaim, {
        worker_key: "outboundVolumeWorker",
      }, __schedulerOk);
    }
  }
});
