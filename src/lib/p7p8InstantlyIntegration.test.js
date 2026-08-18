import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  instantlyCampaignDefinition,
  instantlyEventKey,
  instantlyLeadDefinition,
  InstantlyOutboundProvider,
  instantlyProfileReady,
  instantlyProviderStatus,
  instantlyReplyDefinition,
  instantlyRequest,
  normalizeInstantlyEvent,
} from "../../base44/shared/outboundProvider.ts";
import { providerSecretMatches } from "../../base44/shared/inboundConversationProvider.ts";
import { buildCommercialStrategy } from "../../base44/shared/commercialStrategy.ts";
import { commercialExecutionDryRun } from "../../base44/shared/commercialDryRun.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const source = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const now = new Date(Date.now() - 60_000).toISOString();
const lead = {
  id: "lead-1",
  company_name: "Verified Shop",
  company_domain: "verified.example",
  contact_full_name: "Pat Example",
  contact_email: "pat@verified.example",
  contact_title: "Payments Director",
  country: "ES",
  industry: "ecommerce",
  source: "canonical_test",
  canonical_company_key: "domain:verified.example",
  score: 88,
  score_breakdown_json: {
    evidence_confidence: .9,
    opportunity_score: 82,
    breakdown: { commerce_fit: 20, economic_potential: 20 },
    signals: { commerce_platform: "verified_fixture" },
  },
  reservoir_state: "ready",
  revenue_stage: "outreach_ready",
  outreach_eligibility: "ELIGIBLE",
  compliance_status: "CLEARED",
  contactability: "PROFESSIONAL_VERIFIED",
  estimation_status: "PRE_ANALYSIS_ESTIMATE",
};
const policy = {
  policy_key: "merchant-canary",
  version: "v1",
  engine: "merchant_acquisition",
  status: "active",
  mode: "CANARY",
  daily_send_limit: 10,
  min_lead_score: 70,
  min_opportunity_score: 70,
  min_confidence: .7,
  countries: ["ES"],
  languages: ["es", "en"],
  max_followups: 2,
  followup_intervals_hours: [72, 120],
  allowed_routine_actions: ["routine_reply", "request_referral"],
  prohibited_actions: ["final_pricing_acceptance"],
  autonomous_replies_enabled: true,
  meeting_proposals_enabled: false,
  risk_controls_json: { provider_ai_reply: false },
  approved_at: now,
  approved_by: "founder",
  effective_at: now,
};
const profile = {
  provider: "instantly",
  profile_key: "instantly:canary",
  domain: "outbound.example",
  from_address: "sender@outbound.example",
  status: "warming",
  current_daily_cap: 10,
  external_campaign_id: "campaign-1",
  webhook_status: "ACTIVE",
  provider_config_json: {
    account_emails: ["sender@outbound.example"],
    sender_ready: true,
    native_ai_conflict: false,
    native_ai_reply_enabled: false,
  },
};

