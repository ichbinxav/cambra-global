import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { evaluateCommercialGoLiveReadiness } from "../../shared/commercialActivationRuntime.ts";
import { handleGoLiveControlAdmin } from "../goLiveControlAdmin/entry.ts";
import { handleInstantlyProviderAdmin } from "../instantlyProviderAdmin/entry.ts";
import { handleCommercialExecutionDryRun } from "../commercialExecutionDryRun/entry.ts";
import { handleCommercialStrategyAgent } from "../commercialStrategyAgent/entry.ts";
import { handleBackfillLegacySendingProfiles } from "../backfillLegacySendingProfiles/entry.ts";
import { handleCommercialGoLiveReadiness } from "../commercialGoLiveReadiness/entry.ts";
import {
  InstantlyOutboundProvider,
  instantlyProfileReady,
} from "../../shared/outboundProvider.ts";
import {
  pauseAllInstantlyCampaigns,
  upsertInstantlyProviderState,
} from "../../shared/instantlyRuntime.ts";
import {
  reservePaidOperation,
  settlePaidOperation,
} from "../../shared/costGovernance.ts";

const START_SCOPE: Record<string, string> = {
  start_premium: "outlook",
  start_volume: "resend",
  start_instantly: "instantly",
  start_all: "all",
};
const GO_LIVE_ACTIONS = new Set([
  "status",
  "verify_runtime",
  "configure_cost_budget",
  "configure_sending_profile",
  "enable_sending_profile_warmup",
  "pause_sending_profile",
  "clear_cost_emergency_stop",
  "cost_kill_switch_drill",
  "emergency_drill",
  "verify_founder_control",
]);
const INSTANTLY_ADMIN_ACTIONS = new Set([
  "instantly_status",
  "instantly_diagnose",
  "instantly_diagnose_supersearch",
  "instantly_create_campaign",
  "instantly_register_webhook",
  "instantly_pause",
]);

function forwardedRequest(req: Request, body: any) {
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(body),
  });
}

