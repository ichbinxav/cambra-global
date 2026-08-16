import { safeBestEffort } from '../../shared/bestEffort.ts';
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
import { readSingletonAuthority } from "../../shared/singletonAuthority.ts";

const START_SCOPE: Record<string, string> = {
  start_premium: "outlook",
  start_volume: "resend",
  start_instantly: "instantly",
  start_all: "all",
};
const updatedExactlyOne=(result:any)=>Boolean(result&&(result.updated===1||result.modified_count===1||result.matched_count===1));
const transitionFieldsCleared={transition_key:"",transition_action:"",transition_actor:"",transition_preflight_hash:"",transition_emergency_revision:null,transition_started_at:null,transition_expires_at:null};

function emergencyPaused(row:any){
  return !row||row.safe_mode===true||row.communications_paused===true;
}

async function readEmergencyAuthority(svc:any){
  const authority=await readSingletonAuthority(svc,{entity:"EmergencyControl",query:{control_key:"global"},sort:"-updated_at",authority:"emergency_control"});
  if(!authority.ok||!Number.isInteger(Number(authority.row?.control_revision)))return null;
  return authority.row;
}

function sameEmergencyAuthority(current:any,claimed:any){
  return Boolean(current&&claimed&&current.id===claimed.id&&Number(current.control_revision)===Number(claimed.control_revision)&&!emergencyPaused(current));
}

async function releaseClaim(svc:any,controlId:string,revision:number,key:string,reason:string){
  return updatedExactlyOne(await svc.entities.OutboundControl.updateMany(
    {id:controlId,control_revision:revision,transition_key:key},
    {$set:{...transitionFieldsCleared,control_revision:revision+1,paused_reason:reason}},
  ).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.release_transition_claim',fallback:null,severity:'critical'})));
}

async function pauseActivatedCampaigns(provider:any,campaignIds:string[]){
  const results=[];
  for(const campaignId of [...new Set(campaignIds)]){
    try{await provider.pauseCampaign(campaignId);results.push({campaign_id:campaignId,paused:true});}
    catch(error:any){results.push({campaign_id:campaignId,paused:false,error_code:String(error?.code||"INSTANTLY_PAUSE_FAILED")});}
  }
  return {ok:results.every((row:any)=>row.paused),campaigns:results};
}

async function markTransitionProfilesPaused(svc:any,profiles:any[],reason:string){
  const at=new Date().toISOString();
  for(const profile of profiles)await svc.entities.OutboundSendingProfile.update(profile.id,{status:"paused",last_provider_health_at:at,notes:`${reason}; transition profile contained`}).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.mark_transition_profile_paused',fallback:null,severity:'critical'}));
}
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
  "resend_register_webhook",
]);
const INSTANTLY_ADMIN_ACTIONS = new Set([
  "instantly_status",
  "instantly_diagnose",
  "instantly_diagnose_supersearch",
  "instantly_create_campaign",
  "instantly_register_webhook",
  "instantly_test_webhook",
  "instantly_pause",
]);

function forwardedRequest(req: Request, body: any) {
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(body),
  });
}

async function normalizeRoutedJson(response:Response|null):Promise<Response> {
  if(!response)return Response.json({ok:false,error:"routed_handler_no_response"},{status:500});
  const text = await response.text();
  let value:any = text;
  for (let layer=0; layer<4 && typeof value==='string'; layer++) {
    try { value=JSON.parse(value); }
    catch { break; }
  }
  return typeof value==='string'
    ? new Response(value, { status:response.status, headers:{ 'content-type':response.headers.get('content-type') || 'text/plain; charset=utf-8' } })
    : new Response(JSON.stringify(value), { status:response.status, headers:{ 'content-type':'application/json' } });
}

