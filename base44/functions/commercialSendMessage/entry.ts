import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  automaticSendGovernorDecision,
  commercialTimezone,
  communicationQuality,
  isBusinessHour,
  normalizeEmail,
  policyIsActive,
  routineActionAllowed,
  sanitizeExternalText,
} from "../../shared/commercialAutonomy.ts";
import {
  assertEmergencyEpochUnchanged,
  captureEmergencyEpoch,
  containCommunicationTransport,
  emergencyState,
  extendEmergencyEpoch,
  inheritEmergencyEpoch,
} from "../../shared/operationalControl.ts";
import { pauseAllInstantlyCampaigns } from "../../shared/instantlyRuntime.ts";
import { assertMarketCapabilityAllowed } from "../../shared/marketPolicyRuntime.ts";
import { authorityForAgent } from "../../shared/agentAuthority.ts";
import {
  commercialLegalAction,
  enforceLegalExecution,
  legalBlockResponse,
} from "../../shared/legalExecutionRuntime.ts";
import { canonicalMarket } from "../../shared/marketContext.ts";
import { acquisitionEngine } from "../../shared/commercialActivation.ts";
import {
  reservePaidOperation,
  settlePaidOperation,
} from "../../shared/costGovernance.ts";
import {
  InstantlyOutboundProvider,
  instantlyProfileReady,
} from "../../shared/outboundProvider.ts";
import { readSingletonAuthority } from "../../shared/singletonAuthority.ts";
import {
  claimCommercialSendSlot,
  commercialEmailProviderCapability,
  commitCommercialSendSlot,
  executeOutlookAcceptedTransport,
  markCommercialSendReviewRequired,
  markCommercialSendTransportStarted,
  paidReservationTransportDecision,
  readCommercialSendIdempotency,
  readCommercialSuppression,
  readExactCommercialPolicy,
  readPaidSendReservation,
  requireResendIdempotencyKey,
  rollbackCommercialSendSlot,
} from "../../shared/commercialSendSafety.ts";
import { verifyCommittedAdaptiveLeadDecisionProjection } from "../../shared/intelligenceFoundationContracts.ts";
import { validateDurableOutreachWorthySnapshot } from "../../shared/contactLast.ts";
import {
  observeServiceLevelRequest,
  serviceLevelResult,
} from "../../shared/serviceLevelObservation.ts";
import {
  ensureCommunicationThreadTenantBinding,
  verifyCommunicationThreadTenantBinding,
} from "../../shared/communicationTenant.ts";
import type { CommunicationThreadTenantAuthority } from "../../shared/communicationTenant.ts";
import {
  effectAuthorityErrorResponse,
  requireEffectAuthorities,
} from "../../shared/effectAuthority.ts";

