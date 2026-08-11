import { buildCommercialStrategy } from "./commercialStrategy.ts";
import {
  classifyHardStop,
  routineActionAllowed,
} from "./commercialAutonomy.ts";
import {
  instantlyLeadDefinition,
  instantlyReplyDefinition,
} from "./outboundProvider.ts";

export const COMMERCIAL_DRY_RUN_VERSION = "commercial-dry-run-1.0.0";

function deterministicReplyClassification(text: any) {
  const value = String(text || "").toLowerCase();
  const hard = classifyHardStop(value);
  if (hard)
    return {
      classification: hard,
      confidence: 1,
      next_best_action: "stop",
      response_required: false,
    };
  if (
    /wrong person|not the right person|persona equivocada|mauvais interlocuteur/.test(
      value,
    )
  )
    return {
      classification: "wrong_person",
      confidence: 0.99,
      next_best_action: "request_referral",
      response_required: true,
    };
  if (/meeting|call|llamada|reuni[oó]n|rendez-vous/.test(value))
    return {
      classification: "meeting",
      confidence: 0.98,
      next_best_action: "meeting_offer",
      response_required: true,
    };
  if (/interested|interesting|interesad|intéress/.test(value))
    return {
      classification: "interested",
      confidence: 0.98,
      next_best_action: "routine_reply",
      response_required: true,
    };
  if (/\?|question|duda|pregunta/.test(value))
    return {
      classification: "question",
      confidence: 0.9,
      next_best_action: "routine_reply",
      response_required: true,
    };
  return {
    classification: "UNCERTAIN",
    confidence: 0.35,
    next_best_action: "human_review",
    response_required: false,
  };
}

export function commercialExecutionDryRun(input: any) {
  const lead = input?.lead || {};
  const policy = input?.policy || {};
  const profile = input?.profile || {};
  const strategy = buildCommercialStrategy(lead, policy, {
    suppressed: input?.suppressed === true,
    language_override: input?.language_override,
  });
  const subject = String(
    input?.subject ||
      `CAMBRA Analyzer for ${lead.company_name || "your payments setup"}`,
  );
  const body = String(
    input?.body ||
      `Would it be useful to validate the opportunity with CAMBRA's free Analyzer using your own payment evidence?`,
  );
  const adapterPayload = instantlyLeadDefinition({
    campaign_id: profile.external_campaign_id || "DRY_RUN_CAMPAIGN",
    to: lead.contact_email,
    contact_name: lead.contact_full_name,
    contact_title: lead.contact_title,
    company_name: lead.company_name,
    company_domain: lead.company_domain,
    personalization: strategy.reason_to_contact,
    subject,
    text: body,
    thread_id: "DRY_RUN_THREAD",
    idempotency_key: `dry-run:${lead.id || "fixture"}:${policy.version || "fixture"}`,
  });
  const simulatedInbound = {
    event_type: "reply_received",
    lead_email: lead.contact_email,
    email_account: profile.from_address || "dry-run@cambra.invalid",
    campaign_id: adapterPayload.campaign,
    email_id: "DRY_RUN_INBOUND",
    reply_subject: `Re: ${subject}`,
    reply_text: String(
      input?.simulated_reply ||
        "This is interesting. Could you explain what the free Analyzer needs?",
    ),
  };
  const classification = deterministicReplyClassification(
    simulatedInbound.reply_text,
  );
  const authority =
    classification.classification === "UNCERTAIN"
      ? { allowed: false, reason: "uncertain_requires_human_review" }
      : routineActionAllowed(
          policy,
          classification.next_best_action,
          classification.classification,
        );
  const replyPayload =
    classification.response_required && authority.allowed
      ? instantlyReplyDefinition({
          eaccount: simulatedInbound.email_account,
          reply_to_uuid: simulatedInbound.email_id,
          subject: simulatedInbound.reply_subject,
          text: "CAMBRA would first use the free Analyzer to validate the opportunity from your own evidence; no savings claim is assumed.",
          html: "",
        })
      : null;
  const blockers = [...strategy.blockers];
  if (strategy.status !== "READY") blockers.push("p7_strategy_not_ready");
  if (profile.provider !== "instantly")
    blockers.push("instantly_profile_required");
  if (!profile.external_campaign_id)
    blockers.push("instantly_campaign_required");
  if (!lead.contact_email) blockers.push("recipient_required");
  if (!authority.allowed)
    blockers.push(authority.reason || "conversation_policy_blocked");
  return {
    ok: blockers.length === 0,
    dry_run: true,
    real_provider_call: false,
    unsolicited_send_count: 0,
    version: COMMERCIAL_DRY_RUN_VERSION,
    canonical_lead: {
      id: lead.id || null,
      company_name: lead.company_name || "",
      contact_email: lead.contact_email || "",
      reservoir_state: lead.reservoir_state || "",
    },
    p7_strategy: strategy,
    p8_action: {
      type: "QUEUE_INITIAL_OUTREACH",
      provider: "instantly",
      execution_state: blockers.length ? "BLOCKED" : "WOULD_EXECUTE",
      approval_required: strategy.approval_required === true,
    },
    policy: {
      key: policy.policy_key || "",
      version: policy.version || "",
      mode: policy.mode || "",
      daily_send_limit: policy.daily_send_limit ?? null,
    },
    instantly_adapter_payload: adapterPayload,
    conversation_mapping: {
      provider: "instantly",
      external_campaign_id: adapterPayload.campaign,
      cambra_thread_id: "DRY_RUN_THREAD",
    },
    simulated_inbound: simulatedInbound,
    classification,
    next_best_action: classification.next_best_action,
    reply_payload: replyPayload,
    blockers: [...new Set(blockers)],
  };
}
