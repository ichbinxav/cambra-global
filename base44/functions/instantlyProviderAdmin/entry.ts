import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  InstantlyOutboundProvider,
  INSTANTLY_CAMPAIGN_TEMPLATE_REVISION,
  instantlyProfileReady,
  instantlyProviderStatus,
  instantlyRequest,
} from "../../shared/outboundProvider.ts";
import { instantlySuperSearchPayload } from "../../shared/leadIntelligenceProvider.ts";
import {
  pauseAllInstantlyCampaigns,
  upsertInstantlyProviderState,
} from "../../shared/instantlyRuntime.ts";
import {
  reservePaidOperation,
  settlePaidOperation,
} from "../../shared/costGovernance.ts";

const CONFIRM_CREATE = "CREATE_CAMBRA_INSTANTLY_CAMPAIGN";
const CONFIRM_WEBHOOK = "REGISTER_CAMBRA_INSTANTLY_WEBHOOK";
const CONFIRM_WEBHOOK_TEST = "TEST_CAMBRA_INSTANTLY_WEBHOOK";
const CONFIRM_PAUSE = "PAUSE_CAMBRA_INSTANTLY";
const safeAccount = (account: any) => ({
  email: String(account?.email || account?.address || account?.eaccount || ""),
  status: account?.status ?? null,
  warmup_status: account?.warmup_status ?? null,
  warmup_score: account?.stat_warmup_score ?? null,
  setup_pending: account?.setup_pending ?? null,
  tracking_domain_status: account?.tracking_domain_status ?? null,
  daily_limit: account?.daily_limit ?? null,
  status_message_code: account?.status_message?.code ?? null,
});
const safeCampaign = (campaign: any) => ({
  id: String(campaign?.id || ""),
  name: String(campaign?.name || ""),
  status: campaign?.status ?? null,
  not_sending_status: campaign?.not_sending_status ?? null,
  daily_limit: campaign?.daily_limit ?? null,
  email_list: Array.isArray(campaign?.email_list) ? campaign.email_list : [],
  native_ai_agent_present: Boolean(campaign?.ai_sdr_id),
});
const safeWebhook = (webhook: any) => ({
  id: String(webhook?.id || ""),
  name: String(webhook?.name || ""),
  event_type: String(webhook?.event_type || ""),
  campaign: String(webhook?.campaign || ""),
  status: webhook?.status ?? null,
  timestamp_error: webhook?.timestamp_error ?? null,
  configured_header_names:
    webhook?.headers && typeof webhook.headers === "object"
      ? Object.keys(webhook.headers).sort()
      : [],
});