Deno.serve(async (req):Promise<Response> => {
  const routedBody = await req.clone().json().catch(() => ({}));
  const routedAction = String(routedBody?.action || "");
  if (INSTANTLY_ADMIN_ACTIONS.has(routedAction))
    return normalizeRoutedJson(await handleInstantlyProviderAdmin(
      forwardedRequest(req, {
        ...routedBody,
        action: routedAction.replace(/^instantly_/, ""),
      }),
    ));
  if (routedAction === "commercial_dry_run")
    return normalizeRoutedJson(await handleCommercialExecutionDryRun(forwardedRequest(req, routedBody)));
  if (routedAction === "commercial_strategy")
    return normalizeRoutedJson(await handleCommercialStrategyAgent(forwardedRequest(req, routedBody)));
  if (routedAction === "backfill_legacy_sending_profiles")
    return normalizeRoutedJson(await handleBackfillLegacySendingProfiles(forwardedRequest(req, routedBody)));
  if (routedAction === "commercial_go_live_readiness")
    return normalizeRoutedJson(await handleCommercialGoLiveReadiness(forwardedRequest(req, routedBody)));
  if (GO_LIVE_ACTIONS.has(routedAction)) return normalizeRoutedJson(await handleGoLiveControlAdmin(req));
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response || Response.json({ok:false,error:"access_gate_failed_closed"},{status:403});
    if (!gate.isAdmin)
      return Response.json(
        { ok: false, error: "admin_required" },
        { status: 403 },
      );
    const svc = base44.asServiceRole;
    const outboundAuthority=await readSingletonAuthority(svc,{entity:"OutboundControl",query:{control_key:"global"},sort:"-created_date",authority:"outbound_control"});
    const control = outboundAuthority.row;
    if (!outboundAuthority.ok||!control)
      return Response.json(
        { ok:false,error:outboundAuthority.blocker||"outbound_control_authority_unavailable",authority_status:outboundAuthority.status,conflicting_control_ids:outboundAuthority.rows.map((row:any)=>String(row.id||'')).filter(Boolean) },
        { status: 409 },
      );
    if(!Number.isInteger(Number(control.control_revision))){
      await svc.entities.OutboundControl.update(control.id,{control_revision:0});
      control.control_revision=0;
    }
    const action = String(body?.action || "");
    const now = new Date().toISOString();
    const actor = String(gate.user?.email || gate.user?.id || "admin");
    let patch: any = {};
    let emergencyClaim:any=null;
    let instantlyProvider:any=null;
    let instantlyProfiles:any[]=[];
    let instantlyActivationResults:any[]=[];
    const activatedCampaignIds:string[]=[];

    if (action === "preflight") {
      if(control.transition_key)
        return Response.json({ok:false,error:"outbound_transition_recovery_required",instruction:"Pause the affected outbound scope before running a new preflight."},{status:409});
      const readiness = await evaluateCommercialGoLiveReadiness(svc, {
        policy_id: body?.policy_id,
        policy_ids: body?.policy_ids,
        provider_scope: body?.provider_scope,
        // Founder Control deliberately does not expose deployment identifiers.
        // The server-side immutable identity is authoritative when the caller
        // does not provide one (Developer/System may still pass it explicitly).
        final_sha: body?.final_sha || Deno.env.get("CAMBRA_GIT_SHA") || "",
      });
      const preflight = {
        ...readiness,
        requested_by: actor,
      };
      const preflightRevision=Number(control.control_revision||0)+1;
      const preflightChanged=await svc.entities.OutboundControl.updateMany(
        {id:control.id,control_revision:Number(control.control_revision||0)},
        {$set:{
        preflight_status: readiness.allowed ? "PASS" : "BLOCKED",
        preflight_hash: readiness.preflight_hash || null,
        preflight_policy_id: readiness.policy_id || null,
        preflight_policy_ids: readiness.policy_ids || [],
        preflight_provider_scope: readiness.provider_scope,
        preflight_checked_at: readiness.checked_at,
        preflight_expires_at: readiness.expires_at || null,
        preflight_json: preflight,
        control_revision:preflightRevision,
        }},
      ).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.persist_preflight_cas',fallback:null,severity:'critical'}));
      if(!updatedExactlyOne(preflightChanged))
        return Response.json({ok:false,error:"outbound_control_changed_concurrently",outbound_unchanged:true},{status:409});
      for (const policyId of readiness.policy_ids || [])
        await svc.entities.CommercialPolicy.update(policyId, {
          activation_readiness_snapshot_json: preflight,
        }).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin',fallback:null,severity:'critical'}));
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
      }).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin',fallback:null,severity:'critical'}));
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
      }).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin',fallback:null,severity:'critical'}));
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
      if(String(control.preflight_json?.requested_by||"")!==actor)
        return Response.json(
          {ok:false,error:"preflight_actor_mismatch"},
          {status:403},
        );
      if(control.transition_key)
        return Response.json(
          {
            ok:false,
            error:"outbound_transition_recovery_required",
            transition_action:control.transition_action||null,
            instruction:"Pause the affected outbound scope before starting a new transition.",
          },
          {status:409},
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
        instantlyProfiles = (
          await svc.entities.OutboundSendingProfile.filter(
            { provider: "instantly" },
            "-created_date",
            100,
          ).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin',fallback:[],severity:'critical'}))
        ).filter(
          (profile: any) =>
            keys.has(profile.profile_key) && instantlyProfileReady(profile),
        );
        if (!instantlyProfiles.length)
          return Response.json(
            { ok: false, error: "ready_instantly_profile_required" },
            { status: 409 },
          );
        instantlyProvider = new InstantlyOutboundProvider(apiKey);
      }

      // The local CAS claim is deliberately acquired before the first remote
      // provider effect. Only one start request can own this transition.
      const emergencyAuthority=await readSingletonAuthority(svc,{entity:"EmergencyControl",query:{control_key:"global"},sort:"-updated_at",authority:"emergency_control"});
      if(!emergencyAuthority.ok)return Response.json({ok:false,error:emergencyAuthority.blocker||"emergency_control_authority_unavailable",authority_status:emergencyAuthority.status,material_effects_fail_closed:true},{status:409});
      emergencyClaim=emergencyAuthority.row;
      if(!Number.isInteger(Number(emergencyClaim?.control_revision)))return Response.json({ok:false,error:"emergency_control_revision_required",material_effects_fail_closed:true},{status:409});
      if(!emergencyClaim||emergencyPaused(emergencyClaim))
        return Response.json({ok:false,error:"emergency_control_paused:communications"},{status:409});
      const transitionKey=`outbound-transition:${crypto.randomUUID()}`;
      const claimedRevision=Number(control.control_revision||0)+1;
      const transitionExpiresAt=new Date(Date.now()+5*60_000).toISOString();
      const claimed=await svc.entities.OutboundControl.updateMany(
        {
          id:control.id,
          control_revision:Number(control.control_revision||0),
          preflight_status:"PASS",
          preflight_hash:requestedHash,
        },
        {$set:{
          control_revision:claimedRevision,
          transition_key:transitionKey,
          transition_action:action,
          transition_actor:actor,
          transition_preflight_hash:requestedHash,
          transition_emergency_revision:Number(emergencyClaim.control_revision),
          transition_started_at:now,
          transition_expires_at:transitionExpiresAt,
        }},
      ).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.acquire_start_transition_cas',fallback:null,severity:'critical'}));
      if(!updatedExactlyOne(claimed))
        return Response.json({ok:false,error:"outbound_control_changed_concurrently",remote_effects_started:false},{status:409});
      control.control_revision=claimedRevision;
      control.transition_key=transitionKey;

      // Emergency Stop is an independent authority. Re-read it after claiming
      // and before every external activation; any revision change invalidates
      // this start even when the resulting flags appear permissive.
      const emergencyAfterClaim=await readEmergencyAuthority(svc);
      if(!sameEmergencyAuthority(emergencyAfterClaim,emergencyClaim)){
        await releaseClaim(svc,control.id,claimedRevision,transitionKey,"emergency_control_changed_during_start");
        return Response.json({ok:false,error:"emergency_control_changed_during_start",remote_effects_started:false},{status:409});
      }

      if (instantlyProvider) {
        const activated:any[] = [];
        instantlyActivationResults=activated;
        for (const campaignId of [
          ...new Set(
            instantlyProfiles
              .map((profile: any) => String(profile.external_campaign_id))
              .filter(Boolean),
          ),
        ]) {
          const currentEmergency=await readEmergencyAuthority(svc);
          if(!sameEmergencyAuthority(currentEmergency,emergencyClaim)){
            const rollback=await pauseActivatedCampaigns(instantlyProvider,activatedCampaignIds);
            await releaseClaim(svc,control.id,claimedRevision,transitionKey,"emergency_control_changed_during_start");
            return Response.json({ok:false,error:"emergency_control_changed_during_start",activated,rollback},{status:409});
          }
          let reservation:any=null;
          try {
            reservation = await reservePaidOperation(svc, {
              event_key: `api:instantly:activate:${campaignId}:${requestedHash}`,
              category: "api",
              provider: "instantly",
              source: "outboundControlAdmin",
              related_entity_type: "OutboundSendingProfile",
              related_entity_id:
                instantlyProfiles.find(
                  (profile: any) =>
                    String(profile.external_campaign_id) === campaignId,
                )?.id || campaignId,
            });
            const emergencyImmediatelyBeforeRemote=await readEmergencyAuthority(svc);
            if(!sameEmergencyAuthority(emergencyImmediatelyBeforeRemote,emergencyClaim)){
              await settlePaidOperation(svc,reservation,{ok:false,usage_json:{operation:"activate_campaign",campaignId,error_code:"EMERGENCY_CONTROL_CHANGED"}}).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.settle_emergency_interrupted_activation',fallback:null,severity:'critical'}));
              const rollback=await pauseActivatedCampaigns(instantlyProvider,activatedCampaignIds);
              await releaseClaim(svc,control.id,claimedRevision,transitionKey,"emergency_control_changed_during_start");
              return Response.json({ok:false,error:"emergency_control_changed_during_start",activated,rollback},{status:409});
            }
            await instantlyProvider.activateCampaign(String(campaignId));
            // Record ownership immediately: settlement may fail after the
            // provider has already applied the activation.
            activatedCampaignIds.push(String(campaignId));
            await settlePaidOperation(svc, reservation, {
              ok: true,
              usage_json: { operation: "activate_campaign", campaignId },
            });
            activated.push({ campaign_id: campaignId, active: true });
            const emergencyAfterActivation=await readEmergencyAuthority(svc);
            if(!sameEmergencyAuthority(emergencyAfterActivation,emergencyClaim)){
              const rollback=await pauseActivatedCampaigns(instantlyProvider,activatedCampaignIds);
              await releaseClaim(svc,control.id,claimedRevision,transitionKey,"emergency_control_changed_during_start");
              return Response.json({ok:false,error:"emergency_control_changed_during_start",activated,rollback},{status:409});
            }
          } catch (error: any) {
            if(reservation)await settlePaidOperation(svc, reservation, {
              ok: false,
              usage_json: {
                operation: "activate_campaign",
                campaignId,
                error_code: String(error?.code || "FAILED"),
              },
            }).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin',fallback:null,severity:'critical'}));
            // Provider failures can be ambiguous (for example a response lost
            // after apply), so contain the current campaign as well as every
            // activation already confirmed by this transition.
            const rollback=await pauseActivatedCampaigns(instantlyProvider,[...activatedCampaignIds,String(campaignId)]);
            await releaseClaim(svc,control.id,claimedRevision,transitionKey,"instantly_activation_failed");
            return Response.json(
              {
                ok: false,
                error: String(
                  error?.code || "instantly_campaign_activation_failed",
                ),
                activated,
                rollback_attempted: true,
                rollback,
              },
              { status: Number(error?.status || 502) },
            );
          }
        }
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

    // A pause is a safety action: it may preempt an in-flight START_SCOPE by
    // clearing its transition key and incrementing the same CAS revision. The
    // displaced starter's finalize then fails and can only roll back campaigns
    // it personally activated.
    patch={...patch,...transitionFieldsCleared};
    patch.control_revision=Number(control.control_revision||0)+1;
    let changed=await svc.entities.OutboundControl.updateMany(
      {
        id:control.id,
        control_revision:Number(control.control_revision||0),
        ...(START_SCOPE[action]?{transition_key:String(control.transition_key||"")}:{})
      },
      {$set:patch},
    ).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.apply_control_transition_cas',fallback:null,severity:'critical'}));
    if(!START_SCOPE[action]&&!updatedExactlyOne(changed)){
      // Pause commands are safety controls, so retry against the latest
      // revision instead of losing to a start claim that was acquired after
      // this request read the singleton.
      for(let attempt=0;attempt<4&&!updatedExactlyOne(changed);attempt++){
        const current=await svc.entities.OutboundControl.get(control.id).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.pause_retry_authority_read',fallback:null,severity:'critical'}));
        if(!current)break;
        const currentRevision=Number.isInteger(Number(current.control_revision))?Number(current.control_revision):0;
        patch.control_revision=currentRevision+1;
        changed=await svc.entities.OutboundControl.updateMany(
          {id:control.id,control_revision:currentRevision},
          {$set:patch},
        ).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.pause_retry_cas',fallback:null,severity:'critical'}));
      }
    }
    if(!updatedExactlyOne(changed)){
      const rollback=instantlyProvider
        ?await pauseActivatedCampaigns(instantlyProvider,activatedCampaignIds)
        :{ok:true,campaigns:[]};
      return Response.json({ok:false,error:'outbound_control_changed_concurrently',remote_rollback_attempted:activatedCampaignIds.length>0,rollback},{status:409});
    }
    let updated=await svc.entities.OutboundControl.get(control.id);

    if(START_SCOPE[action]){
      const emergencyAfterFinalize=await readEmergencyAuthority(svc);
      if(!sameEmergencyAuthority(emergencyAfterFinalize,emergencyClaim)){
        const rollback=instantlyProvider
          ?await pauseActivatedCampaigns(instantlyProvider,activatedCampaignIds)
          :{ok:true,campaigns:[]};
        const finalRevision=Number(updated.control_revision||0);
        await svc.entities.OutboundControl.updateMany(
          {id:updated.id,control_revision:finalRevision},
          {$set:{acquisition_enabled:false,premium_outlook_enabled:false,volume_resend_enabled:false,instantly_enabled:false,paused_reason:'emergency_control_changed_during_start',control_revision:finalRevision+1,...transitionFieldsCleared}},
        ).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.contain_start_after_emergency_change',fallback:null,severity:'critical'}));
        return Response.json({ok:false,error:'emergency_control_changed_during_start',rollback},{status:409});
      }
      if(instantlyProvider){
        for (const profile of instantlyProfiles)
          await svc.entities.OutboundSendingProfile.update(profile.id, {
            status: "active",
            last_provider_health_at: now,
            notes:
              "Instantly CANARY campaign active after fresh matching GO preflight.",
          }).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin',fallback:null,severity:'critical'}));
        await upsertInstantlyProviderState(svc, {
          status: "ACTIVE",
          auth_test_pass: true,
          last_checked_at: now,
          last_success_at: now,
          last_error_code: "",
          metrics_json: {
            last_activation: instantlyActivationResults,
            preflight_hash: patch.activation_preflight_hash,
          },
        }).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin',fallback:null,severity:'critical'}));
        const emergencyAfterProjection=await readEmergencyAuthority(svc);
        if(!sameEmergencyAuthority(emergencyAfterProjection,emergencyClaim)){
          const rollback=await pauseActivatedCampaigns(instantlyProvider,activatedCampaignIds);
          for(const profile of instantlyProfiles)await svc.entities.OutboundSendingProfile.update(profile.id,{status:'paused',last_provider_health_at:new Date().toISOString(),notes:'Emergency authority changed during activation projection; campaign contained.'}).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.contain_profile_after_emergency_change',fallback:null,severity:'critical'}));
          updated=await svc.entities.OutboundControl.get(control.id);
          const projectionRevision=Number(updated.control_revision||0);
          await svc.entities.OutboundControl.updateMany(
            {id:updated.id,control_revision:projectionRevision},
            {$set:{acquisition_enabled:false,premium_outlook_enabled:false,volume_resend_enabled:false,instantly_enabled:false,paused_reason:'emergency_control_changed_during_start',control_revision:projectionRevision+1,...transitionFieldsCleared}},
          ).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.contain_projection_after_emergency_change',fallback:null,severity:'critical'}));
          return Response.json({ok:false,error:'emergency_control_changed_during_start',rollback},{status:409});
        }
      }
      // Close the last check/use gap before returning success. Emergency Stop
      // can run at any point; its independent containment also bumps this
      // control revision. Require the enabled revision to remain exactly the
      // one finalized by this command and EmergencyControl to remain unchanged.
      const finalAuthority=await readEmergencyAuthority(svc);
      const finalControl=await svc.entities.OutboundControl.get(control.id).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.final_start_authority_read',fallback:null,severity:'critical'}));
      if(!sameEmergencyAuthority(finalAuthority,emergencyClaim)||!finalControl||Number(finalControl.control_revision)!==Number(updated.control_revision)||finalControl.acquisition_enabled!==true){
        const rollback=instantlyProvider
          ?await pauseActivatedCampaigns(instantlyProvider,activatedCampaignIds)
          :{ok:true,campaigns:[]};
        await markTransitionProfilesPaused(svc,instantlyProfiles,"outbound_start_superseded_by_safety_control");
        return Response.json({ok:false,error:'outbound_start_superseded_by_safety_control',rollback},{status:409});
      }
      updated=finalControl;
    }
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
    }).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin',fallback:null,severity:'critical'}));
    if(START_SCOPE[action]){
      const returnAuthority=await readEmergencyAuthority(svc);
      const returnControl=await svc.entities.OutboundControl.get(control.id).catch((error:any)=>safeBestEffort(error,{operation:'outboundControlAdmin.return_boundary_authority_read',fallback:null,severity:'critical'}));
      if(!sameEmergencyAuthority(returnAuthority,emergencyClaim)||!returnControl||Number(returnControl.control_revision)!==Number(updated.control_revision)||returnControl.acquisition_enabled!==true){
        const rollback=instantlyProvider?await pauseActivatedCampaigns(instantlyProvider,activatedCampaignIds):{ok:true,campaigns:[]};
        await markTransitionProfilesPaused(svc,instantlyProfiles,"outbound_start_superseded_by_safety_control");
        return Response.json({ok:false,error:'outbound_start_superseded_by_safety_control',rollback},{status:409});
      }
      updated=returnControl;
    }
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
