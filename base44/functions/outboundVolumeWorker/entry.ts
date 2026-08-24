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
import {
  chooseVariant,
  compactFacts,
  personalizationFacts,
} from "../../shared/outreachExperiment.ts";
import { canonicalMarket } from "../../shared/marketContext.ts";
import { callCambraClaude } from "../../shared/commercialModelRouter.ts";
import { sendingProfileIsValid } from "../../shared/commercialActivation.ts";
import { buildCommercialStrategy } from "../../shared/commercialStrategy.ts";
import { evaluateSuppressionLookup } from "../../shared/contactLast.ts";
import { validateDurableOutreachWorthySnapshot } from "../../shared/contactLast.ts";
import { verifyCommittedAdaptiveLeadDecisionProjection } from "../../shared/intelligenceFoundationContracts.ts";
import { readSingletonAuthority } from "../../shared/singletonAuthority.ts";
import { COMMUNICATION_TENANT_RESOLVER_VERSION } from "../../shared/communicationTenant.ts";
import { commercialMarketDecision } from "../../shared/marketLaunchScope.ts";
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
async function draft(
  svc: any,
  lead: any,
  lang: string,
  variant: any,
  eventKey: string,
) {
  const prompt = [
    "Write a deeply personalized CAMBRA B2B cold email using ONLY supplied verified facts. Max 85 words. Natural, specific, commercially intelligent, no hype, no fake person identity, no fabricated familiarity. Use at most 1-2 personalization signals and only when genuinely relevant; never force a detail. Do not state or imply known overpayment, fees, GMV, savings or PSP unless explicitly present in facts. Primary CTA: invite them naturally to run CAMBRA’s free Analyzer so they can see the payment-cost gap with their own numbers before discussing anything further. Keep it low-pressure and specific, not salesy. Plain opt-out sentence. Do NOT add a signature.",
    "APPROACH: " + String(variant?.instruction || ""),
    `Language: ${lang}`,
    "VERIFIED FACTS:",
    JSON.stringify(lead),
    'Return ONLY JSON {"subject":"","body":""}.',
  ].join("\n");
  const out = await callCambraClaude(prompt, {
    tier: "standard",
    maxTokens: 700,
    svc,
    eventKey,
    source: "outboundVolumeWorker",
  });
  const t = String(out.text || "").replace(/```json\s*/gi, "").replace(
    /```/g,
    "",
  ).trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (error) {
        safeBestEffort(error, {
          operation: "outboundVolumeWorker",
          fallback: null,
          severity: "critical",
        });
      }
    }
    return null;
  }
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
    __schedulerSvc = svc;
    __schedulerClaim = await claimSchedulerRun(svc, req, {
      worker_key: "outboundVolumeWorker",
      cadence_seconds: 3600,
    });
    { const denied = schedulerClaimDeniedResponse(__schedulerClaim); if (denied) return denied; }
    __schedulerClaim = await markSchedulerEffectStarted(svc, __schedulerClaim);
    { const denied = schedulerClaimDeniedResponse(__schedulerClaim); if (denied) return denied; }
    const controlAuthority = await readSingletonAuthority(svc, {
      entity: "OutboundControl",
      query: { control_key: "global" },
      sort: "-created_date",
      authority: "outbound_control",
    });
    if (!controlAuthority.ok) {
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
    if (!isBusinessHour(policy, new Date())) {
      return Response.json({
        ok: true,
        sent: 0,
        queued: 0,
        reason: "outside_business_hours_or_policy",
      });
    }
    let profile: any = null;
    for (const profileKey of policy.sending_profile_keys || []) {
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
        profile = candidate;
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
    const since = dayStart();
    const [already, policyAlready] = await Promise.all([
      strictRows(
        svc,
        "CommunicationMessage",
        {
          direction: "outbound",
          sending_profile_key: profile.profile_key,
          sent_at: { $gte: since },
        },
        "-sent_at",
        Math.max(2, Number(profile.current_daily_cap || 0) + 1),
        "sending_profile_daily_usage_lookup_unavailable",
      ),
      strictRows(
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
      ),
    ]);
    let remaining = Math.max(
      0,
      Math.min(
        Number(profile.current_daily_cap) - already.length,
        Number(policy.daily_send_limit) - policyAlready.length,
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
      Math.ceil(Number(profile.current_daily_cap || 15) / 11),
    );
    remaining = Math.min(remaining, tranche);
    const internal = Deno.env.get("INTERNAL_CALL_SECRET") ||
      ""; /* Discovery is intentionally NOT coupled to SEND. This worker consumes only the canonical READY_FOR_CONTACT reservoir after every eligibility gate has passed. */
    const merchants = mp
      ? await strictRows(
        svc,
        "OutboundLead",
        { reservoir_state: "ready" },
        "-score",
        Math.min(100, remaining * 4),
        "ready_outbound_reservoir_lookup_unavailable",
      )
      : [];
    const cohorts = await strictRows(
      svc,
      "AcquisitionLearningCohort",
      {},
      "-updated_at",
      500,
      "acquisition_learning_cohort_lookup_unavailable",
    );
    const cohortMap = new Map(cohorts.map((c: any) => [c.cohort_key, c]));
    const expStats = await strictRows(
      svc,
      "OutreachExperimentStats",
      { engine: "merchant_acquisition" },
      "-updated_at",
      50,
      "outreach_experiment_stats_lookup_unavailable",
    );
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
      const lang = strategy.language;
      const facts = compactFacts(personalizationFacts(x, "merchant"));
      const variant = chooseVariant(
        "merchant_acquisition",
        String(x.id),
        expStats,
      );
      const d = await draft(
        svc,
        facts,
        lang,
        variant,
        `volume:${x.id}:${policy.version}`,
      );
      if (!d?.subject || !d?.body) {
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
      const engine = "merchant_acquisition";
      const pol = mp;
      const thread = await svc.entities.CommunicationThread.create({
        thread_key: `volume:${item.kind}:${x.id}`,
        engine,
        related_entity_type: "OutboundLead",
        related_entity_id: x.id,
        lead_id: x.id,
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
        summary: `Volume ${item.kind} outreach`,
        sending_profile_key: profile.profile_key,
        market_jurisdiction: canonicalMarket(country)?.iso2 || "",
        experiment_key: "merchant-outreach-v1",
        experiment_variant: variant.key,
        personalization_json: {
          facts,
          variant_mode: variant.mode,
          commercial_strategy_id: strategy.id,
          commercial_strategy_version: strategy.strategy_version,
        },
      });
      const action = "initial_outreach";
      const next = new Date(
        Date.now() + Number(pol.followup_intervals_hours?.[0] || 72) * 3600000,
      ).toISOString();
      const rr = await svc.functions.invoke("commercialSendMessage", {
        thread_id: thread.id,
        action,
        classification: "initial_outreach",
        subject: sanitizeExternalText(d.subject, 300),
        text: sanitizeExternalText(d.body, 5000),
        agent_name: "outbound_volume_worker",
        idempotency_key: `volume:${item.kind}:${x.id}:${pol.version}`,
        sending_profile_key: profile.profile_key,
        next_action_at: next,
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
        await svc.entities.OutboundLead.update(x.id, {
          stage: "waiting_window",
          reservoir_state: "queued",
          next_action:
            "Queued with governed outbound provider; awaiting provider sent event",
          next_action_at: next,
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "outboundVolumeWorker",
            fallback: null,
            severity: "critical",
          })
        );
      } else {
        sent++;
        await svc.entities.OutboundLead.update(x.id, {
          stage: "contacted",
          revenue_stage: "contacted",
          next_action: `Await reply; follow-up due ${next}`,
          next_action_at: next,
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "outboundVolumeWorker",
            fallback: null,
            severity: "critical",
          })
        );
      }
    }
    return Response.json({
      ok: true,
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