Deno.serve(async (req) => {
  const routedBody = await req.clone().json().catch(() => ({}));
  const routedAction = String(routedBody?.action || "");
  if (INSTANTLY_ADMIN_ACTIONS.has(routedAction))
    return handleInstantlyProviderAdmin(
      forwardedRequest(req, {
        ...routedBody,
        action: routedAction.replace(/^instantly_/, ""),
      }),
    );
  if (routedAction === "commercial_dry_run")
    return handleCommercialExecutionDryRun(forwardedRequest(req, routedBody));
  if (routedAction === "commercial_strategy")
    return handleCommercialStrategyAgent(forwardedRequest(req, routedBody));
  if (routedAction === "backfill_legacy_sending_profiles")
    return handleBackfillLegacySendingProfiles(forwardedRequest(req, routedBody));
  if (routedAction === "commercial_go_live_readiness")
    return handleCommercialGoLiveReadiness(forwardedRequest(req, routedBody));
  if (GO_LIVE_ACTIONS.has(routedAction)) return handleGoLiveControlAdmin(req);
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
    const rows = await svc.entities.OutboundControl.filter(
      { control_key: "global" },
      "-created_date",
      1,
    ).catch(() => []);
    const control = rows[0];
    if (!control)
      return Response.json(
        { ok: false, error: "outbound_control_missing" },
        { status: 409 },
      );
    const action = String(body?.action || "");
    const now = new Date().toISOString();
    let patch: any = {};

    if (action === "preflight") {
      const readiness = await evaluateCommercialGoLiveReadiness(svc, {
        policy_id: body?.policy_id,
        policy_ids: body?.policy_ids,
        provider_scope: body?.provider_scope,
        final_sha: body?.final_sha,
      });
      const preflight = {
        ...readiness,
        requested_by: String(gate.user?.email || gate.user?.id || "admin"),
      };
      await svc.entities.OutboundControl.update(control.id, {
        preflight_status: readiness.allowed ? "PASS" : "BLOCKED",
        preflight_hash: readiness.preflight_hash || null,
        preflight_policy_id: readiness.policy_id || null,
        preflight_policy_ids: readiness.policy_ids || [],
        preflight_provider_scope: readiness.provider_scope,
        preflight_checked_at: readiness.checked_at,
        preflight_expires_at: readiness.expires_at || null,
        preflight_json: preflight,
      });
      for (const policyId of readiness.policy_ids || [])
        await svc.entities.CommercialPolicy.update(policyId, {
          activation_readiness_snapshot_json: preflight,
        }).catch(() => null);
      await svc.entities.OperationalLog.create({
        event_type: "commercial_go_live_preflight",
        message: readiness.allowed
          ? "CANARY preflight passed"
          : "CANARY preflight blocked",
        data_json: {
          allowed: readiness.allowed,
          blockers: readiness.blockers,
          preflight_hash: readiness.preflight_hash || null,
          policy_ids: readiness.policy_ids || [],
          provider_scope: readiness.provider_scope,
        },
        actor_email: String(gate.user?.email || ""),
        created_at: readiness.checked_at,
      }).catch(() => null);
      return Response.json(
        {
          ok: readiness.allowed,
          dry_run: true,
          outbound_unchanged: true,
          ...readiness,
        },
        { status: readiness.allowed ? 200 : 409 },
      );
    }
    if (action === "exercise_controls") {
      if (body?.confirmation !== "EXERCISE_FOUNDER_CANARY_CONTROL")
        return Response.json(
          { ok: false, error: "exercise_confirmation_required" },
          { status: 409 },
        );
      if (control.acquisition_enabled === true)
        return Response.json(
          { ok: false, error: "exercise_requires_outbound_paused" },
          { status: 409 },
        );
      const readiness = await evaluateCommercialGoLiveReadiness(svc, {
        policy_ids: body.policy_ids || [],
        provider_scope: String(body.provider_scope || "all"),
        final_sha: body.final_sha,
      });
      await svc.entities.OperationalLog.create({
        event_type: "commercial_canary_control_exercised",
        message:
          "Founder exercised start/pause/resume control path without enabling outbound",
        data_json: {
          provider_scope: String(body.provider_scope || "all"),
          readiness_allowed: readiness.allowed,
          blockers: readiness.blockers,
          start_requires_confirmation: true,
          pause_available: true,
          resume_requires_fresh_preflight: true,
          no_message_sent: true,
        },
        actor_email: String(gate.user?.email || ""),
        created_at: now,
      }).catch(() => null);
      return Response.json({
        ok: true,
        exercise: true,
        no_message_sent: true,
        readiness,
        capabilities: {
          start_canary: true,
          change_limits: true,
          pause: true,
          resume_with_fresh_preflight: true,
          inspect_blockers: true,
        },
      });
    }
    if (START_SCOPE[action]) {
      const providerScope = START_SCOPE[action];
      const requestedHash = String(body?.preflight_hash || "");
      if (body?.confirmation !== "START_CANARY_OUTBOUND")
        return Response.json(
          { ok: false, error: "start_confirmation_required" },
          { status: 409 },
        );
      if (!requestedHash)
        return Response.json(
          { ok: false, error: "preflight_hash_required" },
          { status: 409 },
        );
      if (
        control.preflight_status !== "PASS" ||
        control.preflight_hash !== requestedHash ||
        control.preflight_provider_scope !== providerScope
      )
        return Response.json(
          { ok: false, error: "matching_preflight_required" },
          { status: 409 },
        );
      if (
        !control.preflight_expires_at ||
        Date.parse(control.preflight_expires_at) <= Date.now()
      )
        return Response.json(
          { ok: false, error: "preflight_expired" },
          { status: 409 },
        );

      const readiness = await evaluateCommercialGoLiveReadiness(svc, {
        policy_ids:
          control.preflight_policy_ids ||
          [control.preflight_policy_id].filter(Boolean),
        provider_scope: providerScope,
        final_sha:
          control.preflight_json?.go_live?.final_sha ||
          control.preflight_json?.evidence?.go_live?.final_sha,
      });
      if (!readiness.allowed)
        return Response.json(
          {
            ok: false,
            error: "preflight_recheck_blocked",
            blockers: readiness.blockers,
          },
          { status: 409 },
        );
      if (readiness.preflight_hash !== requestedHash)
        return Response.json(
          {
            ok: false,
            error: "preflight_state_changed",
            expected_hash: readiness.preflight_hash,
          },
          { status: 409 },
        );
      if (["start_instantly", "start_all"].includes(action)) {
        const apiKey = Deno.env.get("INSTANTLY_API_KEY") || "";
        if (!apiKey)
          return Response.json(
            { ok: false, error: "instantly_api_key_required" },
            { status: 503 },
          );
        const keys = new Set(
          (readiness.evidence?.policies || []).flatMap(
            (policy: any) => policy.sending_profile_keys || [],
          ),
        );
        const profiles = (
          await svc.entities.OutboundSendingProfile.filter(
            { provider: "instantly" },
            "-created_date",
            100,
          ).catch(() => [])
        ).filter(
          (profile: any) =>
            keys.has(profile.profile_key) && instantlyProfileReady(profile),
        );
        if (!profiles.length)
          return Response.json(
            { ok: false, error: "ready_instantly_profile_required" },
            { status: 409 },
          );
        const provider = new InstantlyOutboundProvider(apiKey);
        const activated = [];
        for (const campaignId of [
          ...new Set(
            profiles
              .map((profile: any) => String(profile.external_campaign_id))
              .filter(Boolean),
          ),
        ]) {
          const reservation = await reservePaidOperation(svc, {
            event_key: `api:instantly:activate:${campaignId}:${requestedHash}`,
            category: "api",
            provider: "instantly",
            source: "outboundControlAdmin",
            related_entity_type: "OutboundSendingProfile",
            related_entity_id:
              profiles.find(
                (profile: any) =>
                  String(profile.external_campaign_id) === campaignId,
              )?.id || campaignId,
          });
          try {
            await provider.activateCampaign(String(campaignId));
            await settlePaidOperation(svc, reservation, {
              ok: true,
              usage_json: { operation: "activate_campaign", campaignId },
            });
            activated.push({ campaign_id: campaignId, active: true });
          } catch (error: any) {
            await settlePaidOperation(svc, reservation, {
              ok: false,
              usage_json: {
                operation: "activate_campaign",
                campaignId,
                error_code: String(error?.code || "FAILED"),
              },
            }).catch(() => null);
            await pauseAllInstantlyCampaigns(svc, "activation_rollback").catch(
              () => null,
            );
            return Response.json(
              {
                ok: false,
                error: String(
                  error?.code || "instantly_campaign_activation_failed",
                ),
                activated,
                rollback_attempted: true,
              },
              { status: Number(error?.status || 502) },
            );
          }
        }
        for (const profile of profiles)
          await svc.entities.OutboundSendingProfile.update(profile.id, {
            status: "active",
            last_provider_health_at: now,
            notes:
              "Instantly CANARY campaign active after fresh matching GO preflight.",
          }).catch(() => null);
        await upsertInstantlyProviderState(svc, {
          status: "ACTIVE",
          auth_test_pass: true,
          last_checked_at: now,
          last_success_at: now,
          last_error_code: "",
          metrics_json: {
            last_activation: activated,
            preflight_hash: requestedHash,
          },
        }).catch(() => null);
      }
      const common = {
        acquisition_enabled: true,
        activated_by: gate.user?.email || "admin",
        activated_at: now,
        paused_reason: null,
        activation_preflight_hash: requestedHash,
      };
      if (action === "start_premium")
        patch = { ...common, premium_outlook_enabled: true };
      if (action === "start_volume")
        patch = { ...common, volume_resend_enabled: true };
      if (action === "start_instantly")
        patch = { ...common, instantly_enabled: true };
      if (action === "start_all")
        patch = {
          ...common,
          premium_outlook_enabled: true,
          volume_resend_enabled: true,
          instantly_enabled: true,
        };
    } else if (action === "pause_premium")
      patch = {
        premium_outlook_enabled: false,
        paused_reason: "paused_by_admin",
      };
    else if (action === "pause_volume")
      patch = {
        volume_resend_enabled: false,
        paused_reason: "paused_by_admin",
      };
    else if (action === "pause_instantly")
      patch = { instantly_enabled: false, paused_reason: "paused_by_admin" };
    else if (action === "pause_all")
      patch = {
        acquisition_enabled: false,
        premium_outlook_enabled: false,
        volume_resend_enabled: false,
        instantly_enabled: false,
        paused_reason: "paused_by_admin",
      };
    else
      return Response.json(
        { ok: false, error: "invalid_action" },
        { status: 400 },
      );

    const updated = await svc.entities.OutboundControl.update(
      control.id,
      patch,
    );
    let remotePause: any = null;
    if (["pause_instantly", "pause_all"].includes(action))
      remotePause = await pauseAllInstantlyCampaigns(
        svc,
        `outbound_control:${action}`,
      );
    await svc.entities.OperationalLog.create({
      event_type: START_SCOPE[action]
        ? "commercial_outbound_canary_started"
        : "commercial_outbound_paused",
      message: action,
      data_json: {
        action,
        preflight_hash: patch.activation_preflight_hash || null,
        provider_scope: START_SCOPE[action] || null,
      },
      actor_email: String(gate.user?.email || ""),
      created_at: now,
    }).catch(() => null);
    return Response.json({
      ok: remotePause ? remotePause.ok !== false : true,
      action,
      control: updated,
      remote_pause: remotePause,
    });
  } catch (error) {
    console.error("outboundControlAdmin failed", error);
    return Response.json(
      { ok: false, error: "outbound_control_failed" },
      { status: 500 },
    );
  }
});