const CAMBRA_LOGO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d62c05e68_c-mark-voltio2x.png";
const CAMBRA_WEB = "https://www.cambra.global";
function signatureIdentity(
  provider: string,
  engine: string,
  configuredEmail = "",
) {
  const email = normalizeEmail(configuredEmail);
  if (provider === "outlook") {
    return { name: "CAMBRA", title: "Founder Office", email };
  }
  if (["provider_negotiation", "aggregate_procurement"].includes(engine)) {
    return {
      name: "CAMBRA Operations",
      title: "Infrastructure Operations",
      email,
    };
  }
  return {
    name: "CAMBRA Payments",
    title: "Infrastructure Intelligence",
    email,
  };
}
function cambraSignature(provider: string, engine: string, email: string) {
  const i = signatureIdentity(provider, engine, email);
  return [
    i.name,
    i.title,
    i.email ? `Mail: ${i.email}` : null,
    "Web: www.cambra.global",
  ].filter(Boolean).join("\n");
}
function ensureSignature(text: string, signature: string) {
  const t = String(text || "").trimEnd();
  if (t.includes(signature)) return t;
  return `${t}\n\n${signature}`;
}
function escapeHtml(v: string) {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(
    />/g,
    "&gt;",
  ).replace(/"/g, "&quot;");
}
function signedHtml(
  text: string,
  provider: string,
  engine: string,
  email: string,
) {
  const i = signatureIdentity(provider, engine, email);
  const body = escapeHtml(String(text || "").trim()).replace(/\n/g, "<br>");
  const mail = i.email
    ? `<br>Mail: <a href="mailto:${
      escapeHtml(i.email)
    }" style="color:#171717;text-decoration:none">${escapeHtml(i.email)}</a>`
    : "";
  return `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#171717">${body}<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-collapse:collapse"><tr><td style="padding-right:12px;vertical-align:top"><img src="${CAMBRA_LOGO}" width="38" height="38" alt="CAMBRA" style="display:block;border:0;width:38px;height:38px"></td><td style="vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#555"><strong style="font-size:13px;color:#171717">${
    escapeHtml(i.name)
  }</strong><br>${
    escapeHtml(i.title)
  }${mail}<br>Web: <a href="${CAMBRA_WEB}" style="color:#171717;text-decoration:none">www.cambra.global</a></td></tr></table></div></body></html>`;
}
function mailboxFromSetting(value: string) {
  const match = String(value || "").match(/<([^>]+)>/);
  return normalizeEmail(match?.[1] || value);
}
function approvalBoundToThread(approval: any, thread: any) {
  const payload = approval?.draft_payload_json || {};
  const threadBindings = new Set(
    [thread?.id, thread?.related_entity_id, thread?.lead_id, thread?.recover_id]
      .map(String).filter(Boolean),
  );
  const approvalBindings = [
    approval?.related_entity_id,
    payload?.thread_id,
    payload?.communication_thread_id,
    payload?.related_entity_id,
  ].map(String).filter(Boolean);
  return approvalBindings.some((id: string) => threadBindings.has(id));
}
async function strictMessageRows(
  svc: any,
  query: any,
  sort: string,
  limit: number,
  blocker: string,
) {
  try {
    const rows = await svc.entities.CommunicationMessage.filter(
      query,
      sort,
      limit,
    );
    if (!Array.isArray(rows)) throw new Error(blocker);
    return rows;
  } catch {
    throw Object.assign(new Error(blocker), {
      status: 409,
      code: blocker.toUpperCase(),
    });
  }
}
async function strictSendingProfile(svc: any, profileKey: string) {
  if (!profileKey) return null;
  let rows: any;
  try {
    rows = await svc.entities.OutboundSendingProfile.filter(
      { profile_key: profileKey },
      "-created_date",
      2,
    );
  } catch {
    return { error: "sending_profile_lookup_unavailable" };
  }
  if (!Array.isArray(rows)) {
    return { error: "sending_profile_lookup_unavailable" };
  }
  if (rows.length !== 1) {
    return {
      error: rows.length
        ? "sending_profile_lookup_ambiguous"
        : "sending_profile_not_found",
    };
  }
  return { row: rows[0] };
}
async function initialOutreachProjectionGate(svc: any, thread: any) {
  const leadId = String(thread?.lead_id || "");
  if (!leadId) {
    return { allowed: false, blockers: ["initial_outreach_lead_required"] };
  }
  let lead: any;
  try {
    lead = await svc.entities.OutboundLead.get(leadId);
  } catch {
    return {
      allowed: false,
      blockers: ["initial_outreach_lead_lookup_unavailable"],
    };
  }
  if (!lead) {
    return { allowed: false, blockers: ["initial_outreach_lead_required"] };
  }
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
    durable,
    projection,
    lead,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) {
      return gate.response ||
        Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const svc = base44.asServiceRole;
    const emergency = await emergencyState(svc);
    if (emergency.safe_mode || emergency.communications_paused) {
      return Response.json({
        ok: false,
        error: "emergency_control_paused:communications",
        safe_mode: emergency.safe_mode,
        reason: emergency.reason || null,
      }, { status: 409 });
    }
    // Retain one monotonic emergency epoch for the whole send. A later
    // STOP -> RESUME cannot authorize work prepared under the old epoch.
    let emergencyEpoch = body?.emergency_epoch_claim
      ? await inheritEmergencyEpoch(
        svc,
        body.emergency_epoch_claim,
        "communications",
      )
      : await captureEmergencyEpoch(svc, "communications");

    const threadId = String(body?.thread_id || "");
    const action = String(body?.action || "routine_reply");
    const classification = String(body?.classification || "question");
    const subject = sanitizeExternalText(body?.subject, 300);
    const text = sanitizeExternalText(body?.text, 5000);
    if (!threadId || !subject || !text) {
      return Response.json(
        { ok: false, error: "thread_subject_text_required" },
        { status: 400 },
      );
    }

    let thread = await svc.entities.CommunicationThread.get(threadId).catch((
      error: any,
    ) =>
      safeBestEffort(error, {
        operation: "commercialSendMessage",
        fallback: null,
        severity: "critical",
      })
    );
    if (!thread || ["closed", "suppressed"].includes(thread.status)) {
      return Response.json({ ok: false, error: "thread_unavailable" }, {
        status: 409,
      });
    }
    if (
      ["provider_negotiation", "aggregate_procurement"].includes(
        String(thread.engine || ""),
      )
    ) {
      emergencyEpoch = await extendEmergencyEpoch(
        svc,
        emergencyEpoch,
        "negotiations",
      );
    }
    const tenantAuthority = await ensureCommunicationThreadTenantBinding(
      svc,
      thread,
    );
    if (
      !tenantAuthority.ok || !tenantAuthority.binding ||
      !tenantAuthority.thread
    ) {
      return Response.json({
        ok: false,
        error: tenantAuthority.blocker ||
          "communication_thread_tenant_unresolved",
        blockers: tenantAuthority.blockers || [tenantAuthority.blocker],
        review_required: true,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const tenantBinding = tenantAuthority.binding;
    thread = tenantAuthority.thread;
    let brandId = tenantBinding.tenant_scope === "tenant"
      ? String(tenantBinding.brand_id)
      : "";
    let jurisdiction = canonicalMarket(thread.market_jurisdiction)?.iso2 || "";
    if (!jurisdiction && thread.lead_id) {
      const lead = await svc.entities.OutboundLead.get(String(thread.lead_id))
        .catch((error: any) =>
          safeBestEffort(error, {
            operation: "commercialSendMessage",
            fallback: null,
            severity: "critical",
          })
        );
      jurisdiction = canonicalMarket(lead?.country)?.iso2 || "";
    }
    if (!jurisdiction && thread.related_entity_type === "PartnerProspect") {
      const partner = await svc.entities.PartnerProspect.get(
        String(thread.related_entity_id || ""),
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "commercialSendMessage",
          fallback: null,
          severity: "critical",
        })
      );
      jurisdiction = canonicalMarket(partner?.country)?.iso2 || "";
    }
    if (!jurisdiction && brandId) {
      const brand = await svc.entities.Brand.get(brandId).catch((error: any) =>
        safeBestEffort(error, {
          operation: "commercialSendMessage",
          fallback: null,
          severity: "critical",
        })
      );
      jurisdiction =
        canonicalMarket(brand?.billing_country || brand?.country)?.iso2 || "";
    }
    if (thread.market_policy_rollout === "production") {
      const cap = ["provider_negotiation", "aggregate_procurement"].includes(
          String(thread.engine || ""),
        )
        ? "NEGOTIATE"
        : "OUTREACH";
      try {
        await assertMarketCapabilityAllowed(svc, {
          brand_id: brandId || undefined,
          jurisdiction: jurisdiction || undefined,
          capability: cap,
          enforce: true,
          actor_type: String(
            body?.agent_name || thread.engine || "commercial_send",
          ),
          ai_requested_bypass: body?.ai_requested_bypass === true,
        });
      } catch (e: any) {
        return Response.json({
          ok: false,
          error: `market_capability_denied:${cap}`,
          decision: e?.decision || null,
        }, { status: 409 });
      }
    }
    const to = normalizeEmail(body?.to || thread.counterparty_email);
    if (!to) {
      return Response.json({ ok: false, error: "recipient_required" }, {
        status: 400,
      });
    }

    const suppression = await readCommercialSuppression(svc, to);
    if (!suppression.allowed) {
      const suppressionPatch = suppression.blocker === "contact_suppressed"
        ? {
          status: "suppressed",
          automation_paused: true,
          pause_reason: "contact_suppressed",
        }
        : {
          automation_paused: true,
          pause_reason: suppression.blocker,
        };
      await svc.entities.CommunicationThread.update(
        thread.id,
        suppressionPatch,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "commercialSendMessage",
          fallback: null,
          severity: "critical",
        })
      );
      return Response.json({
        ok: false,
        error: suppression.blocker,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }

    const manualOverrideRequested = body?.manual_override === true;
    let approvedOverride: any = null;
    if (
      manualOverrideRequested && !gate.isAdmin && gate.isInternal &&
      body?.approval_id
    ) {
      approvedOverride = await svc.entities.Approval.get(
        String(body.approval_id),
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "commercialSendMessage",
          fallback: null,
          severity: "critical",
        })
      );
      const expired = approvedOverride?.expires_at &&
        Date.parse(String(approvedOverride.expires_at)) <= Date.now();
      if (
        approvedOverride?.status !== "approved" || expired ||
        !approvalBoundToThread(approvedOverride, thread)
      ) approvedOverride = null;
    }
    if (manualOverrideRequested && !gate.isAdmin && !approvedOverride) {
      return Response.json({
        ok: false,
        error: "admin_or_approved_internal_manual_override_required",
      }, { status: 403 });
    }
    const manualOverride = manualOverrideRequested &&
      (gate.isAdmin || Boolean(approvedOverride));
    const automatic = !manualOverride;
    const agentName = String(
      body?.agent_name || thread.engine || "commercial_orchestrator",
    ).toLowerCase();
    const authority = authorityForAgent(agentName);
    const legalAction = commercialLegalAction(thread, action);
    if (automatic && !authority.CAN_SEND) {
      return Response.json({
        ok: false,
        error: "agent_send_authority_required",
        agent_name: agentName,
      }, { status: 403 });
    }
    if (
      automatic && legalAction === "NEGOTIATE_PRICING" &&
      !authority.CAN_NEGOTIATE
    ) {
      return Response.json({
        ok: false,
        error: "agent_negotiate_authority_required",
        agent_name: agentName,
      }, { status: 403 });
    }
    let legalDecision: any = null;
    try {
      legalDecision = await enforceLegalExecution(svc, {
        requested_action: legalAction,
        merchant_id: brandId,
        jurisdiction,
        provider_id: thread.provider_id || null,
        case_id: thread.related_entity_id || thread.recover_id || null,
        deal_activation_id: thread.recover_id || null,
        approval_id: body?.approval_id || null,
        actor: {
          id: manualOverride ? String(gate.user?.email || "admin") : agentName,
          type: manualOverride ? "HUMAN_ADMIN" : "AUTOMATION",
          tool: "commercialSendMessage",
          allowed_actions: [legalAction],
        },
        emergency_state: {
          legal_execution_paused: Boolean(emergency.safe_mode),
        },
      });
    } catch (error) {
      const response = legalBlockResponse(error);
      if (response) return response;
      throw error;
    }

    const policyAuthority = await readExactCommercialPolicy(svc, {
      policy_key: String(thread.policy_key || ""),
      policy_version: String(thread.policy_version || ""),
    });
    if (!policyAuthority.ok) {
      return Response.json({
        ok: false,
        error: policyAuthority.blocker,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const policy = policyAuthority.policy;
    const timezone = commercialTimezone(thread, policy);
    if (automatic) {
      if (!policyIsActive(policy)) {
        return Response.json({ ok: false, error: "active_policy_required" }, {
          status: 409,
        });
      }
      if (
        acquisitionEngine(thread.engine) &&
        (!jurisdiction || !Array.isArray(policy.countries) ||
          !policy.countries.includes(jurisdiction))
      ) {
        return Response.json({
          ok: false,
          error: "market_not_enabled_by_commercial_policy",
          jurisdiction: jurisdiction || null,
        }, { status: 409 });
      }
      const authz = routineActionAllowed(policy, action, classification);
      if (!authz.allowed) {
        return Response.json({
          ok: false,
          error: authz.reason,
          escalation_required: true,
        }, { status: 409 });
      }
      if (thread.automation_paused) {
        return Response.json({ ok: false, error: "thread_automation_paused" }, {
          status: 409,
        });
      }
      if (!gate.isInternal) {
        return Response.json({
          ok: false,
          error: "internal_autonomy_proof_required",
        }, { status: 403 });
      }
      if (!isBusinessHour(policy, new Date(), timezone)) {
        return Response.json({ ok: false, error: "outside_business_hours" }, {
          status: 409,
        });
      }
      const inboundId = String(body?.in_reply_to_message_id || "");
      if (inboundId) {
        const inbound = await svc.entities.CommunicationMessage.get(inboundId)
          .catch((error: any) =>
            safeBestEffort(error, {
              operation: "commercialSendMessage",
              fallback: null,
              severity: "critical",
            })
          );
        if (
          !inbound || inbound.thread_id !== thread.id ||
          inbound.direction !== "inbound"
        ) {
          return Response.json({
            ok: false,
            error: "invalid_inbound_reply_reference",
          }, { status: 409 });
        }
        const earliest = Date.parse(inbound.earliest_reply_at || "");
        const scheduled = Date.parse(inbound.scheduled_send_at || "");
        const nowMs = Date.now();
        if (!Number.isFinite(earliest) || nowMs < earliest) {
          return Response.json({
            ok: false,
            error: "minimum_reply_delay_not_elapsed",
            earliest_reply_at: inbound.earliest_reply_at,
          }, { status: 409 });
        }
        if (Number.isFinite(scheduled) && nowMs < scheduled) {
          return Response.json({
            ok: false,
            error: "scheduled_send_not_due",
            scheduled_send_at: inbound.scheduled_send_at,
          }, { status: 409 });
        }
      }
    }

    const previousOut = await strictMessageRows(
      svc,
      { thread_id: thread.id, direction: "outbound" },
      "-created_date",
      6,
      "previous_outbound_lookup_unavailable",
    );
    const quality = communicationQuality(text, {
      previous_outbound: previousOut.map((m: any) => String(m.text_body || "")),
    });
    if (!quality.ok) {
      return Response.json({
        ok: false,
        error: "communication_quality_gate_failed",
        quality,
      }, { status: 422 });
    }

    const idempotency = String(
      body?.idempotency_key ||
        `cambra:${thread.id}:${action}:${
          thread.last_inbound_at || thread.last_message_at || "start"
        }`,
    );
    const idempotencyRead = await readCommercialSendIdempotency(
      svc,
      thread.id,
      idempotency,
    );
    if (!idempotencyRead.ok) {
      return Response.json({
        ok: false,
        error: idempotencyRead.blocker,
        review_required: true,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    if (idempotencyRead.message) {
      return Response.json({
        ok: true,
        duplicate: true,
        message_id: idempotencyRead.message.id,
        provider: idempotencyRead.message.provider || null,
      });
    }

    const now = new Date().toISOString();
    const requestedProfileKey = String(
      body?.sending_profile_key || thread.sending_profile_key || "",
    ).trim();
    const profileAuthority = await strictSendingProfile(
      svc,
      requestedProfileKey,
    );
    if (profileAuthority?.error) {
      return Response.json({
        ok: false,
        error: profileAuthority.error,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const sendingProfile = profileAuthority?.row || null;
    if (
      approvedOverride &&
      ["initial_outreach", "follow_up", "partner_outreach"].includes(action) &&
      !sendingProfile
    ) {
      return Response.json({
        ok: false,
        error: "approved_send_profile_required",
        review_required: true,
      }, { status: 409 });
    }
    const signatureProvider = String(sendingProfile?.provider || "outlook");
    const configuredSignatureEmail = mailboxFromSetting(
      String(
        sendingProfile?.from_address || (signatureProvider === "outlook"
          ? Deno.env.get("CAMBRA_OUTLOOK_SIGNATURE_EMAIL")
          : signatureProvider === "resend"
          ? Deno.env.get("RESEND_FROM")
          : "") ||
          "",
      ),
    );
    const signedText = ensureSignature(
      text,
      cambraSignature(
        signatureProvider,
        String(thread.engine || ""),
        configuredSignatureEmail,
      ),
    );
    const signedHTML = signedHtml(
      text,
      signatureProvider,
      String(thread.engine || ""),
      configuredSignatureEmail,
    );
    const acquisitionAction = ["initial_outreach", "partner_outreach"].includes(
      action,
    );
    if (acquisitionAction) {
      const outboundAuthority = await readSingletonAuthority(svc, {
        entity: "OutboundControl",
        query: { control_key: "global" },
        sort: "-created_date",
        authority: "outbound_control",
      });
      const control = outboundAuthority.row;
      if (!outboundAuthority.ok) {
        return Response.json({
          ok: false,
          error: outboundAuthority.blocker ||
            "outbound_control_authority_unavailable",
          material_effects_fail_closed: true,
        }, { status: 409 });
      }
      if (!manualOverride) {
        if (!control?.acquisition_enabled) {
          return Response.json({ ok: false, error: "outbound_master_paused" }, {
            status: 409,
          });
        }
        if (!sendingProfile) {
          return Response.json(
            { ok: false, error: "sending_profile_required" },
            { status: 409 },
          );
        }
        if (
          sendingProfile.provider === "outlook" &&
          !control.premium_outlook_enabled
        ) {
          return Response.json({ ok: false, error: "premium_outlook_paused" }, {
            status: 409,
          });
        }
        if (
          sendingProfile.provider === "resend" && !control.volume_resend_enabled
        ) {
          return Response.json({ ok: false, error: "volume_resend_paused" }, {
            status: 409,
          });
        }
        if (
          sendingProfile.provider === "instantly" && !control.instantly_enabled
        ) {
          return Response.json({
            ok: false,
            error: "instantly_outbound_paused",
          }, { status: 409 });
        }
      }
    }
    let governor: any = { allowed: true, reason: "admin_manual_override" };
    let sendBaseline: any = null;
    let sendLimits: any = null;
    if (automatic) {
      if (
        sendingProfile && acquisitionEngine(thread.engine) &&
        (!Array.isArray(policy?.sending_profile_keys) ||
          !policy.sending_profile_keys.includes(sendingProfile.profile_key))
      ) {
        return Response.json({
          ok: false,
          error: "policy_sending_profile_not_allowed",
        }, { status: 409 });
      }
      if (!sendingProfile) {
        governor = automaticSendGovernorDecision({
          automatic: true,
          sendingProfile: null,
          profileSentToday: 0,
          policy,
          policySentToday: 0,
        });
      } else {
        const day = new Date();
        day.setUTCHours(0, 0, 0, 0);
        const since = day.toISOString();
        const minuteAgo = new Date(Date.now() - 60000).toISOString();
        const profileLimit = Math.max(
          0,
          Math.floor(Number(sendingProfile.current_daily_cap || 0)),
        );
        const policyLimit = Math.max(
          0,
          Math.floor(Number(policy.daily_send_limit || 0)),
        );
        const burstLimit = Math.max(
          1,
          Math.min(
            60,
            Number(
              sendingProfile.burst_per_minute ||
                (sendingProfile.provider === "outlook" ? 12 : 30),
            ),
          ),
        );
        const [profileSent, policySent, recentBurst] = await Promise.all([
          strictMessageRows(
            svc,
            {
              direction: "outbound",
              sending_profile_key: sendingProfile.profile_key,
              sent_at: { $gte: since },
            },
            "-sent_at",
            Math.max(2, profileLimit + 1),
            "sending_profile_daily_usage_lookup_unavailable",
          ),
          strictMessageRows(
            svc,
            {
              direction: "outbound",
              policy_key: thread.policy_key,
              policy_version: thread.policy_version,
              sent_at: { $gte: since },
            },
            "-sent_at",
            Math.max(2, policyLimit + 1),
            "commercial_policy_daily_usage_lookup_unavailable",
          ),
          strictMessageRows(
            svc,
            {
              direction: "outbound",
              sending_profile_key: sendingProfile.profile_key,
              sent_at: { $gte: minuteAgo },
            },
            "-sent_at",
            Math.max(2, burstLimit + 1),
            "sending_profile_burst_usage_lookup_unavailable",
          ),
        ]);
        governor = automaticSendGovernorDecision({
          automatic: true,
          sendingProfile,
          profileSentToday: profileSent.length,
          policy,
          policySentToday: policySent.length,
        });
        sendBaseline = {
          profile_sent_today: profileSent.length,
          policy_sent_today: policySent.length,
          profile_sent_minute: recentBurst.length,
        };
        sendLimits = {
          profile_daily_limit: profileLimit,
          policy_daily_limit: policyLimit,
          profile_burst_limit: burstLimit,
        };
      }
      if (!governor.allowed) {
        const governorError = String(
          governor.reason || "sending_profile_daily_cap_reached",
        );
        return Response.json({
          ok: false,
          error: governorError,
          profile: sendingProfile?.profile_key || null,
          limit: governor.limit || null,
        }, { status: 409 });
      }
    }
    let manualOverrideAudit: any = null;
    if (manualOverride) {
      manualOverrideAudit = await svc.entities.AuthorizationLog.create({
        action_type: "commercial_send_manual_override",
        description: `Approved override for ${action} on thread ${thread.id}`,
        approved_by: String(
          gate.user?.email || approvedOverride?.approved_by || "",
        ),
        approved_at: new Date().toISOString(),
        source: "commercialSendMessage",
        document_version: "commercial-send-governor-1.1.0",
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "commercialSendMessage",
          fallback: null,
          severity: "critical",
        })
      );
      if (!manualOverrideAudit) {
        return Response.json({
          ok: false,
          error: "manual_override_audit_required",
        }, { status: 409 });
      }
    }
    let liveThread = await svc.entities.CommunicationThread.get(thread.id)
      .catch((error: any) =>
        safeBestEffort(error, {
          operation: "commercialSendMessage",
          fallback: null,
          severity: "critical",
        })
      );
    if (
      !liveThread || ["closed", "suppressed"].includes(liveThread.status) ||
      liveThread.automation_paused === true
    ) {
      return Response.json({
        ok: false,
        error: "thread_state_changed_before_send",
      }, { status: 409 });
    }
    const liveSuppression = await readCommercialSuppression(svc, to);
    if (!liveSuppression.allowed) {
      return Response.json({
        ok: false,
        error: liveSuppression.blocker === "contact_suppressed"
          ? "contact_suppressed_before_send"
          : liveSuppression.blocker,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    if (action === "initial_outreach") {
      const contactGate = await initialOutreachProjectionGate(svc, liveThread);
      if (!contactGate.allowed) {
        return Response.json({
          ok: false,
          error: contactGate.blockers[0] ||
            "contact_last_projection_required_before_initial_outreach",
          blockers: contactGate.blockers,
          review_required: true,
          material_effects_fail_closed: true,
        }, { status: 409 });
      }
    }
    if (action === "follow_up") {
      if (
        ["MEETING_BOOKED", "MEETING_COMPLETED", "CLOSED_WON", "CLOSED_LOST"]
          .includes(String(liveThread.conversation_state || "")) ||
        ["booked", "completed"].includes(
          String(liveThread.meeting_status || ""),
        )
      ) {
        return Response.json({
          ok: false,
          error: "follow_up_cancelled_by_meeting_or_closed_state",
        }, { status: 409 });
      }
      const latest = await strictMessageRows(
        svc,
        { thread_id: thread.id },
        "-created_date",
        10,
        "follow_up_thread_history_lookup_unavailable",
      );
      const latestInbound = latest.find((message: any) =>
        message.direction === "inbound"
      );
      const latestOutbound = latest.find((message: any) =>
        message.direction === "outbound"
      );
      if (
        latestInbound &&
        (!latestOutbound ||
          Date.parse(
              latestInbound.received_at || latestInbound.created_date || 0,
            ) >=
            Date.parse(
              latestOutbound.actual_sent_at || latestOutbound.sent_at ||
                latestOutbound.created_date || 0,
            ))
      ) {
        return Response.json({
          ok: false,
          error: "follow_up_cancelled_by_new_reply",
        }, { status: 409 });
      }
    }
    let provider = String(sendingProfile?.provider || "outlook");
    let providerMessageId: any = null;
    let providerReferenceKind = "";
    let fromAddress = "";
    let externalThreadId = thread.external_thread_id || null;
    let externalLeadId = thread.external_lead_id || null;
    let sendStatus = "sent";
    let actualSentAt: any = now;
    let raw: any = {
      idempotency_key: idempotency,
      provider_capability: commercialEmailProviderCapability(provider),
      sending_profile_key: sendingProfile?.profile_key || null,
      central_governor: governor,
      legal_execution: {
        decision: legalDecision?.decision,
        authority_snapshot_id: legalDecision?.authority_snapshot_id,
        authority_snapshot_hash: legalDecision?.authority_snapshot_hash,
      },
      manual_override: manualOverride,
      manual_override_approval_id: approvedOverride?.id || null,
      manual_override_audit_id: manualOverrideAudit?.id || null,
    };
    const paidEventKey = `email:${idempotency}`;
    const paidIdempotency = await readPaidSendReservation(svc, paidEventKey);
    if (!paidIdempotency.ok || paidIdempotency.duplicate) {
      return Response.json({
        ok: false,
        error: paidIdempotency.blocker,
        review_required: true,
        duplicate: paidIdempotency.duplicate,
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    // OTR-019: this is the exact eligible-send boundary. Every request that
    // reaches the durable send-slot claim receives a service-role receipt
    // before any transport/cost effect. Earlier policy, approval and
    // suppression refusals remain outside the SLO denominator.
    return await observeServiceLevelRequest(
      svc,
      req,
      {
        slo_key: "commercial_send",
        endpoint: "commercialSendMessage",
        workload_key: idempotency,
      },
      async () => {
        // Manual override may bypass configured rate limits, but it never bypasses
        // the durable effect/idempotency claim. Its counters remain observable and
        // count toward later automatic policy/profile baselines.
        const manualLimit = Number.MAX_SAFE_INTEGER;
        const sendSlot: any = await claimCommercialSendSlot(svc, {
          idempotency_key: idempotency,
          thread_id: thread.id,
          profile_key: sendingProfile?.profile_key || `manual:${provider}`,
          policy_key: thread.policy_key,
          policy_version: thread.policy_version,
          provider,
          ...(automatic ? sendLimits : {
            profile_daily_limit: manualLimit,
            policy_daily_limit: manualLimit,
            profile_burst_limit: manualLimit,
          }),
          baseline: automatic ? sendBaseline : {
            profile_sent_today: 0,
            policy_sent_today: 0,
            profile_sent_minute: 0,
          },
        });
        if (!sendSlot.acquired) {
          return Response.json({
            ok: false,
            error: sendSlot.blocker,
            review_required: sendSlot.review_required === true,
            duplicate: true,
            material_effects_fail_closed: true,
          }, { status: 409 });
        }
        let costReservation: any;
        // R5 OTR-012 — the transport fence is not authority by itself. Re-read
        // actor, tenant, thread, market, legal and exact commercial policy at
        // the last pre-effect boundary, under the already-captured epoch.
        const effectClasses: Array<
          "SEND" | "NEGOTIATE" | "SPEND" | "EXECUTE"
        > = ["SEND", "SPEND", "EXECUTE"];
        if (legalAction === "NEGOTIATE_PRICING") {
          effectClasses.push("NEGOTIATE");
        }
        const boundaryActorId = gate.isInternal
          ? `internal:${agentName}`
          : String(gate.user?.email || "");
        const boundaryActorType = gate.isInternal
          ? "AUTOMATION"
          : "HUMAN_ADMIN";
        const boundaryTenantKey = tenantBinding.tenant_scope === "tenant"
          ? String(tenantBinding.brand_id || "")
          : "_platform";
        const revalidateCommercialEffectAuthority = async (phase: string) => {
          await requireEffectAuthorities(svc, {
            effect_classes: effectClasses,
            actor: { id: boundaryActorId, type: boundaryActorType },
            tenant: {
              key: boundaryTenantKey,
              scope: tenantBinding.tenant_scope === "tenant"
                ? "tenant"
                : "platform",
            },
            subject: { type: "CommunicationThread", id: thread.id },
            context: {
              jurisdiction,
              market_scope_requirement: "REQUIRED",
              emergency_epoch_claim: emergencyEpoch,
              emergency_capabilities: legalAction === "NEGOTIATE_PRICING"
                ? ["communications", "negotiations"]
                : ["communications"],
              expected_policy_key: String(thread.policy_key || ""),
              expected_policy_version: String(thread.policy_version || ""),
              phase: `${phase}:${thread.id}:${idempotency}`,
            },
            revalidate: async (authoritySvc: any, exact: any) => {
              const freshGate = await requireAdminOrInternal(req, base44, body);
              const freshActorId = freshGate.isInternal
                ? `internal:${agentName}`
                : String(freshGate.user?.email || "");
              if (!freshGate.ok || freshActorId !== exact.actor_id) {
                return {
                  status: "DENIED",
                  authority_available: true,
                  effect_classes: exact.effect_classes,
                  actor_id: freshActorId,
                  tenant_key: exact.tenant_key,
                  subject_type: exact.subject_type,
                  subject_id: exact.subject_id,
                  policy_key: String(thread.policy_key || ""),
                  policy_version: String(thread.policy_version || ""),
                  policy_state: "DENIED",
                  authority_ref: "auth:commercial",
                  observed_at: new Date().toISOString(),
                };
              }
              const freshThreads = await authoritySvc.entities
                .CommunicationThread
                .filter({ id: exact.subject_id }, "-created_date", 2);
              if (!Array.isArray(freshThreads) || freshThreads.length !== 1) {
                throw new Error(
                  "commercial_thread_effect_authority_unavailable",
                );
              }
              const authorityThread = freshThreads[0];
              const freshTenant = await ensureCommunicationThreadTenantBinding(
                authoritySvc,
                authorityThread,
              );
              const freshTenantKey = freshTenant.ok &&
                  freshTenant.binding?.tenant_scope === "tenant"
                ? String(freshTenant.binding.brand_id || "")
                : freshTenant.ok
                ? "_platform"
                : "";
              if (
                !freshTenant.ok || freshTenantKey !== exact.tenant_key ||
                ["closed", "suppressed"].includes(
                  String(authorityThread.status || ""),
                ) ||
                authorityThread.automation_paused === true ||
                String(authorityThread.policy_key || "") !==
                  String(thread.policy_key || "") ||
                String(authorityThread.policy_version || "") !==
                  String(thread.policy_version || "")
              ) {
                throw new Error("commercial_thread_effect_authority_changed");
              }
              const freshPolicyAuthority = await readExactCommercialPolicy(
                authoritySvc,
                {
                  policy_key: String(authorityThread.policy_key || ""),
                  policy_version: String(authorityThread.policy_version || ""),
                },
              );
              if (!freshPolicyAuthority.ok || !freshPolicyAuthority.policy) {
                throw new Error(
                  "commercial_policy_effect_authority_unavailable",
                );
              }
              const freshPolicy = freshPolicyAuthority.policy;
              if (
                automatic &&
                (!policyIsActive(freshPolicy) ||
                  !routineActionAllowed(freshPolicy, action, classification)
                    .allowed)
              ) {
                throw new Error("commercial_policy_effect_authority_denied");
              }
              if (
                automatic &&
                (!authorityForAgent(agentName).CAN_SEND ||
                  (legalAction === "NEGOTIATE_PRICING" &&
                    !authorityForAgent(agentName).CAN_NEGOTIATE))
              ) {
                throw new Error("commercial_agent_effect_authority_denied");
              }
              const freshSuppression = await readCommercialSuppression(
                authoritySvc,
                to,
              );
              if (!freshSuppression.allowed) {
                throw new Error(
                  "commercial_suppression_effect_authority_denied",
                );
              }
              let freshJurisdiction = canonicalMarket(
                authorityThread.market_jurisdiction,
              )?.iso2 || "";
              if (!freshJurisdiction && authorityThread.lead_id) {
                const lead = await authoritySvc.entities.OutboundLead.get(
                  String(authorityThread.lead_id),
                );
                freshJurisdiction = canonicalMarket(lead?.country)?.iso2 || "";
              }
              if (
                !freshJurisdiction &&
                authorityThread.related_entity_type === "PartnerProspect"
              ) {
                const partner = await authoritySvc.entities.PartnerProspect.get(
                  String(authorityThread.related_entity_id || ""),
                );
                freshJurisdiction = canonicalMarket(partner?.country)?.iso2 ||
                  "";
              }
              if (!freshJurisdiction && freshTenantKey !== "_platform") {
                const brands = await authoritySvc.entities.Brand.filter(
                  { id: freshTenantKey },
                  "-created_date",
                  2,
                );
                if (!Array.isArray(brands) || brands.length !== 1) {
                  throw new Error(
                    "commercial_brand_effect_authority_unavailable",
                  );
                }
                freshJurisdiction = canonicalMarket(
                  brands[0].billing_country || brands[0].country,
                )?.iso2 || "";
              }
              const capability = legalAction === "NEGOTIATE_PRICING"
                ? "NEGOTIATE"
                : "OUTREACH";
              const marketDecision = await assertMarketCapabilityAllowed(
                authoritySvc,
                {
                  brand_id: freshTenantKey === "_platform"
                    ? undefined
                    : freshTenantKey,
                  jurisdiction: freshJurisdiction,
                  capability,
                  enforce: true,
                  actor_type: agentName,
                },
              );
              const freshLegal: any = await enforceLegalExecution(
                authoritySvc,
                {
                  requested_action: legalAction,
                  merchant_id: freshTenantKey === "_platform"
                    ? ""
                    : freshTenantKey,
                  jurisdiction: freshJurisdiction,
                  provider_id: authorityThread.provider_id || null,
                  case_id: authorityThread.related_entity_id ||
                    authorityThread.recover_id || null,
                  deal_activation_id: authorityThread.recover_id || null,
                  approval_id: body?.approval_id || null,
                  actor: {
                    id: exact.actor_id,
                    type: exact.actor_type,
                    tool: "commercialSendMessage",
                    allowed_actions: [legalAction],
                  },
                  emergency_state: { legal_execution_paused: false },
                },
              );
              return {
                status: "AUTHORIZED",
                authority_available: true,
                effect_classes: exact.effect_classes,
                actor_id: exact.actor_id,
                tenant_key: exact.tenant_key,
                subject_type: exact.subject_type,
                subject_id: exact.subject_id,
                policy_key: String(freshPolicy.policy_key || ""),
                policy_version: String(freshPolicy.version || ""),
                policy_state: "ACTIVE",
                authority_ref: String(
                  freshLegal?.authority_snapshot_id ||
                    `CommercialPolicy:${freshPolicy.id || ""}`,
                ),
                authority_hash: freshLegal?.authority_snapshot_hash || null,
                observed_at: new Date().toISOString(),
                valid_until: freshPolicy.expires_at || null,
                market_iso2: freshJurisdiction,
                market_scope_version: exact.market_scope_version,
              };
            },
          });
        };
        try {
          await revalidateCommercialEffectAuthority(
            "commercial_send_reservation_boundary",
          );
        } catch (error: any) {
          const response = effectAuthorityErrorResponse(error);
          if (!response) {
            throw error;
          }
          if (sendSlot?.acquired) {
            await rollbackCommercialSendSlot(svc, sendSlot, {
              blocker: String(error?.blocker || "effect_authority_denied"),
            }).catch((rollbackError: any) =>
              safeBestEffort(rollbackError, {
                operation:
                  "commercialSendMessage.rollback_slot_after_effect_authority_denial",
                fallback: null,
                severity: "critical",
              })
            );
          }
          await settlePaidOperation(svc, costReservation, {
            ok: false,
            usage_json: {
              thread_id: thread.id,
              provider_effect_started: false,
              error_code: "effect_authority_denied",
            },
          }).catch((settlementError: any) =>
            safeBestEffort(settlementError, {
              operation: "commercialSendMessage.settle_effect_authority_denial",
              fallback: null,
              severity: "critical",
            })
          );
          return response;
        }
        try {
          costReservation = await reservePaidOperation(svc, {
            event_key: paidEventKey,
            category: "email",
            provider,
            source: "commercialSendMessage",
            related_entity_type: "CommunicationThread",
            related_entity_id: thread.id,
          });
        } catch (error) {
          if (sendSlot?.acquired) {
            await rollbackCommercialSendSlot(svc, sendSlot, {
              blocker: "paid_send_reservation_failed",
            }).catch((rollbackError: any) =>
              safeBestEffort(rollbackError, {
                operation:
                  "commercialSendMessage.rollback_slot_after_reservation_failure",
                fallback: null,
                severity: "critical",
              })
            );
          }
          throw error;
        }
        const paidGate = paidReservationTransportDecision(costReservation);
        if (!paidGate.allowed) {
          if (sendSlot?.acquired) {
            await rollbackCommercialSendSlot(svc, sendSlot, {
              blocker: paidGate.blocker,
            }).catch((rollbackError: any) =>
              safeBestEffort(rollbackError, {
                operation:
                  "commercialSendMessage.rollback_slot_after_paid_gate_denial",
                fallback: null,
                severity: "critical",
              })
            );
          }
          return Response.json({
            ok: false,
            error: paidGate.blocker,
            review_required: true,
            duplicate: costReservation?.duplicate === true,
            material_effects_fail_closed: true,
          }, { status: 409 });
        }
        liveThread = await svc.entities.CommunicationThread.get(thread.id)
          .catch(
            (error: any) =>
              safeBestEffort(error, {
                operation:
                  "commercialSendMessage.provider_boundary_thread_read",
                fallback: null,
                severity: "critical",
              }),
          );
        const boundaryTenantAuthority: CommunicationThreadTenantAuthority =
          liveThread
            ? await ensureCommunicationThreadTenantBinding(svc, liveThread)
            : {
              ok: false,
              blocker: "communication_thread_unavailable",
              blockers: ["communication_thread_unavailable"],
              thread: null,
              binding: null,
            };
        const boundaryTenantMatches = boundaryTenantAuthority.ok &&
          boundaryTenantAuthority.binding.tenant_scope ===
            tenantBinding.tenant_scope &&
          boundaryTenantAuthority.binding.brand_id ===
            tenantBinding.brand_id;
        const liveTenant = boundaryTenantAuthority.ok && boundaryTenantMatches
          ? verifyCommunicationThreadTenantBinding(
            boundaryTenantAuthority.thread,
            tenantBinding,
          )
          : {
            ok: false,
            blockers: [
              boundaryTenantAuthority.blocker ||
              "communication_thread_tenant_changed_before_send",
            ],
          };
        if (boundaryTenantAuthority.ok) {
          liveThread = boundaryTenantAuthority.thread;
        }
        const boundarySuppression = await readCommercialSuppression(svc, to);
        let boundaryContactGate: any = { allowed: true, blockers: [] };
        if (action === "initial_outreach" && liveThread) {
          boundaryContactGate = await initialOutreachProjectionGate(
            svc,
            liveThread,
          );
        }
        if (
          !liveThread || !liveTenant.ok ||
          ["closed", "suppressed"].includes(liveThread.status) ||
          liveThread.automation_paused === true ||
          !boundarySuppression.allowed ||
          !boundaryContactGate.allowed
        ) {
          const blocker = !liveThread
            ? "thread_lookup_unavailable_at_provider_boundary"
            : !liveTenant.ok
            ? liveTenant.blockers[0]
            : ["closed", "suppressed"].includes(String(liveThread.status)) ||
                liveThread.automation_paused === true
            ? "thread_state_changed_at_provider_boundary"
            : !boundarySuppression.allowed
            ? boundarySuppression.blocker
            : boundaryContactGate.blockers[0] ||
              "contact_last_projection_required_at_provider_boundary";
          if (sendSlot?.acquired) {
            await rollbackCommercialSendSlot(svc, sendSlot, { blocker }).catch((
              rollbackError: any,
            ) =>
              safeBestEffort(rollbackError, {
                operation:
                  "commercialSendMessage.rollback_slot_after_boundary_denial",
                fallback: null,
                severity: "critical",
              })
            );
          }
          await settlePaidOperation(svc, costReservation, {
            ok: false,
            usage_json: {
              thread_id: thread.id,
              provider_effect_started: false,
              error_code: blocker,
            },
          }).catch((settlementError: any) =>
            safeBestEffort(settlementError, {
              operation: "commercialSendMessage.settle_boundary_denial",
              fallback: null,
              severity: "critical",
            })
          );
          return Response.json({
            ok: false,
            error: blocker,
            review_required: true,
            material_effects_fail_closed: true,
          }, { status: 409 });
        }
        let instantlyKey = "";
        let instantlyInbound: any = null;
        let instantlyLead: any = null;
        let outlookConnection: any = null;
        let resendKey = "";
        let resendFromSetting = "";
        let resendProviderIdempotencyKey = "";
        try {
          if (provider === "instantly") {
            if (!instantlyProfileReady(sendingProfile)) {
              throw Object.assign(new Error("instantly_profile_not_ready"), {
                status: 409,
              });
            }
            instantlyKey = Deno.env.get("INSTANTLY_API_KEY") || "";
            if (!instantlyKey) {
              throw Object.assign(new Error("instantly_not_configured"), {
                status: 503,
              });
            }
            if (!acquisitionAction) {
              const inboundId = String(body?.in_reply_to_message_id || "");
              try {
                instantlyInbound = inboundId
                  ? await svc.entities.CommunicationMessage.get(inboundId)
                  : null;
              } catch (_) {
                throw Object.assign(
                  new Error("instantly_reply_reference_lookup_unavailable"),
                  { status: 409 },
                );
              }
              if (!instantlyInbound?.provider_message_id) {
                throw Object.assign(
                  new Error("instantly_reply_reference_required"),
                  { status: 409 },
                );
              }
            } else if (thread.lead_id) {
              // Resolve every local provider input while rollback remains safe.
              // Once transport starts, any error is intentionally ambiguous.
              try {
                instantlyLead = await svc.entities.OutboundLead.get(
                  String(thread.lead_id),
                );
              } catch (_) {
                throw Object.assign(
                  new Error("instantly_lead_lookup_unavailable"),
                  { status: 409 },
                );
              }
              if (!instantlyLead?.id) {
                throw Object.assign(new Error("instantly_lead_required"), {
                  status: 409,
                });
              }
            }
          } else if (provider === "outlook") {
            outlookConnection = await svc.connectors.getConnection("outlook")
              .catch((error: any) =>
                safeBestEffort(error, {
                  operation:
                    "commercialSendMessage.outlook_connection_preflight",
                  fallback: null,
                  severity: "critical",
                })
              );
            if (!outlookConnection?.accessToken) {
              throw Object.assign(new Error("outlook_connector_required"), {
                status: 503,
              });
            }
          } else if (provider === "resend") {
            resendKey = Deno.env.get("RESEND_API_KEY") || "";
            if (!resendKey) {
              throw Object.assign(
                new Error("commercial_email_not_configured"),
                {
                  status: 503,
                },
              );
            }
            resendFromSetting = String(
              sendingProfile?.from_address || Deno.env.get("RESEND_FROM") || "",
            ).trim();
            if (!resendFromSetting) {
              throw Object.assign(new Error("resend_from_identity_required"), {
                status: 503,
              });
            }
            resendProviderIdempotencyKey = requireResendIdempotencyKey(
              idempotency,
            );
          } else {
            throw Object.assign(new Error("unsupported_outbound_provider"), {
              status: 409,
            });
          }
        } catch (error: any) {
          if (sendSlot?.acquired) {
            await rollbackCommercialSendSlot(svc, sendSlot, {
              blocker: String(error?.message || "provider_preflight_failed"),
            }).catch((rollbackError: any) =>
              safeBestEffort(rollbackError, {
                operation:
                  "commercialSendMessage.rollback_slot_after_provider_preflight",
                fallback: null,
                severity: "critical",
              })
            );
          }
          await settlePaidOperation(svc, costReservation, {
            ok: false,
            usage_json: {
              thread_id: thread.id,
              provider_effect_started: false,
              error_code: String(error?.message || "provider_preflight_failed"),
            },
          }).catch((settlementError: any) =>
            safeBestEffort(settlementError, {
              operation:
                "commercialSendMessage.settle_provider_preflight_failure",
              fallback: null,
              severity: "critical",
            })
          );
          throw error;
        }
        try {
          await revalidateCommercialEffectAuthority(
            "commercial_provider_transport_boundary",
          );
        } catch (error: any) {
          const response = effectAuthorityErrorResponse(error);
          if (!response) throw error;
          if (sendSlot?.acquired) {
            await rollbackCommercialSendSlot(svc, sendSlot, {
              blocker: String(error?.blocker || "effect_authority_denied"),
            }).catch((rollbackError: any) =>
              safeBestEffort(rollbackError, {
                operation:
                  "commercialSendMessage.rollback_slot_after_final_effect_authority_denial",
                fallback: null,
                severity: "critical",
              })
            );
          }
          await settlePaidOperation(svc, costReservation, {
            ok: false,
            usage_json: {
              thread_id: thread.id,
              provider_effect_started: false,
              error_code: "effect_authority_denied_at_transport_boundary",
            },
          }).catch((settlementError: any) =>
            safeBestEffort(settlementError, {
              operation:
                "commercialSendMessage.settle_final_effect_authority_denial",
              fallback: null,
              severity: "critical",
            })
          );
          return response;
        }
        try {
          if (sendSlot?.acquired) {
            await markCommercialSendTransportStarted(svc, sendSlot);
          }
        } catch (error) {
          if (sendSlot?.acquired) {
            await rollbackCommercialSendSlot(svc, sendSlot, {
              blocker: "transport_start_claim_failed",
            }).catch((rollbackError: any) =>
              safeBestEffort(rollbackError, {
                operation:
                  "commercialSendMessage.rollback_slot_after_transport_claim_failure",
                fallback: null,
                severity: "critical",
              })
            );
          }
          await settlePaidOperation(svc, costReservation, {
            ok: false,
            usage_json: {
              thread_id: thread.id,
              provider_effect_started: false,
              error_code: "transport_start_claim_failed",
            },
          }).catch((settlementError: any) =>
            safeBestEffort(settlementError, {
              operation: "commercialSendMessage.settle_transport_claim_failure",
              fallback: null,
              severity: "critical",
            })
          );
          throw error;
        }
        let providerEffectStarted = false;
        let outlookDraftId = "";
        try {
          if (provider === "instantly") {
            const transport = new InstantlyOutboundProvider(instantlyKey);
            fromAddress = mailboxFromSetting(
              String(sendingProfile.from_address || ""),
            );
            if (acquisitionAction) {
              await assertEmergencyEpochUnchanged(
                svc,
                emergencyEpoch,
                "before_instantly_queue",
              );
              providerEffectStarted = true;
              const queued = await transport.queueInitial({
                campaign_id: sendingProfile.external_campaign_id,
                to,
                contact_name: thread.counterparty_name ||
                  instantlyLead?.contact_full_name ||
                  "",
                contact_title: thread.counterparty_role ||
                  instantlyLead?.contact_title ||
                  "",
                company_name: thread.company_name ||
                  instantlyLead?.company_name ||
                  "",
                company_domain: instantlyLead?.company_domain || "",
                personalization: (thread.personalization_json?.facts || [])
                  .slice(
                    0,
                    5,
                  ).join("; "),
                subject,
                text: signedText,
                thread_id: thread.id,
                idempotency_key: idempotency,
              });
              externalLeadId = queued.provider_lead_id || externalLeadId;
              providerMessageId = queued.provider_lead_id;
              providerReferenceKind = "INSTANTLY_LEAD_ID";
              sendStatus = "scheduled";
              actualSentAt = null;
              raw = {
                ...raw,
                instantly_lead_id: queued.provider_lead_id || null,
                instantly_campaign_id: queued.campaign_id,
                queued: true,
                provider_response: queued.raw,
              };
              await assertEmergencyEpochUnchanged(
                svc,
                emergencyEpoch,
                "after_instantly_queue",
              );
            } else {
              await assertEmergencyEpochUnchanged(
                svc,
                emergencyEpoch,
                "before_instantly_reply",
              );
              providerEffectStarted = true;
              const sent = await transport.sendReply({
                eaccount: fromAddress,
                reply_to_uuid: instantlyInbound.provider_message_id,
                subject,
                text: signedText,
                html: signedHTML,
              });
              providerMessageId = sent.provider_message_id || null;
              providerReferenceKind = "INSTANTLY_EMAIL_ID";
              externalThreadId = sent.external_thread_id || externalThreadId;
              raw = {
                ...raw,
                instantly_email_id: providerMessageId,
                instantly_thread_id: externalThreadId,
                provider_response: sent.raw,
              };
              await assertEmergencyEpochUnchanged(
                svc,
                emergencyEpoch,
                "after_instantly_reply",
              );
            }
          } else if (provider === "outlook") {
            const meRes = await fetch(
              "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName",
              {
                headers: {
                  Authorization: `Bearer ${outlookConnection.accessToken}`,
                },
              },
            );
            const me = await meRes.json().catch(() => ({}));
            if (!meRes.ok) {
              throw new Error(`outlook_me_failed:${meRes.status}`);
            }
            fromAddress = normalizeEmail(me.mail || me.userPrincipalName);
            const outlook = await executeOutlookAcceptedTransport(
              svc,
              sendSlot,
              {
                access_token: outlookConnection.accessToken,
                subject,
                html: signedHTML,
                to,
                thread_id: thread.id,
              },
              {
                checkpoint: async (name) => {
                  await assertEmergencyEpochUnchanged(
                    svc,
                    emergencyEpoch,
                    name,
                  );
                },
                on_effect_start: () => {
                  providerEffectStarted = true;
                },
              },
            );
            outlookDraftId = outlook.immutable_draft_id;
            providerMessageId = outlook.provider_message_id;
            providerReferenceKind = "OUTLOOK_IMMUTABLE_DRAFT_ID";
            externalThreadId = outlook.conversation_id || externalThreadId;
            sendStatus = "scheduled";
            actualSentAt = null;
            raw = {
              ...raw,
              outlook_message_id: outlookDraftId,
              outlook_immutable_id: outlookDraftId,
              conversation_id: outlook.conversation_id,
              provider_acceptance_state: outlook.provider_acceptance_state,
              delivery_observed: outlook.delivery_observed,
              outlook_reconciliation: outlook.reconciliation,
            };
          } else if (provider === "resend") {
            const resendIdentity = signatureIdentity(
              "resend",
              String(thread.engine || ""),
              configuredSignatureEmail,
            );
            const fromSetting = resendFromSetting;
            const from = fromSetting.includes("<")
              ? fromSetting
              : `${resendIdentity.name} <${fromSetting}>`;
            fromAddress = mailboxFromSetting(fromSetting);
            const inboundDomain = Deno.env.get("RESEND_INBOUND_DOMAIN") ||
              "contact.cambra.global";
            const replyTo = `reply+${thread.id}@${inboundDomain}`;
            await assertEmergencyEpochUnchanged(
              svc,
              emergencyEpoch,
              "before_resend_send",
            );
            providerEffectStarted = true;
            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${resendKey}`,
                "Idempotency-Key": resendProviderIdempotencyKey,
              },
              body: JSON.stringify({
                from,
                to: [to],
                reply_to: replyTo,
                subject,
                text: signedText,
                html: signedHTML,
                tags: [{ name: "thread_id", value: thread.id }, {
                  name: "engine",
                  value: thread.engine,
                }],
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(`resend_send_failed:${res.status}`);
            }
            if (!String(data?.id || "").trim()) {
              throw new Error("resend_provider_receipt_required");
            }
            await assertEmergencyEpochUnchanged(
              svc,
              emergencyEpoch,
              "after_resend_send",
            );
            providerMessageId = String(data.id);
            providerReferenceKind = "RESEND_EMAIL_ID";
            raw = {
              ...raw,
              resend_id: providerMessageId,
              provider_acceptance_state: "ACCEPTED",
              delivery_observed: false,
            };
          }
        } catch (error: any) {
          outlookDraftId = String(
            error?.outlook_draft_id || outlookDraftId || "",
          );
          const emergencyRace =
            error?.code === "EMERGENCY_CONTROL_EPOCH_CHANGED" ||
            error?.code === "EMERGENCY_CONTROL_PAUSED";
          let transportContainment: any = null;
          let remoteInstantlyContainment: any = null;
          let outlookDraftContainment: any = null;
          if (emergencyRace && providerEffectStarted) {
            transportContainment = await containCommunicationTransport(
              svc,
              provider as "instantly" | "outlook" | "resend",
              "emergency_epoch_changed_during_send",
            ).catch((containmentError: any) => ({
              ok: false,
              error: String(containmentError?.message || containmentError)
                .slice(
                  0,
                  160,
                ),
            }));
            if (provider === "instantly") {
              remoteInstantlyContainment = await pauseAllInstantlyCampaigns(
                svc,
                "emergency_epoch_changed_during_send",
              ).catch((containmentError: any) => ({
                ok: false,
                error: String(containmentError?.message || containmentError)
                  .slice(
                    0,
                    160,
                  ),
              }));
            }
            if (provider === "outlook" && outlookDraftId) {
              outlookDraftContainment = await fetch(
                `https://graph.microsoft.com/v1.0/me/messages/${
                  encodeURIComponent(outlookDraftId)
                }`,
                {
                  method: "DELETE",
                  headers: {
                    Authorization: `Bearer ${outlookConnection.accessToken}`,
                    "Prefer": 'IdType="ImmutableId"',
                  },
                },
              ).then((response) => ({
                ok: response.ok || response.status === 404,
                status: response.status,
              })).catch((containmentError: any) => ({
                ok: false,
                error: String(containmentError?.message || containmentError)
                  .slice(
                    0,
                    160,
                  ),
              }));
            }
          }
          if (sendSlot?.acquired) {
            await markCommercialSendReviewRequired(svc, sendSlot, {
              blocker: String(
                error?.code || error?.message || "transport_failed",
              )
                .slice(0, 160),
            }).catch((reviewError: any) =>
              safeBestEffort(reviewError, {
                operation:
                  "commercialSendMessage.mark_transport_effect_review_required",
                fallback: null,
                severity: "critical",
              })
            );
          }
          await settlePaidOperation(svc, costReservation, {
            ok: false,
            usage_json: {
              thread_id: thread.id,
              provider_effect_started: providerEffectStarted,
              emergency_epoch_revision: emergencyEpoch.control_revision,
              transport_containment: transportContainment,
              instantly_remote_containment: remoteInstantlyContainment,
              outlook_draft_containment: outlookDraftContainment,
              error_code: String(
                error?.code || error?.message || "transport_failed",
              ).slice(0, 160),
            },
          }).catch((error: any) =>
            safeBestEffort(error, {
              operation: "commercialSendMessage",
              fallback: null,
              severity: "critical",
            })
          );
          throw Object.assign(
            new Error("send_effect_ambiguous_review_required"),
            {
              status: 409,
              cause: error,
              transport_containment: transportContainment,
              instantly_remote_containment: remoteInstantlyContainment,
              outlook_draft_containment: outlookDraftContainment,
            },
          );
        }
        try {
          raw = {
            ...raw,
            provider_receipt: {
              kind: providerReferenceKind,
              id: String(providerMessageId || ""),
            },
          };
          const message = await svc.entities.CommunicationMessage.create({
            thread_id: thread.id,
            direction: "outbound",
            channel: "email",
            provider,
            provider_message_id: String(providerMessageId || ""),
            idempotency_key: idempotency,
            sending_profile_key: sendingProfile?.profile_key ||
              thread.sending_profile_key || null,
            from_email: fromAddress,
            to_emails: [to],
            subject,
            text_body: signedText,
            classification,
            agent_name: String(body?.agent_name || "commercial_orchestrator"),
            policy_key: thread.policy_key,
            policy_version: thread.policy_version,
            approval_id: body?.approval_id || null,
            message_intent: String(body?.message_intent || action)
              .toUpperCase(),
            thread_context_snapshot_json: {
              thread_id: thread.id,
              engine: thread.engine,
              policy_key: thread.policy_key,
              policy_version: thread.policy_version,
              market_jurisdiction: jurisdiction || null,
            },
            send_status: sendStatus,
            sent_at: now,
            actual_sent_at: actualSentAt,
            quality_gate_json: quality,
            raw_event_json: raw,
          });
          if (sendSlot?.acquired) {
            // The immutable message receipt is the minimum durable proof that makes
            // a retry safe. Commit the claim before secondary thread projections.
            await commitCommercialSendSlot(svc, sendSlot, {
              provider_message_id: providerMessageId,
              provider_reference_id: providerMessageId,
              provider_reference_kind: providerReferenceKind,
              message_id: message.id,
            });
          }
          const threadPatch: any = {
            status: "awaiting_counterparty",
            external_provider: provider,
            last_message_at: now,
            next_action_at: body?.next_action_at || null,
          };
          if (externalThreadId) {
            threadPatch.external_thread_id = externalThreadId;
          }
          if (
            provider === "instantly" && sendingProfile?.external_campaign_id
          ) {
            threadPatch.external_campaign_id =
              sendingProfile.external_campaign_id;
          }
          if (externalLeadId) {
            threadPatch.external_lead_id = externalLeadId;
          }
          if (sendStatus === "sent") {
            threadPatch.last_outbound_at = now;
          }
          await svc.entities.CommunicationThread.update(thread.id, threadPatch);
          await settlePaidOperation(svc, costReservation, {
            ok: true,
            usage_json: {
              provider_message_id: providerMessageId,
              thread_id: thread.id,
            },
          });
          return serviceLevelResult(
            Response.json({
              ok: true,
              queued: sendStatus === "scheduled",
              message_id: message.id,
              provider_message_id: providerMessageId,
              provider,
              external_thread_id: externalThreadId,
              external_lead_id: externalLeadId,
            }),
            {
              source_refs: [
                { entity: "CommunicationMessage", id: message.id },
                { entity: "CommunicationThread", id: thread.id },
              ],
            },
          );
        } catch (error: any) {
          if (sendSlot?.acquired) {
            await markCommercialSendReviewRequired(svc, sendSlot, {
              blocker: String(
                error?.code || error?.message ||
                  "send_receipt_persistence_failed",
              ).slice(0, 160),
            }).catch((reviewError: any) =>
              safeBestEffort(reviewError, {
                operation:
                  "commercialSendMessage.mark_receipt_failure_review_required",
                fallback: null,
                severity: "critical",
              })
            );
          }
          await settlePaidOperation(svc, costReservation, {
            ok: false,
            usage_json: {
              thread_id: thread.id,
              provider_effect_started: true,
              error_code: "send_receipt_persistence_failed",
            },
          }).catch((settlementError: any) =>
            safeBestEffort(settlementError, {
              operation:
                "commercialSendMessage.settle_receipt_persistence_failure",
              fallback: null,
              severity: "critical",
            })
          );
          throw Object.assign(
            new Error("send_effect_ambiguous_review_required"),
            {
              status: 409,
              cause: error,
            },
          );
        }
      },
    );
  } catch (error: any) {
    console.error("commercialSendMessage failed", error);
    const safe = String(error?.message || "commercial_send_failed").slice(
      0,
      160,
    );
    return Response.json({ ok: false, error: safe }, {
      status: Number(error?.status || 500),
    });
  }
});