describe("P7/P8 provider-agnostic Instantly execution seal", () => {
  it("keeps missing Instantly credentials explicitly NOT_CONFIGURED and profile readiness fail-closed", () => {
    expect(instantlyProviderStatus(false)).toEqual({
      status: "NOT_CONFIGURED",
      configured: false,
      reason: "secret_missing",
    });
    expect(instantlyProfileReady(profile)).toBe(true);
    expect(
      instantlyProfileReady({ ...profile, webhook_status: "NOT_CONFIGURED" }),
    ).toBe(false);
    expect(
      instantlyProfileReady({
        ...profile,
        provider_config_json: {
          ...profile.provider_config_json,
          native_ai_conflict: true,
        },
      }),
    ).toBe(false);
  });

  it("builds a paused low-volume campaign whose content comes only from CAMBRA variables", () => {
    const campaign = instantlyCampaignDefinition({
      name: "CAMBRA ES CANARY",
      timezone: "Europe/Madrid",
      account_emails: ["sender@outbound.example"],
      daily_limit: 99,
    });
    expect(campaign.daily_limit).toBe(15);
    expect(campaign.campaign_schedule.schedules[0].timezone).toBe(
      "Europe/Belgrade",
    );
    expect(campaign.stop_on_reply).toBe(true);
    expect(campaign.stop_on_auto_reply).toBe(true);
    expect(campaign.open_tracking).toBe(false);
    expect(campaign.link_tracking).toBe(false);
    expect(campaign.campaign_schedule.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(campaign.sequences[0].steps[0]).toMatchObject({
      pre_delay: 1,
      pre_delay_unit: "days",
    });
    expect(campaign.sequences[0].steps[0].variants[0]).toMatchObject({
      subject: "{{cambra_subject}}",
      body: "{{cambra_body}}",
    });
  });

  it("maps initial leads and replies without making provider IDs canonical identity", () => {
    const initial = instantlyLeadDefinition({
      campaign_id: "campaign-1",
      to: lead.contact_email,
      contact_name: lead.contact_full_name,
      company_name: lead.company_name,
      company_domain: lead.company_domain,
      subject: "Subject",
      text: "Body",
      thread_id: "thread-1",
      idempotency_key: "send-1",
    });
    expect(initial).toMatchObject({
      campaign: "campaign-1",
      email: "pat@verified.example",
      skip_if_in_campaign: true,
      verify_leads_on_import: true,
      custom_variables: {
        cambra_thread_id: "thread-1",
        cambra_idempotency_key: "send-1",
        cambra_message_source: "CAMBRA",
      },
    });
    expect(
      instantlyReplyDefinition({
        eaccount: "sender@outbound.example",
        reply_to_uuid: "email-1",
        subject: "Re: Subject",
        text: "Reply",
      }),
    ).toMatchObject({
      eaccount: "sender@outbound.example",
      reply_to_uuid: "email-1",
      body: { text: "Reply" },
    });
  });

  it("uses the official adapter endpoints and bounded retry for transient provider failure", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "rate" }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    ).mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(instantlyRequest("secret", "/accounts?limit=1", {}, fetcher))
      .resolves.toEqual({ items: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const calls = [];
    const provider = new InstantlyOutboundProvider(
      "secret",
      async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: "external-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    await provider.queueInitial({
      campaign_id: "campaign-1",
      to: lead.contact_email,
      subject: "S",
      text: "B",
      thread_id: "thread-1",
      idempotency_key: "key-1",
    });
    await provider.sendReply({
      eaccount: "sender@outbound.example",
      reply_to_uuid: "external-inbound",
      subject: "Re: S",
      text: "B",
    });
    await provider.updateWebhook("webhook-1", {
      target_url: "https://example.com/hook",
      name: "CAMBRA hook",
      campaign_id: "campaign-1",
      webhook_secret: "signing-secret",
    });
    await provider.testWebhook("webhook-1");
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.instantly.ai/api/v2/leads",
      "https://api.instantly.ai/api/v2/emails/reply",
      "https://api.instantly.ai/api/v2/webhooks/webhook-1",
      "https://api.instantly.ai/api/v2/webhooks/webhook-1/test",
    ]);
    expect(JSON.parse(calls[2].init.body)).toMatchObject({
      event_type: "all_events",
      headers: { "x-cambra-instantly-secret": "signing-secret" },
    });
  });

  it("normalizes nested and aliased webhook payloads and produces deterministic dedupe keys", async () => {
    const raw = {
      event_type: "email_reply_received",
      data: {
        timestamp: "2026-08-11T12:00:00.000Z",
        campaign_id: "campaign-1",
        lead_email: "PAT@VERIFIED.EXAMPLE",
        email_account: "sender@outbound.example",
        email_id: "email-1",
        reply_text: "Interested",
      },
    };
    expect(normalizeInstantlyEvent(raw)).toMatchObject({
      event_type: "reply_received",
      campaign_id: "campaign-1",
      lead_email: "pat@verified.example",
      message_id: "email-1",
    });
    expect(await instantlyEventKey(raw)).toBe(await instantlyEventKey(raw));
    expect(
      await instantlyEventKey({
        ...raw,
        data: { ...raw.data, email_id: "email-2" },
      }),
    ).not.toBe(await instantlyEventKey(raw));
    expect(
      normalizeInstantlyEvent({
        event_type: "reply",
        data: { email_id: "email-1", lead_email: "a@example.com" },
      }).timestamp,
    ).toBe("");
    await expect(
      instantlyEventKey({
        event_type: "reply",
        data: { email_id: "email-1", lead_email: "a@example.com" },
      }),
    ).rejects.toThrow("INSTANTLY_EVENT_TIMESTAMP_REQUIRED");
    await expect(
      instantlyEventKey({
        event_type: "reply",
        data: {
          timestamp: "2026-08-11T12:00:00.000Z",
          lead_email: "a@example.com",
        },
      }),
    ).rejects.toThrow("INSTANTLY_EVENT_MESSAGE_ID_REQUIRED");
  });

  it("validates webhook shared secrets without exposing or comparing plaintext directly", async () => {
    await expect(providerSecretMatches("correct", "correct")).resolves.toBe(
      true,
    );
    await expect(providerSecretMatches("correct", "wrong")).resolves.toBe(
      false,
    );
    await expect(providerSecretMatches("", "")).resolves.toBe(false);
  });

  it("persists the P6→P7 decision as an evidence-backed strategy before P8 execution", () => {
    const strategy = buildCommercialStrategy(lead, policy);
    expect(strategy).toMatchObject({
      status: "READY",
      lead_id: "lead-1",
      market: "ES",
      language: "es",
      strategy_version: "commercial-strategy-1.0.0",
    });
    expect(strategy.supporting_evidence_json.length).toBeGreaterThan(0);
    expect(strategy.commercial_hypothesis).not.toMatch(
      /guarantee|known savings/i,
    );
  });

  it("proves the controlled end-to-end dry run with zero provider calls and a reply payload", () => {
    const result = commercialExecutionDryRun({
      lead,
      policy,
      profile,
      simulated_reply: "This is interesting. What does the Analyzer need?",
    });
    expect(result).toMatchObject({
      ok: true,
      dry_run: true,
      real_provider_call: false,
      unsolicited_send_count: 0,
      next_best_action: "routine_reply",
      classification: { classification: "interested" },
    });
    expect(result.p8_action.execution_state).toBe("WOULD_EXECUTE");
    expect(result.reply_payload.reply_to_uuid).toBe("DRY_RUN_INBOUND");
    const uncertain = commercialExecutionDryRun({
      lead,
      policy,
      profile,
      simulated_reply: "Received.",
    });
    expect(uncertain).toMatchObject({
      ok: false,
      next_best_action: "human_review",
      classification: { classification: "UNCERTAIN" },
    });
    expect(uncertain.reply_payload).toBeNull();
  });

  it("keeps webhook, reconciliation, replay, race and emergency paths explicit in production code", () => {
    const webhook = source("base44/functions/instantlyWebhook/entry.ts");
    const events = source("base44/shared/outboundProviderEventProcessing.ts");
    const reconcile = source(
      "base44/shared/logical/instantlyReconciliationWorker.ts",
    );
    const send = source("base44/functions/commercialSendMessage/entry.ts");
    // FCTRL-J: handler extracted to the shared core for behavior testing.
    const emergency = source("base44/functions/emergencyControlAdmin/entry.ts") +
      source("base44/shared/emergencyControlAdminCore.ts");
    expect(webhook.indexOf("if(!await providerSecretMatches")).toBeLessThan(
      webhook.indexOf("const base44=createClientFromRequest"),
    );
    for (
      const token of [
        "PENDING_RETRY",
        "DEAD_LETTER",
        "DUPLICATE_EVENT_LEDGER_ROW",
        "commercialReplyAgent",
        "ContactSuppression",
        "lead_out_of_office",
      ]
    ) expect(events).toContain(token);
    expect(reconcile).toContain("bounded_email_scan");
    expect(reconcile).toContain("native_ai_conflict");
    expect(reconcile).toContain("INSTANTLY_RECONCILIATION_COST_FLOOR_MINOR=1");
    expect(reconcile).toContain(
      "amount_minor:INSTANTLY_RECONCILIATION_COST_FLOOR_MINOR",
    );
    expect(send).toContain("follow_up_cancelled_by_new_reply");
    expect(send).toContain("follow_up_cancelled_by_meeting_or_closed_state");
    expect(emergency).toContain("pauseAllInstantlyCampaigns");
  });

  it("hosts the new routes inside already-deployed functions when the Base44 function quota is saturated", () => {
    const adminHost = source("base44/functions/outboundControlAdmin/entry.ts");
    const webhookHost = source(
      "base44/functions/resendInboundWebhook/entry.ts",
    );
    const workerHost = source(
      "base44/functions/processWebhookDeadLetters/entry.ts",
    );
    for (
      const token of [
        "handleInstantlyProviderAdmin",
        "handleCommercialExecutionDryRun",
        "handleCommercialStrategyAgent",
        "instantly_status",
        "commercial_dry_run",
      ]
    ) expect(adminHost).toContain(token);
    expect(webhookHost.indexOf("req.headers.get('x-cambra-instantly-secret')"))
      .toBeLessThan(webhookHost.indexOf("const raw = await req.text()"));
    expect(webhookHost).toContain("processInstantlyProviderEvent");
    expect(workerHost).toContain("handleInstantlyProviderEventRetryWorker");
    expect(workerHost).toContain("handleInstantlyReconciliationWorker");
    expect(workerHost).toMatch(/host_worker_fallback:\s*true/);
  });

  it("keeps Apollo and Instantly behind replaceable provider contracts and production calls cost-gated", () => {
    const leads = source("base44/shared/leadIntelligenceProvider.ts");
    const outbound = source("base44/shared/outboundProvider.ts");
    expect(leads).toContain("interface LeadIntelligenceProvider");
    expect(leads).toContain("ApolloLeadProvider");
    expect(leads).toContain("InstantlySuperSearchLeadProvider");
    expect(outbound).toContain("interface OutboundProvider");
    expect(outbound).toContain("reservePaidOperation");
    const discovery = source("base44/functions/leadDiscoveryAgent/entry.ts");
    const contactResolution = source(
      "base44/functions/leadEnrichmentAgent/entry.ts",
    );
    expect(discovery).toContain("providerAdapter.searchCompanies");
    expect(discovery).not.toContain("providerAdapter.searchPeople");
    expect(discovery).not.toContain("mixed_people/api_search");
    expect(contactResolution).toContain('operation !== "CONTACT_RESOLUTION"');
    expect(contactResolution).toContain("mixed_people/api_search");
    expect(contactResolution).toContain("evaluateContactResolutionEligibility");
    for (
      const file of [
        "base44/functions/commercialSendMessage/entry.ts",
        "base44/shared/logical/instantlyProviderAdmin.ts",
        "base44/shared/logical/instantlyReconciliationWorker.ts",
        "base44/functions/outboundControlAdmin/entry.ts",
      ]
    ) expect(source(file)).toContain("reservePaidOperation");
    expect(source("base44/shared/logical/commercialExecutionDryRun.ts")).not
      .toContain("INSTANTLY_API_KEY");
  });
});