export async function handleInstantlyProviderAdmin(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    if (!gate.isAdmin)
      return Response.json(
        { ok: false, error: "admin_required" },
        { status: 403 },
      );
    const svc = base44.asServiceRole;
    const action = String(body.action || "status");
    const key = Deno.env.get("INSTANTLY_API_KEY") || "";
    const configured = instantlyProviderStatus(Boolean(key));
    const profiles = await svc.entities.OutboundSendingProfile.filter(
      { provider: "instantly" },
      "-created_date",
      100,
    ).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:[],severity:'secondary'}));
    const states = await svc.entities.CommercialProviderState.filter(
      { provider_key: "instantly", role: "outbound" },
      "-last_checked_at",
      1,
    ).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:[],severity:'secondary'}));
    const control =
      (
        await svc.entities.OutboundControl.filter(
          { control_key: "global" },
          "-created_date",
          1,
        ).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:[],severity:'secondary'}))
      )[0] || null;
    if (action === "status")
      return Response.json({
        ok: true,
        provider: {
          ...configured,
          ...(key ? states[0] || {} : {}),
          status: key ? states[0]?.status || "CONFIGURED" : "NOT_CONFIGURED",
          secret_present: Boolean(key),
          auth_test_pass: key ? states[0]?.auth_test_pass === true : false,
        },
        profiles: profiles.map((profile: any) => ({
          id: profile.id,
          profile_key: profile.profile_key,
          status: profile.status,
          domain: profile.domain,
          from_address: profile.from_address,
          current_daily_cap: profile.current_daily_cap,
          external_campaign_id: profile.external_campaign_id || null,
          webhook_status: profile.webhook_status || "NOT_CONFIGURED",
          ready: instantlyProfileReady(profile),
        })),
        control: {
          acquisition_enabled: control?.acquisition_enabled === true,
          instantly_enabled: control?.instantly_enabled === true,
        },
        secret_value_exposed: false,
      });
    if (!key) {
      await upsertInstantlyProviderState(svc, {
        status: "NOT_CONFIGURED",
        auth_test_pass: false,
        last_checked_at: new Date().toISOString(),
        last_error_code: "SECRET_MISSING",
      }).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:null,severity:'secondary'}));
      return Response.json(
        {
          ok: false,
          status: "NOT_CONFIGURED",
          error: "instantly_api_key_required",
          setup_required: true,
        },
        { status: 503 },
      );
    }
    const provider = new InstantlyOutboundProvider(key);
    if (action === "diagnose_supersearch") {
      const eventKey=`api:instantly:supersearch-capability:${crypto.randomUUID()}`;
      const reservation=await reservePaidOperation(svc,{event_key:eventKey,category:"api",provider:"instantly",source:"instantlyProviderAdmin",related_entity_type:"CommercialProviderState",related_entity_id:"instantly_supersearch"});
      const leadStates=await svc.entities.CommercialProviderState.filter({provider_key:"instantly_supersearch",role:"lead_intelligence"},"-last_checked_at",1).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:[],severity:'secondary'}));
      try{
        const capabilityPayload=instantlySuperSearchPayload({domains:["cambra.ai"],limit:1,one_lead_per_company:true});
        const preview=await instantlyRequest(key,"/supersearch-enrichment/preview-leads-from-supersearch",{method:"POST",body:{search_filters:capabilityPayload.search_filters}});
        const patch={provider_key:"instantly_supersearch",role:"lead_intelligence",status:"AUTHENTICATED",api_version:"v2",secret_present:true,auth_test_pass:true,last_checked_at:new Date().toISOString(),last_success_at:new Date().toISOString(),metrics_json:{supersearch_permission_verified:true,last_preview_count:Number(preview?.number_of_leads||0)},configuration_json:{official_preview_endpoint:true,official_count_endpoint:true,official_enrichment_endpoint:true,automatic_enrichment_enabled:false},last_error_code:""};
        const state=leadStates[0]?await svc.entities.CommercialProviderState.update(leadStates[0].id,patch):await svc.entities.CommercialProviderState.create(patch);
        await settlePaidOperation(svc,reservation,{ok:true,usage_json:{operation:"supersearch_capability_preview",returned:Number(preview?.number_of_leads||0),lead_data_persisted:false}});
        return Response.json({ok:true,status:"AUTHENTICATED",provider_state:state,supersearch_permission_verified:true,preview_count:Number(preview?.number_of_leads||0),lead_data_persisted:false,secret_value_exposed:false});
      }catch(error:any){
        await settlePaidOperation(svc,reservation,{ok:false,usage_json:{operation:"supersearch_capability_preview",error_code:String(error?.code||"INSTANTLY_SUPERSEARCH_FAILED")}}).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:null,severity:'secondary'}));
        const patch={provider_key:"instantly_supersearch",role:"lead_intelligence",status:error?.code==="INSTANTLY_UNAUTHORIZED"?"ERROR":"DEGRADED",api_version:"v2",secret_present:true,auth_test_pass:false,last_checked_at:new Date().toISOString(),metrics_json:{supersearch_permission_verified:false},configuration_json:{official_preview_endpoint:true,automatic_enrichment_enabled:false},last_error_code:String(error?.code||"INSTANTLY_SUPERSEARCH_FAILED")};
        const state=leadStates[0]?await svc.entities.CommercialProviderState.update(leadStates[0].id,patch):await svc.entities.CommercialProviderState.create(patch);
        return Response.json({ok:false,status:state.status,error:patch.last_error_code,supersearch_permission_verified:false,secret_value_exposed:false},{status:Number(error?.status||502)});
      }
    }
    if (action === "diagnose") {
      const reservation = await reservePaidOperation(svc, {
        event_key: `api:instantly:diagnose:${crypto.randomUUID()}`,
        category: "api",
        provider: "instantly",
        source: "instantlyProviderAdmin",
        related_entity_type: "CommercialProviderState",
        related_entity_id: states[0]?.id || "instantly",
      });
      try {
        const result = await provider.diagnose();
        const accounts = result.accounts.map(safeAccount),
          campaigns = result.campaigns.map(safeCampaign),
          webhooks = result.webhooks.map(safeWebhook);
        const configuredCampaignIds = new Set(
          profiles
            .map((profile: any) => String(profile.external_campaign_id || ""))
            .filter(Boolean),
        );
        const nativeAiConflicts = campaigns.filter(
          (campaign: any) =>
            configuredCampaignIds.has(campaign.id) &&
            campaign.native_ai_agent_present,
        );
        for (const profile of profiles) {
          const conflict = nativeAiConflicts.some(
            (campaign: any) =>
              campaign.id === String(profile.external_campaign_id || ""),
          );
          const configuredAccounts = (
            profile.provider_config_json?.account_emails || []
          ).map((value: any) => String(value).toLowerCase());
          const matched = accounts.filter((account: any) =>
            configuredAccounts.includes(account.email.toLowerCase()),
          );
          const minimumScore = Math.max(
            1,
            Math.min(
              100,
              Number(profile.provider_config_json?.minimum_warmup_score || 80),
            ),
          );
          const senderReady =
            configuredAccounts.length > 0 &&
            matched.length === configuredAccounts.length &&
            matched.every(
              (account: any) =>
                account.status === 1 &&
                account.warmup_status === 1 &&
                account.setup_pending === false &&
                Number(account.warmup_score) >= minimumScore,
            );
          await svc.entities.OutboundSendingProfile.update(profile.id, {
            provider_config_json: {
              ...(profile.provider_config_json || {}),
              minimum_warmup_score: minimumScore,
              sender_ready: senderReady,
              sender_health_evidence: matched,
              native_ai_conflict: conflict,
              native_ai_reply_enabled: false,
            },
            last_provider_health_at: new Date().toISOString(),
            ...(!senderReady || conflict
              ? {
                  status: "paused",
                  notes: conflict
                    ? "CAMBRA autonomous replies blocked: provider-native AI agent conflict detected."
                    : "Instantly sender readiness/warm-up gate is not yet proven.",
                }
              : {}),
          }).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:null,severity:'secondary'}));
        }
        const blocked = profiles.some((profile: any) => {
          const configured = (
            profile.provider_config_json?.account_emails || []
          ).map((value: any) => String(value).toLowerCase());
          const matched = accounts.filter((account: any) =>
            configured.includes(account.email.toLowerCase()),
          );
          const minimumScore = Math.max(
            1,
            Math.min(
              100,
              Number(profile.provider_config_json?.minimum_warmup_score || 80),
            ),
          );
          return (
            configured.length === 0 ||
            matched.length !== configured.length ||
            !matched.every(
              (account: any) =>
                account.status === 1 &&
                account.warmup_status === 1 &&
                account.setup_pending === false &&
                Number(account.warmup_score) >= minimumScore,
            )
          );
        });
        const state = await upsertInstantlyProviderState(svc, {
          status:
            nativeAiConflicts.length || blocked ? "DEGRADED" : "AUTHENTICATED",
          auth_test_pass: true,
          last_checked_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          accounts_json: { items: accounts, count: accounts.length },
          campaigns_json: { items: campaigns, count: campaigns.length },
          webhook_json: { items: webhooks, count: webhooks.length },
          configuration_json: {
            transport_role_only: true,
            api_version: "v2",
            mailbox_protocol_access: false,
            supersearch_enabled: false,
            native_ai_conflicts: nativeAiConflicts,
            sender_readiness_blocked: blocked,
          },
          last_error_code: nativeAiConflicts.length
            ? "NATIVE_AI_REPLY_CONFLICT"
            : blocked
              ? "SENDER_WARMUP_NOT_READY"
              : "",
        });
        await settlePaidOperation(svc, reservation, {
          ok: true,
          usage_json: {
            operation: "diagnose",
            accounts: accounts.length,
            campaigns: campaigns.length,
            webhooks: webhooks.length,
          },
        });
        return Response.json(
          {
            ok: nativeAiConflicts.length === 0,
            status:
              nativeAiConflicts.length || blocked
                ? "DEGRADED"
                : "AUTHENTICATED",
            provider_state: state,
            accounts,
            campaigns,
            webhooks,
            native_ai_conflicts: nativeAiConflicts,
            sender_readiness_blocked: blocked,
            secret_value_exposed: false,
          },
          { status: nativeAiConflicts.length ? 409 : 200 },
        );
      } catch (error: any) {
        await settlePaidOperation(svc, reservation, {
          ok: false,
          usage_json: {
            operation: "diagnose",
            error_code: String(error?.code || "INSTANTLY_DIAGNOSTIC_FAILED"),
          },
        }).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:null,severity:'secondary'}));
        await upsertInstantlyProviderState(svc, {
          status:
            error?.code === "INSTANTLY_UNAUTHORIZED" ? "ERROR" : "DEGRADED",
          auth_test_pass: false,
          last_checked_at: new Date().toISOString(),
          last_error_code: String(error?.code || "INSTANTLY_DIAGNOSTIC_FAILED"),
        }).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:null,severity:'secondary'}));
        return Response.json(
          {
            ok: false,
            status: "CONFIGURED",
            error: String(error?.code || "instantly_diagnostic_failed"),
          },
          { status: Number(error?.status || 502) },
        );
      }
    }
    const profileKey = String(body.profile_key || "");
    const profile =
      profiles.find((row: any) => row.profile_key === profileKey) || null;
    if (["create_campaign", "register_webhook", "test_webhook"].includes(action) && !profile)
      return Response.json(
        { ok: false, error: "instantly_profile_required" },
        { status: 409 },
      );
    if (action === "create_campaign") {
      if (body.confirmation !== CONFIRM_CREATE)
        return Response.json(
          {
            ok: false,
            error: "confirmation_required",
            required: CONFIRM_CREATE,
          },
          { status: 409 },
        );
      if (profile.status !== "paused")
        return Response.json(
          { ok: false, error: "profile_must_be_paused" },
          { status: 409 },
        );
      if (profile.external_campaign_id)
        return Response.json({
          ok: true,
          duplicate: true,
          campaign_id: profile.external_campaign_id,
        });
      const accounts = [
        ...new Set(
          (Array.isArray(body.account_emails)
            ? body.account_emails
            : profile.provider_config_json?.account_emails || []
          )
            .map((value: any) =>
              String(value || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean),
        ),
      ];
      if (!accounts.length)
        return Response.json(
          { ok: false, error: "sending_accounts_required" },
          { status: 409 },
        );
      const daily = Math.max(
        1,
        Math.min(
          15,
          Math.floor(
            Number(body.daily_limit || profile.current_daily_cap || 10),
          ),
        ),
      );
      const reservation = await reservePaidOperation(svc, {
        event_key: `api:instantly:create-campaign:${profile.profile_key}:${String(body.request_key || INSTANTLY_CAMPAIGN_TEMPLATE_REVISION).replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80)}`,
        category: "api",
        provider: "instantly",
        source: "instantlyProviderAdmin",
        related_entity_type: "OutboundSendingProfile",
        related_entity_id: profile.id,
      });
      try {
        const campaign = await provider.createCampaign({
          name: body.name || `CAMBRA ${profile.profile_key} CANARY`,
          language: body.language || "EN",
          timezone: body.timezone || "Europe/Paris",
          account_emails: accounts,
          daily_limit: daily,
        });
        await settlePaidOperation(svc, reservation, {
          ok: true,
          usage_json: {
            operation: "create_campaign",
            campaign_id: campaign?.id || null,
          },
        });
        await svc.entities.OutboundSendingProfile.update(profile.id, {
          external_campaign_id: String(campaign?.id || ""),
          provider_config_json: {
            ...(profile.provider_config_json || {}),
            account_emails: accounts,
            campaign_template_revision: INSTANTLY_CAMPAIGN_TEMPLATE_REVISION,
            transport_role_only: true,
            supersearch_enabled: false,
            minimum_warmup_score: Math.max(
              80,
              Number(body.minimum_warmup_score || 80),
            ),
            sender_ready: false,
            native_ai_reply_enabled: false,
          },
          webhook_status: "NOT_CONFIGURED",
          last_provider_health_at: new Date().toISOString(),
          notes:
            "Instantly campaign created in DRAFT; CAMBRA remains outbound-paused pending real sender readiness.",
        });
        await upsertInstantlyProviderState(svc, {
          status: "AUTHENTICATED",
          auth_test_pass: true,
          last_checked_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          last_error_code: "",
        });
        return Response.json({
          ok: true,
          campaign: {
            id: String(campaign?.id || ""),
            name: String(campaign?.name || ""),
            status: campaign?.status ?? 0,
          },
          activated: false,
          outbound_unchanged: true,
        });
      } catch (error: any) {
        await settlePaidOperation(svc, reservation, {
          ok: false,
          usage_json: {
            operation: "create_campaign",
            error_code: String(error?.code || "FAILED"),
          },
        }).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:null,severity:'secondary'}));
        throw error;
      }
    }
    if (action === "register_webhook") {
      if (body.confirmation !== CONFIRM_WEBHOOK)
        return Response.json(
          {
            ok: false,
            error: "confirmation_required",
            required: CONFIRM_WEBHOOK,
          },
          { status: 409 },
        );
      const rotationRequested = body.rotate_secret === true;
      const rotatedSecret = rotationRequested
        ? String(body.new_webhook_secret || "")
        : "";
      if (rotationRequested && !/^[A-Za-z0-9_-]{43,128}$/.test(rotatedSecret))
        return Response.json(
          { ok: false, error: "valid_rotated_webhook_secret_required" },
          { status: 400 },
        );
      const webhookSecret = rotationRequested
        ? rotatedSecret
        : Deno.env.get("INSTANTLY_WEBHOOK_SECRET") || "";
      if (!webhookSecret)
        return Response.json(
          {
            ok: false,
            error: "instantly_webhook_secret_required",
            setup_required: true,
          },
          { status: 503 },
        );
      const target = String(body.target_url || "").trim();
      if (!/^https:\/\//i.test(target))
        return Response.json(
          { ok: false, error: "https_webhook_target_required" },
          { status: 409 },
        );
      if (!profile.external_campaign_id)
        return Response.json(
          { ok: false, error: "instantly_campaign_required" },
          { status: 409 },
        );
      const existingWebhookId = String(
        profile.provider_config_json?.webhook_id || "",
      );
      const requestKey = String(body.request_key || "default")
        .replace(/[^a-zA-Z0-9._-]/g, "")
        .slice(0, 80);
      const reservation = await reservePaidOperation(svc, {
        event_key: `api:instantly:webhook:${profile.profile_key}:${requestKey}`,
        category: "api",
        provider: "instantly",
        source: "instantlyProviderAdmin",
        related_entity_type: "OutboundSendingProfile",
        related_entity_id: profile.id,
      });
      try {
        const webhookInput = {
          target_url: target,
          name: `CAMBRA ${profile.profile_key}`,
          campaign_id: profile.external_campaign_id,
          webhook_secret: webhookSecret,
        };
        const webhook = existingWebhookId
          ? await provider.updateWebhook(existingWebhookId, webhookInput)
          : await provider.createWebhook(webhookInput);
        const operation = existingWebhookId
          ? "update_webhook"
          : "create_webhook";
        await settlePaidOperation(svc, reservation, {
          ok: true,
          usage_json: {
            operation,
            webhook_id: webhook?.id || null,
          },
        });
        await svc.entities.OutboundSendingProfile.update(profile.id, {
          webhook_status:
            Number(webhook?.status) === 1 ? "ACTIVE" : "CONFIGURED",
          provider_config_json: {
            ...(profile.provider_config_json || {}),
            webhook_id: String(webhook?.id || ""),
            webhook_event_type: "all_events",
          },
          last_provider_health_at: new Date().toISOString(),
        });
        await upsertInstantlyProviderState(svc, {
          status: "AUTHENTICATED",
          auth_test_pass: true,
          last_checked_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          webhook_json: {
            id: String(webhook?.id || ""),
            event_type: "all_events",
            status: webhook?.status ?? null,
            campaign: String(profile.external_campaign_id),
          },
          last_error_code: "",
        });
        return Response.json({
          ok: true,
          webhook: safeWebhook(webhook),
          operation,
          rotation_applied: rotationRequested,
          secret_value_exposed: false,
          outbound_unchanged: true,
        });
      } catch (error: any) {
        await settlePaidOperation(svc, reservation, {
          ok: false,
          usage_json: {
            operation: existingWebhookId
              ? "update_webhook"
              : "create_webhook",
            error_code: String(error?.code || "FAILED"),
          },
        }).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:null,severity:'secondary'}));
        throw error;
      }
    }
    if (action === "test_webhook") {
      if (body.confirmation !== CONFIRM_WEBHOOK_TEST)
        return Response.json(
          {
            ok: false,
            error: "confirmation_required",
            required: CONFIRM_WEBHOOK_TEST,
          },
          { status: 409 },
        );
      const webhookId = String(profile.provider_config_json?.webhook_id || "");
      if (!webhookId || profile.webhook_status !== "ACTIVE")
        return Response.json(
          { ok: false, error: "active_instantly_webhook_required" },
          { status: 409 },
        );
      const reservation = await reservePaidOperation(svc, {
        event_key: `api:instantly:webhook-test:${profile.profile_key}:${crypto.randomUUID()}`,
        category: "api",
        provider: "instantly",
        source: "instantlyProviderAdmin",
        related_entity_type: "OutboundSendingProfile",
        related_entity_id: profile.id,
      });
      try {
        const result = await provider.testWebhook(webhookId);
        const passed =
          result?.success === true && Number(result?.status_code) >= 200 &&
          Number(result?.status_code) < 300;
        await settlePaidOperation(svc, reservation, {
          ok: passed,
          usage_json: {
            operation: "test_webhook",
            status_code: Number(result?.status_code || 0),
            response_time_ms: Number(result?.response_time_ms || 0),
          },
        });
        await svc.entities.OperationalLog.create({
          event_type: "instantly_webhook_delivery_test",
          message: passed
            ? "Instantly delivered an authenticated provider test to CAMBRA"
            : "Instantly webhook delivery test failed",
          data_json: {
            profile_key: profile.profile_key,
            webhook_id: webhookId,
            provider_test: true,
            success: passed,
            status_code: Number(result?.status_code || 0),
            response_time_ms: Number(result?.response_time_ms || 0),
            outbound_sent: false,
          },
          actor_email: gate.user?.email || "founder_admin",
          created_at: new Date().toISOString(),
        });
        return Response.json({
          ok: passed,
          provider_test: true,
          status_code: Number(result?.status_code || 0),
          response_time_ms: Number(result?.response_time_ms || 0),
          outbound_unchanged: true,
        }, { status: passed ? 200 : 502 });
      } catch (error: any) {
        await settlePaidOperation(svc, reservation, {
          ok: false,
          usage_json: {
            operation: "test_webhook",
            error_code: String(error?.code || "FAILED"),
          },
        }).catch((error:any)=>safeBestEffort(error,{operation:'instantlyProviderAdmin',fallback:null,severity:'secondary'}));
        throw error;
      }
    }
    if (action === "pause") {
      if (body.confirmation !== CONFIRM_PAUSE)
        return Response.json(
          {
            ok: false,
            error: "confirmation_required",
            required: CONFIRM_PAUSE,
          },
          { status: 409 },
        );
      if (control)
        await svc.entities.OutboundControl.update(control.id, {
          instantly_enabled: false,
          paused_reason: "paused_by_admin",
        });
      const result = await pauseAllInstantlyCampaigns(
        svc,
        "founder_provider_pause",
      );
      return Response.json(
        { ok: result.ok, local_stop_applied: true, remote_pause: result },
        { status: result.ok ? 200 : 502 },
      );
    }
    return Response.json(
      {
        ok: false,
        error: "unsupported_action",
        actions: [
          "status",
          "diagnose",
          "diagnose_supersearch",
          "create_campaign",
          "register_webhook",
          "test_webhook",
          "pause",
        ],
      },
      { status: 400 },
    );
  } catch (error: any) {
    console.error(
      "instantlyProviderAdmin failed",
      String(error?.code || error?.message || "unknown"),
    );
    return Response.json(
      {
        ok: false,
        error: String(
          error?.code || error?.message || "instantly_provider_admin_failed",
        ).slice(0, 200),
        provider_detail:
          error?.name === "InstantlyApiError"
            ? String(error?.message || "provider_request_failed").slice(0, 300)
            : undefined,
      },
      { status: Number(error?.status || 500) },
    );
  }
}
