// AUDIT 2026-08-18 — moved out of base44/functions/goLiveControlAdmin/entry.ts so hosts of this
// logical route can import it without a relative import escaping their bundle.
import { safeBestEffort } from '../bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { operationErrorResponse } from '../publicErrors.ts';
import { activateCostEmergencyStop, clearOwnedCostEmergencyStop, costReservationStateForReconfiguration, costRuntimeSnapshot, guardReservedPaidProviderEffect, reservePaidOperation, settlePaidOperation, validateCostBudget } from '../costGovernance.ts';
import { collectGoLiveRuntime } from '../goLiveRuntime.ts';
import { assertOperationAllowed, emergencyState } from '../operationalControl.ts';
import { evaluateSchedulerEvidence } from '../schedulerRun.ts';
import { recordRuntimeGateEvidence, runtimeGitSha, verifyRuntimeGateEvidence } from '../runtimeEvidence.ts';
import { sha256 } from '../intelligenceCore.ts';
import { assertBillingAccount, resolveBillingMode } from '../stripeBilling.ts';
import { bootstrapContainedSingleton, readSingletonAuthority } from '../singletonAuthority.ts';

const CONFIRM_BUDGET = 'APPLY_FOUNDER_COST_BUDGET';
const CONFIRM_CLEAR_COST = 'CLEAR_COST_EMERGENCY_STOP';
const CONFIRM_DRILL = 'RUN_GLOBAL_EMERGENCY_STOP_DRILL';
const CONFIRM_PROFILE = 'CONFIGURE_OUTBOUND_SENDING_PROFILE';
const CONFIRM_PROFILE_WARMUP = 'ENABLE_SENDING_PROFILE_WARMUP';
const CONFIRM_PROFILE_PAUSE = 'PAUSE_SENDING_PROFILE';
const CONFIRM_COST_DRILL = 'RUN_COST_KILL_SWITCH_DRILL';
const CONFIRM_RESEND_WEBHOOK = 'REGISTER_CAMBRA_RESEND_WEBHOOK';

function updatedExactlyOne(result:any) {
  return Boolean(result && (result.updated === 1 || result.modified_count === 1 || result.matched_count === 1));
}

async function createResendWebhook(svc:any, target:string, actor:string) {
  if (Deno.env.get('RESEND_WEBHOOK_SECRET')) return { ok:true, already_configured:true, signing_secret_one_time:false };
  const key = Deno.env.get('RESEND_API_KEY') || '';
  if (!key) throw Object.assign(new Error('resend_api_key_required'), { status:503, code:'resend_api_key_required' });
  const url = new URL(target);
  if (url.protocol !== 'https:' || url.hostname !== 'base44.app' || !/^\/api\/apps\/[a-z0-9]+\/functions\/resendInboundWebhook$/i.test(url.pathname)) {
    throw Object.assign(new Error('canonical_resend_webhook_target_required'), { status:409, code:'canonical_resend_webhook_target_required' });
  }
  const reservation = await reservePaidOperation(svc, {
    event_key:`api:resend:webhook-create:${crypto.randomUUID()}`,
    category:'api', provider:'resend', source:'goLiveControlAdmin',
    related_entity_type:'CommercialProviderState', related_entity_id:'resend',
  });
  try {
    const response = await guardReservedPaidProviderEffect(svc,reservation,{
      category:'api',provider:'resend',source:'goLiveControlAdmin',
      event_key:reservation.event?.event_key,effect_key:'resend_register_webhook',
    },()=>fetch('https://api.resend.com/webhooks', {
      method:'POST',
      headers:{ authorization:`Bearer ${key}`, 'content-type':'application/json' },
      body:JSON.stringify({
        endpoint:target,
        events:['email.delivered','email.bounced','email.complained','email.failed','email.suppressed','email.received'],
      }),
    }));
    const data = await response.json().catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.resend_webhook_response_parse',fallback:{},severity:'critical'}));
    if (!response.ok) {
      const providerMessage = String(data?.message || data?.name || 'invalid_request')
        .replace(/re_[A-Za-z0-9_-]+/g, 're_[redacted]')
        .slice(0,240);
      throw Object.assign(new Error(`resend_webhook_create_failed:${response.status}:${providerMessage}`), { status:502, code:'resend_webhook_create_failed' });
    }
    const webhookId = String(data?.id || '');
    const signingSecret = String(data?.signing_secret || '');
    if (!webhookId || !signingSecret.startsWith('whsec_')) throw Object.assign(new Error('resend_webhook_response_invalid'), { status:502, code:'resend_webhook_response_invalid' });
    await settlePaidOperation(svc, reservation, { ok:true, usage_json:{ operation:'create_webhook', webhook_id:webhookId } });
    await svc.entities.OperationalLog.create({
      event_type:'resend_webhook_registered',
      message:'Authenticated Resend webhook registered on the canonical Base44 endpoint',
      data_json:{ webhook_id:webhookId, endpoint:target, signing_secret_persisted:false, events:6 },
      actor_email:actor, created_at:new Date().toISOString(),
    }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
    // Resend returns the signing secret only once. It is returned only to the
    // authenticated founder so the operator can immediately store it in the
    // platform secret vault. It is never persisted in entities or logs.
    return { ok:true, webhook_id:webhookId, signing_secret:signingSecret, signing_secret_one_time:true };
  } catch (error:any) {
    await settlePaidOperation(svc, reservation, { ok:false, usage_json:{ operation:'create_webhook', error_code:String(error?.code || 'FAILED') } }).catch((settleError:any)=>safeBestEffort(settleError,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
    throw error;
  }
}

async function dnsAnswers(name:string, type:'TXT'|'CNAME') {
  const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { headers:{ accept:'application/dns-json' } });
  const data = await response.json().catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.dns_response_parse',fallback:{},severity:'critical'}));
  return { ok:response.ok && Number(data?.Status) === 0, status:Number(data?.Status), answers:(data?.Answer || []).map((row:any) => String(row?.data || '').replace(/^"|"$/g, '').replace(/"\s+"/g, '')) };
}

async function verifyDeliverability(svc:any) {
  // Paused profiles are deliberately included: DNS and credentials must be proven
  // before the founder is allowed to move a profile into warm-up.
  const profiles = (await svc.entities.OutboundSendingProfile.list('-created_date', 100).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'}))).filter((profile:any) => String(profile.from_address || '').includes('@'));
  const rows:any[] = [];
  for (const profile of profiles) {
    const domain = String(profile.domain || String(profile.from_address).split('@')[1] || '').toLowerCase();
    const selectors = Array.isArray(profile.dkim_selectors) ? profile.dkim_selectors.map(String).filter(Boolean) : [];
    const spf = await dnsAnswers(domain, 'TXT').catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.spf_lookup',fallback:{ok:false,status:-1,answers:[]},severity:'critical'}));
    const dmarc = await dnsAnswers(`_dmarc.${domain}`, 'TXT').catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.dmarc_lookup',fallback:{ok:false,status:-1,answers:[]},severity:'critical'}));
    const dkim:any[] = [];
    for (const selector of selectors) {
      const host = `${selector}._domainkey.${domain}`;
      const [txt, cname] = await Promise.all([dnsAnswers(host, 'TXT').catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.dkim_txt_lookup',fallback:{ok:false,answers:[]},severity:'critical'})), dnsAnswers(host, 'CNAME').catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.dkim_cname_lookup',fallback:{ok:false,answers:[]},severity:'critical'}))]);
      dkim.push({ selector, host, pass:(txt.answers.length + cname.answers.length) > 0, txt_answers:txt.answers.length, cname_answers:cname.answers.length });
    }
    rows.push({ profile_key:profile.profile_key, provider:profile.provider, domain, selectors, spf_pass:spf.answers.some((value:string) => value.toLowerCase().includes('v=spf1')), dmarc_pass:dmarc.answers.some((value:string) => value.toUpperCase().includes('V=DMARC1')), dkim_pass:selectors.length > 0 && dkim.every((row) => row.pass), dkim });
  }
  const credentials:any = { resend_api_key:Boolean(Deno.env.get('RESEND_API_KEY')), resend_webhook_secret:Boolean(Deno.env.get('RESEND_WEBHOOK_SECRET')), outlook_connected:false, instantly_api_key:Boolean(Deno.env.get('INSTANTLY_API_KEY')), instantly_webhook_secret:Boolean(Deno.env.get('INSTANTLY_WEBHOOK_SECRET')) };
  if (profiles.some((profile:any) => profile.provider === 'outlook')) {
    const connection = await svc.connectors.getConnection('outlook').catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
    credentials.outlook_connected = Boolean(connection?.accessToken);
  }
  const resendCredentials=!profiles.some((p:any)=>p.provider==='resend')||(credentials.resend_api_key&&credentials.resend_webhook_secret);
  const outlookCredentials=!profiles.some((p:any)=>p.provider==='outlook')||credentials.outlook_connected;
  // A paused reserve domain is not an outbound campaign. Requiring every
  // inventory-only Instantly profile to own a campaign/webhook would strand a
  // valid one-profile canary. Scope transport credentials to profiles that are
  // active/warming or have been explicitly prepared with an external campaign;
  // DNS remains checked for every configured profile above so reserves cannot
  // be promoted without real SPF/DKIM/DMARC evidence.
  const instantlyProfiles=profiles.filter((p:any)=>p.provider==='instantly');
  const instantlyTransportProfiles=instantlyProfiles.filter((p:any)=>['active','warming'].includes(String(p.status||''))||Boolean(p.external_campaign_id));
  const instantlyCredentials=instantlyProfiles.length===0||(instantlyTransportProfiles.length>0&&credentials.instantly_api_key&&credentials.instantly_webhook_secret&&instantlyTransportProfiles.every((p:any)=>p.external_campaign_id&&p.webhook_status==='ACTIVE'));
  const pass = profiles.length > 0 && rows.every((row) => row.spf_pass && row.dkim_pass && row.dmarc_pass) && resendCredentials && outlookCredentials && instantlyCredentials;
  return { pass, profiles:rows, credentials, instantly_transport_profile_keys:instantlyTransportProfiles.map((p:any)=>p.profile_key), blockers:[...(profiles.length ? [] : ['configured_sending_profile_required']),...(!resendCredentials?['resend_credentials_required']:[]),...(!outlookCredentials?['outlook_connector_required']:[]),...(!instantlyCredentials?['instantly_campaign_webhook_credentials_required']:[]), ...rows.flatMap((row) => [!row.spf_pass ? `${row.profile_key}:spf` : '', !row.dkim_pass ? `${row.profile_key}:dkim` : '', !row.dmarc_pass ? `${row.profile_key}:dmarc` : '']).filter(Boolean)] };
}

async function verifyRuntime(svc:any, finalSha:string, actor:string) {
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const since24h = new Date(Date.now() - 24 * 3600000).toISOString();
  const [deliverability, schedulerRuns, suppressionLogs, health, tasks, stripeBilling] = await Promise.all([
    verifyDeliverability(svc),
    svc.entities.SchedulerRun.filter({ started_at:{ $gte:new Date(Date.now() - 8 * 86400000).toISOString() } }, '-started_at', 5000).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'})),
    svc.entities.OperationalLog.filter({ event_type:'suppression_lifecycle_event', created_at:{ $gte:since7d } }, '-created_at', 1000).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'})),
    svc.entities.OperatingHealthAssessment.filter({ calculated_at:{ $gte:since24h } }, '-calculated_at', 10).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'})),
    svc.entities.AgentTask.filter({ started_at:{ $gte:since24h } }, '-started_at', 2000).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'})),
    (async()=>{
      const mode=resolveBillingMode();
      if(mode!=='live')return{pass:false,mode,account_id:null,blocker:'stripe_live_billing_mode_required'};
      try{
        const account=await assertBillingAccount('live');
        return{pass:true,mode,account_id:account.account_id,blocker:null};
      }catch(error:any){
        return{pass:false,mode,account_id:null,blocker:String(error?.message||'stripe_live_account_unreachable').slice(0,200)};
      }
    })(),
  ]);
  const legacySchedulerMap:any = {
    webhook_dead_letter_processor:{ worker_key:'processWebhookDeadLetters', cadence_seconds:300 },
    ecl_lifecycle_scheduler:{ worker_key:'eclLifecycleScheduler', cadence_seconds:900 },
    recover_billing_reconciler:{ worker_key:'reconcileRecoverBilling', cadence_seconds:900 },
  };
  const nativeScheduledWorkerKeys = new Set(schedulerRuns.filter((run:any) => run.invocation_kind === 'SCHEDULED').map((run:any) => String(run.worker_key || '')));
  const legacyRuns = tasks.flatMap((task:any) => {
    const mapped = legacySchedulerMap[String(task.agent_name || '')];
    if (!mapped) return [];
    // Once a worker emits native SchedulerRun evidence, do not double-count
    // its compatibility AgentTask projection as a second execution.
    if (nativeScheduledWorkerKeys.has(mapped.worker_key)) return [];
    if (mapped.worker_key === 'processWebhookDeadLetters' && task.task_type !== 'scheduled_dead_letter_retry') return [];
    if (mapped.worker_key === 'eclLifecycleScheduler' && !String(task.input_summary || '').includes('scheduled')) return [];
    const started = Date.parse(task.started_at || task.created_date || '');
    if (!Number.isFinite(started)) return [];
    const slot = Math.floor(started / (mapped.cadence_seconds * 1000)) * mapped.cadence_seconds * 1000;
    return [{ run_key:`${mapped.worker_key}:${new Date(slot).toISOString()}`, worker_key:mapped.worker_key, cadence_seconds:mapped.cadence_seconds, invocation_kind:'SCHEDULED', status:task.status === 'completed' ? 'COMPLETED' : task.status === 'failed' ? 'FAILED':'RUNNING', started_at:new Date(started).toISOString(), completed_at:task.completed_at || null, details_json:{ source:'legacy_agent_task_runtime_evidence', agent_task_id:task.id } }];
  });
  const scheduler = evaluateSchedulerEvidence([...schedulerRuns, ...legacyRuns]);
  const signedSuppressionLogs = suppressionLogs.filter((row:any) => row.data_json?.signature_verified === true);
  const reasons = new Set(signedSuppressionLogs.map((row:any) => String(row.data_json?.suppression_reason || row.message || '').toLowerCase()));
  const suppression = { pass:['bounce','complaint','opt_out'].every((reason) => reasons.has(reason)), observed_reasons:[...reasons], signed_events:signedSuppressionLogs.length, event_count:suppressionLogs.length };
  const observed = tasks.some((task:any) => ['operating_health','autonomous_company_orchestrator'].includes(String(task.agent_name || ''))) || health.length > 0;
  const decided = tasks.some((task:any) => ['autonomous_company_orchestrator','founder_chief_of_staff'].includes(String(task.agent_name || '')));
  const acted = tasks.some((task:any) => ['commercial_follow_up','outbound_volume_worker','autonomous_partner_worker','post_meeting_worker','webhook_dead_letter_processor','recover_autopilot'].includes(String(task.agent_name || '')));
  const verified = health.length > 0 && scheduler.active;
  const loop = { pass:observed && decided && acted && verified, observed, decided, acted, verified, recent_health_assessments:health.length, recent_tasks:tasks.length };
  const now = new Date().toISOString(), expires = new Date(Date.now() + 25 * 3600000).toISOString();
  const evidence = await Promise.all([
    recordRuntimeGateEvidence(svc, { gate_key:'DELIVERABILITY_DNS', git_sha:finalSha, status:deliverability.pass ? 'PASS':'BLOCKED', evidence_kind:'REAL_RUNTIME', source:'goLiveControlAdmin.verify_runtime', details_json:deliverability, observed_at:now, expires_at:expires, recorded_by:actor }),
    recordRuntimeGateEvidence(svc, { gate_key:'SUPPRESSION_LIFECYCLE', git_sha:finalSha, status:suppression.pass ? 'PASS':'BLOCKED', evidence_kind:'REAL_RUNTIME', source:'goLiveControlAdmin.verify_runtime', details_json:suppression, observed_at:now, expires_at:new Date(Date.now()+169*3600000).toISOString(), recorded_by:actor }),
    recordRuntimeGateEvidence(svc, { gate_key:'SCHEDULERS_ACTIVE', git_sha:finalSha, status:scheduler.active ? 'PASS':'BLOCKED', evidence_kind:'REAL_RUNTIME', source:'goLiveControlAdmin.verify_runtime', details_json:scheduler, observed_at:now, expires_at:expires, recorded_by:actor }),
    recordRuntimeGateEvidence(svc, { gate_key:'SCHEDULER_NO_DUPLICATES', git_sha:finalSha, status:scheduler.no_duplicate_execution ? 'PASS':'BLOCKED', evidence_kind:'REAL_RUNTIME', source:'goLiveControlAdmin.verify_runtime', details_json:scheduler, observed_at:now, expires_at:expires, recorded_by:actor }),
    recordRuntimeGateEvidence(svc, { gate_key:'OBSERVABILITY_LOOP', git_sha:finalSha, status:loop.pass ? 'PASS':'BLOCKED', evidence_kind:'REAL_RUNTIME', source:'goLiveControlAdmin.verify_runtime', details_json:loop, observed_at:now, expires_at:expires, recorded_by:actor }),
    recordRuntimeGateEvidence(svc, { gate_key:'STRIPE_LIVE_ACCOUNT_HEALTH', git_sha:finalSha, status:stripeBilling.pass ? 'PASS':'BLOCKED', evidence_kind:'REAL_RUNTIME', source:'goLiveControlAdmin.verify_runtime', details_json:stripeBilling, observed_at:now, expires_at:expires, recorded_by:actor }),
  ]);
  return { deliverability, scheduler, suppression, loop, stripe_billing:stripeBilling, evidence_ids:evidence.map((row:any) => row.id) };
}

async function getEmergencyRow(svc:any) {
  const authority=await bootstrapContainedSingleton(svc,{entity:'EmergencyControl',query:{control_key:'global'},sort:'-updated_at',authority:'emergency_control',containedCandidate:()=>({ control_key:'global', safe_mode:true, communications_paused:true, negotiations_paused:true, migrations_paused:true, billing_issuance_paused:true, paid_discovery_paused:true, resume_check_required:true, control_revision:0, reason:'Emergency authority initialized fail-closed; Founder Safe Resume required.', updated_at:new Date().toISOString(), updated_by:'system' })});
  if(authority.ok&&authority.row)return authority.row;
  throw Object.assign(new Error(authority.blocker||'emergency_control_authority_unavailable'),{status:409,code:authority.blocker||'emergency_control_authority_unavailable'});
}

async function getOutboundRow(svc:any){
  const authority=await readSingletonAuthority(svc,{entity:'OutboundControl',query:{control_key:'global'},sort:'-created_date',authority:'outbound_control'});
  if(authority.ok&&authority.row)return authority.row;
  throw Object.assign(new Error(authority.blocker||'outbound_control_authority_unavailable'),{status:409,code:authority.blocker||'outbound_control_authority_unavailable'});
}

async function emergencyDrill(svc:any, finalSha:string, actor:string) {
  const outbound = await getOutboundRow(svc);
  const activePolicies = await svc.entities.CommercialPolicy.filter({ status:'active' }, '-approved_at', 200).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'}));
  if (outbound?.acquisition_enabled === true) throw Object.assign(new Error('drill_requires_outbound_paused'), { status:409, code:'drill_requires_outbound_paused' });
  const activePolicyIdsBefore = activePolicies.map((row:any) => String(row.id)).sort();
  const row = await getEmergencyRow(svc);
  if (row.safe_mode) throw Object.assign(new Error('safe_mode_already_active'), { status:409 });
  const before = await emergencyState(svc);
  // This proof is deliberately isolated. Earlier versions temporarily mutated
  // the canonical EmergencyControl and then restored a stale snapshot, which
  // could erase a real stop arriving during the drill. Exercise the production
  // gate against an isolated stopped authority instead; canonical state and
  // provider state are never restored or overwritten by a drill.
  const drillState={...row,safe_mode:true,communications_paused:true,negotiations_paused:true,migrations_paused:true,billing_issuance_paused:true,paid_discovery_paused:true,resume_check_required:true,control_available:true,reason:'Isolated Founder GO-live emergency-stop drill'};
  const isolatedSvc={entities:{EmergencyControl:{filter:async()=>[drillState]}}};
  const remotePause={ok:true,not_executed:true,isolated_drill:true,reason:'canonical_provider_state_not_mutated'};
  const capabilities = ['communications','negotiations','migrations','billing_issuance','paid_discovery'];
  const blocked:any = {};
  for (const capability of capabilities) {
    try { await assertOperationAllowed(isolatedSvc, capability as any); blocked[capability] = false; }
    catch (error:any) { blocked[capability] = error?.code === 'EMERGENCY_CONTROL_PAUSED'; }
  }
  const safeRead = await Promise.all([svc.entities.Brand.list('-created_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'})), svc.entities.AnalyzerResult.list('-created_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'}))]);
  const after = await emergencyState(svc);
  const outboundAfter = await getOutboundRow(svc);
  const policiesAfter = await svc.entities.CommercialPolicy.filter({ status:'active' }, '-approved_at', 200).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'}));
  const activePolicyIdsAfter = policiesAfter.map((row:any) => String(row.id)).sort();
  const policySetRestored = JSON.stringify(activePolicyIdsAfter) === JSON.stringify(activePolicyIdsBefore);
  const canonicalStateUnchanged=JSON.stringify(after)===JSON.stringify(before);
  const stopPass = capabilities.every((capability) => blocked[capability])&&outboundAfter?.acquisition_enabled!==true;
  const resumePass = canonicalStateUnchanged && safeRead.every(Array.isArray) && outboundAfter?.acquisition_enabled !== true && policySetRestored;
  const at = new Date().toISOString();
  // Isolated execution is useful regression evidence but is intentionally
  // LOCAL_STATIC: it must never satisfy the production OPERATOR_EXERCISE gate.
  // That gate is earned only by a real preview-bound stop + Safe Resume through
  // emergencyControlAdmin, whose audit events are checked below.
  await recordRuntimeGateEvidence(svc, { gate_key:'EMERGENCY_STOP', git_sha:finalSha, status:stopPass ? 'PASS':'FAIL', evidence_kind:'LOCAL_STATIC', source:'goLiveControlAdmin.emergency_drill', details_json:{ production_gate_satisfied:false,isolated_drill:true,canonical_state_unchanged:canonicalStateUnchanged,blocked, instantly_remote_pause:remotePause, analyzer_read_only_alive:safeRead.every(Array.isArray), before, after }, observed_at:at, expires_at:new Date(Date.now()+169*3600000).toISOString(), recorded_by:actor });
  await recordRuntimeGateEvidence(svc, { gate_key:'SAFE_RESUME', git_sha:finalSha, status:resumePass ? 'PASS':'FAIL', evidence_kind:'LOCAL_STATIC', source:'goLiveControlAdmin.emergency_drill', details_json:{ production_gate_satisfied:false,isolated_drill:true,canonical_state_unchanged:canonicalStateUnchanged,after, outbound_remains_paused:outboundAfter?.acquisition_enabled !== true, active_commercial_policies_before:activePolicyIdsBefore.length, active_commercial_policies_after:activePolicyIdsAfter.length, active_policy_set_restored:policySetRestored, analyzer_read_only_alive:safeRead.every(Array.isArray) }, observed_at:at, expires_at:new Date(Date.now()+169*3600000).toISOString(), recorded_by:actor });
  await svc.entities.OperationalLog.create({ event_type:'emergency_control_drill_completed', message:stopPass && resumePass ? 'PASS_ISOLATED':'FAIL', data_json:{ production_gate_satisfied:false,isolated_drill:true,canonical_state_unchanged:canonicalStateUnchanged,blocked, instantly_remote_pause:remotePause, stop_pass:stopPass, safe_resume_pass:resumePass }, actor_email:actor, created_at:at }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
  return { stop_pass:stopPass, safe_resume_pass:resumePass, production_gate_satisfied:false,isolated_drill:true, canonical_state_unchanged:canonicalStateUnchanged, blocked, instantly_remote_pause:remotePause, after, outbound_remains_paused:outboundAfter?.acquisition_enabled !== true, active_policy_set_restored:policySetRestored };
}

export async function handleGoLiveControlAdmin(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
    if (!user || user.role !== 'admin') return Response.json({ ok:false, error:'admin_required' }, { status:403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'status');
    const svc = base44.asServiceRole;
    const actor = String(user.email || user.id || 'admin');
    const requestedFinalSha = String(body.final_sha || '').trim();
    const deployedFinalSha = String(Deno.env.get('CAMBRA_GIT_SHA') || '').trim();
    const finalSha = requestedFinalSha || runtimeGitSha(body);
    if (['verify_runtime','enable_sending_profile_warmup','emergency_drill','verify_founder_control'].includes(action) && (!requestedFinalSha || !deployedFinalSha || requestedFinalSha !== deployedFinalSha)) {
      return Response.json({ ok:false, error:'runtime_git_sha_mismatch', requested_final_sha:requestedFinalSha || null, deployed_runtime_sha:deployedFinalSha || null, note:'Set CAMBRA_GIT_SHA in the deployed Base44 runtime to the exact immutable final SHA.' }, { status:409 });
    }
    if (action === 'status') {
      await svc.entities.OperationalLog.create({ event_type:'go_live_blockers_inspected', message:'Founder inspected GO-live blockers', data_json:{ final_sha:finalSha || null }, actor_email:actor, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      return Response.json({ ok:true, ...(await collectGoLiveRuntime(svc, body)) });
    }
    if (action === 'resend_register_webhook') {
      if (body.confirmation !== CONFIRM_RESEND_WEBHOOK) return Response.json({ ok:false, error:'confirmation_required', required:CONFIRM_RESEND_WEBHOOK }, { status:409 });
      return Response.json(await createResendWebhook(svc, String(body.target_url || '').trim(), actor));
    }
    if (action === 'verify_runtime') return Response.json({ ok:true, verification:await verifyRuntime(svc, finalSha, actor), go_live:await collectGoLiveRuntime(svc, body) });
    if (action === 'configure_cost_budget') {
      const current = await svc.entities.CostBudgetControl.filter({ control_key:'global', status:'active' }, '-approved_at', 20).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'critical'}));
      if(!Array.isArray(current))return Response.json({ok:false,error:'cost_budget_authority_unavailable',blockers:['cost_budget_authority_unavailable']},{status:503});
      if (current.length > 1) return Response.json({ ok:false, error:'multiple_active_cost_budgets', blockers:['multiple_active_cost_budgets'], active_control_count:current.length, conflicting_active_control_ids:current.map((row:any)=>String(row.id||'')).filter(Boolean) }, { status:409 });
      const active=current[0]||null;
      const configuredAt=new Date();
      const preservedReservation=costReservationStateForReconfiguration(active,configuredAt);
      const candidate = { control_key:'global', version:String(body.version || `founder-${Date.now()}`), status:'active', currency:'EUR', daily_total_limit_minor:Number(body.daily_total_limit_minor), monthly_total_limit_minor:Number(body.monthly_total_limit_minor), category_limits_json:body.category_limits_json || {}, estimated_unit_cost_minor_json:body.estimated_unit_cost_minor_json || {}, anomaly_warning_pct:Number(body.anomaly_warning_pct), hard_stop_pct:Number(body.hard_stop_pct), ...preservedReservation, approved_by:actor, approved_at:configuredAt.toISOString(), updated_by:actor, updated_at:configuredAt.toISOString() };
      const validation = validateCostBudget(candidate);
      if (!validation.ok) return Response.json({ ok:false, error:'invalid_cost_budget', blockers:validation.blockers }, { status:400 });
      const changeInput={current:active?{id:active.id,version:active.version,updated_at:active.updated_at||active.approved_at,reservation_revision:Number(active.reservation_revision),reservation_day_key:active.reservation_day_key,reservation_month_key:active.reservation_month_key,reserved_daily_total_minor:Number(active.reserved_daily_total_minor||0),reserved_monthly_total_minor:Number(active.reserved_monthly_total_minor||0),reservation_event_key_count:Array.isArray(active.reservation_recent_event_keys)?active.reservation_recent_event_keys.length:0,daily_total_limit_minor:active.daily_total_limit_minor,monthly_total_limit_minor:active.monthly_total_limit_minor,category_limits_json:active.category_limits_json,anomaly_warning_pct:active.anomaly_warning_pct,hard_stop_pct:active.hard_stop_pct}:null,next:{version:candidate.version,daily_total_limit_minor:candidate.daily_total_limit_minor,monthly_total_limit_minor:candidate.monthly_total_limit_minor,category_limits_json:candidate.category_limits_json,estimated_unit_cost_minor_json:candidate.estimated_unit_cost_minor_json,anomaly_warning_pct:candidate.anomaly_warning_pct,hard_stop_pct:candidate.hard_stop_pct}};
      const previewHash=await sha256(changeInput);
      const impact={daily_delta_minor:candidate.daily_total_limit_minor-Number(active?.daily_total_limit_minor||0),monthly_delta_minor:candidate.monthly_total_limit_minor-Number(active?.monthly_total_limit_minor||0),hard_caps_only:true,agents_cannot_self_increase:true,paid_execution_remains_fail_closed:true,reservation_journal_preserved:Boolean(active)};
      if(body.confirmed!==true){
        const commandKey=String(body.command_key||`cost-budget:${crypto.randomUUID()}`);
        const preview={action:'configure_cost_budget',old_value:changeInput.current,new_value:changeInput.next,impact,preview_hash:previewHash,expires_at:new Date(Date.now()+10*60_000).toISOString()};
        await svc.entities.FounderCommandAudit.create({command_key:commandKey,actor_email:actor,intent:'cost_budget',action:'configure_cost_budget',scope_json:{control_key:'global'},risk_level:4,material:true,requires_confirmation:true,confirmed:false,preview_json:preview,status:'previewed',result_json:{},policy_json:{go_live_control:'v0.97'},created_at:new Date().toISOString()});
        return Response.json({ok:true,requires_confirmation:true,confirmation_required:CONFIRM_BUDGET,command_key:commandKey,preview,validation});
      }
      if (body.confirmation !== CONFIRM_BUDGET) return Response.json({ ok:false, error:'confirmation_required', required:CONFIRM_BUDGET }, { status:409 });
      const commandKey=String(body.command_key||'');
      if(!commandKey)return Response.json({ok:false,error:'preview_command_key_required'},{status:409});
      const replay=(await svc.entities.FounderCommandAudit.filter({command_key:commandKey,actor_email:actor,status:'executed'},'-created_at',2).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.cost_budget_replay_read',fallback:[],severity:'critical'})))[0];
      if(replay)return Response.json({ok:true,idempotent_replay:true,command_key:commandKey,control:replay.result_json?.control||null,validation});
      const stored=(await svc.entities.FounderCommandAudit.filter({command_key:commandKey,actor_email:actor,action:'configure_cost_budget',status:'previewed'},'-created_at',2).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.cost_budget_preview_read',fallback:[],severity:'critical'})))[0];
      if(!stored||String(stored.actor_email||'')!==actor||stored.preview_json?.preview_hash!==previewHash||body.preview_hash!==previewHash||Date.parse(stored.preview_json?.expires_at||'')<=Date.now())return Response.json({ok:false,error:'cost_budget_preview_stale',current_preview_hash:previewHash},{status:409});
      let control:any;
      if(active){
        const expectedRevision=Number(active.reservation_revision);
        const next={...candidate,reservation_revision:expectedRevision+1};
        const changed=await svc.entities.CostBudgetControl.updateMany({id:active.id,status:'active',version:String(active.version),reservation_revision:expectedRevision},{$set:next}).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.cost_budget_revision_claim',fallback:null,severity:'critical'}));
        if(!updatedExactlyOne(changed))return Response.json({ok:false,error:'cost_budget_changed_concurrently',note:'No configuration or reservation state was overwritten. Request a fresh preview.'},{status:409});
        control=await svc.entities.CostBudgetControl.get(active.id).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.cost_budget_update_readback',fallback:null,severity:'critical'}));
        if(!control)throw Object.assign(new Error('cost_budget_update_verification_unavailable'),{status:503,code:'cost_budget_update_verification_unavailable'});
      }else{
        // A bootstrap row is visible but deliberately non-spendable until the
        // post-create uniqueness check completes. This removes the otherwise
        // unsafe interval between create() and concurrent-bootstrap detection.
        control=await svc.entities.CostBudgetControl.create({...candidate,emergency_stop_active:true,emergency_stop_reason:'budget_bootstrap_validation_pending'});
        const activeAfter=await svc.entities.CostBudgetControl.filter({control_key:'global',status:'active'},'-approved_at',20).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.cost_budget_bootstrap_authority_read',fallback:[],severity:'critical'}));
        if(activeAfter.length!==1||String(activeAfter[0]?.id||'')!==String(control.id||'')){
          await svc.entities.CostBudgetControl.updateMany({id:control.id,status:'active',reservation_revision:Number(control.reservation_revision||0)},{$set:{status:'paused',emergency_stop_active:true,emergency_stop_reason:'concurrent_budget_bootstrap_conflict',reservation_revision:Number(control.reservation_revision||0)+1,updated_by:'cost_governor',updated_at:new Date().toISOString()}}).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.contain_cost_budget_bootstrap_conflict',fallback:null,severity:'critical'}));
          return Response.json({ok:false,error:'cost_budget_bootstrap_conflict',blockers:['single_active_cost_budget_required'],active_control_count:activeAfter.length,note:'The concurrent candidate was contained. Paid execution remains fail-closed until exactly one active budget is confirmed.'},{status:409});
        }
        const bootstrapRevision=Number(control.reservation_revision||0);
        const activated=await svc.entities.CostBudgetControl.updateMany({id:control.id,status:'active',reservation_revision:bootstrapRevision,emergency_stop_active:true},{$set:{emergency_stop_active:false,emergency_stop_reason:'',reservation_revision:bootstrapRevision+1,updated_by:actor,updated_at:new Date().toISOString()}}).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.activate_cost_budget_bootstrap',fallback:null,severity:'critical'}));
        if(!updatedExactlyOne(activated)){
          await svc.entities.CostBudgetControl.updateMany({id:control.id,status:'active'},{$set:{status:'paused',emergency_stop_active:true,emergency_stop_reason:'budget_bootstrap_activation_conflict',updated_by:'cost_governor',updated_at:new Date().toISOString()}}).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.contain_cost_budget_activation_conflict',fallback:null,severity:'critical'}));
          return Response.json({ok:false,error:'cost_budget_bootstrap_conflict',blockers:['budget_bootstrap_activation_conflict'],note:'The provisional budget never became spendable.'},{status:409});
        }
        control=await svc.entities.CostBudgetControl.get(control.id).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.cost_budget_bootstrap_readback',fallback:null,severity:'critical'}));
        if(!control)throw Object.assign(new Error('cost_budget_bootstrap_verification_unavailable'),{status:503,code:'cost_budget_bootstrap_verification_unavailable'});
      }
      const audit=await svc.entities.FounderCommandAudit.create({command_key:commandKey,actor_email:actor,intent:'cost_budget',action:'configure_cost_budget',scope_json:{control_key:'global'},risk_level:4,material:true,requires_confirmation:true,confirmed:true,preview_json:stored.preview_json,status:'executed',result_json:{control:{id:control.id,version:control.version,daily_total_limit_minor:control.daily_total_limit_minor,monthly_total_limit_minor:control.monthly_total_limit_minor},impact},policy_json:{go_live_control:'v0.97'},created_at:new Date().toISOString()});
      await svc.entities.OperationalLog.create({ event_type:'cost_budget_changed', message:candidate.version, data_json:{ command_key:commandKey,audit_id:audit.id,old_value:changeInput.current,new_value:changeInput.next,impact,version:candidate.version,daily_total_limit_minor:candidate.daily_total_limit_minor,monthly_total_limit_minor:candidate.monthly_total_limit_minor }, actor_email:actor, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      return Response.json({ ok:true, command_key:commandKey,audit_id:audit.id,control,validation,impact });
    }
    if (action === 'configure_sending_profile') {
      if (body.confirmation !== CONFIRM_PROFILE) return Response.json({ ok:false, error:'confirmation_required', required:CONFIRM_PROFILE }, { status:409 });
      const provider = String(body.provider || '').toLowerCase();
      const fromAddress = String(body.from_address || '').trim().toLowerCase();
      const domain = String(body.domain || fromAddress.split('@')[1] || '').trim().toLowerCase();
      const profileKey = String(body.profile_key || '').trim();
      const selectors = [...new Set((Array.isArray(body.dkim_selectors) ? body.dkim_selectors : []).map((value:any) => String(value || '').trim().toLowerCase()).filter(Boolean))].slice(0,10);
      const currentCap = Number(body.current_daily_cap), targetCap = Number(body.target_daily_cap);
      const blockers = [
        !['resend','outlook','instantly'].includes(provider) ? 'supported_provider_required' : '',
        !profileKey || !profileKey.startsWith(`${provider}:`) ? 'provider_scoped_profile_key_required' : '',
        !fromAddress.includes('@') || fromAddress.split('@')[1] !== domain ? 'from_address_must_match_domain' : '',
        selectors.length === 0 ? 'explicit_dkim_selectors_required' : '',
        !Number.isInteger(currentCap) || currentCap < 1 || currentCap > 15 ? 'canary_current_daily_cap_must_be_1_to_15' : '',
        !Number.isInteger(targetCap) || targetCap < currentCap || targetCap > 500 ? 'target_daily_cap_invalid' : '',
      ].filter(Boolean);
      if (blockers.length) return Response.json({ ok:false, error:'invalid_sending_profile', blockers }, { status:400 });
      const previous = (await svc.entities.OutboundSendingProfile.filter({ profile_key:profileKey }, '-created_date', 2).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'})))[0] || null;
      const values = { profile_key:profileKey, provider, domain, from_address:fromAddress, dkim_selectors:selectors, status:'paused', current_daily_cap:currentCap, target_daily_cap:targetCap, ramp_step:Math.max(1, Math.min(Number(body.ramp_step || 5), 50)), ramp_min_days:Math.max(3, Math.min(Number(body.ramp_min_days || 3), 30)), bounce_pause_threshold_pct:Math.max(0.1, Math.min(Number(body.bounce_pause_threshold_pct || 3), 10)), complaint_pause_threshold_pct:Math.max(0.01, Math.min(Number(body.complaint_pause_threshold_pct || 0.1), 1)), complaint_slow_threshold_pct:Math.max(0.01, Math.min(Number(body.complaint_slow_threshold_pct || 0.08), 1)), burst_per_minute:Math.max(1, Math.min(Number(body.burst_per_minute || 3), 30)), open_tracking:false, click_tracking:false, ...(provider==='instantly'?{webhook_status:'NOT_CONFIGURED',provider_config_json:{account_emails:Array.isArray(body.account_emails)?body.account_emails.map((value:any)=>String(value).trim().toLowerCase()).filter(Boolean):[],transport_role_only:true,supersearch_enabled:false}}:{}), notes:String(body.notes || 'Founder-configured; remains paused until GO canary activation.').slice(0,500), last_review_at:new Date().toISOString() };
      const profile = previous ? await svc.entities.OutboundSendingProfile.update(previous.id, values) : await svc.entities.OutboundSendingProfile.create(values);
      await svc.entities.OperationalLog.create({ event_type:'sending_profile_configured', message:profileKey, data_json:{ profile_key:profileKey, provider, domain, dkim_selectors:selectors, current_daily_cap:currentCap, target_daily_cap:targetCap, forced_status:'paused' }, actor_email:actor, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      return Response.json({ ok:true, profile, note:'Profile is deliberately paused. Verify DNS/runtime, activate a matching CANARY policy, run fresh preflight, then explicitly start canary.' });
    }
    if (action === 'enable_sending_profile_warmup') {
      if (body.confirmation !== CONFIRM_PROFILE_WARMUP) return Response.json({ ok:false, error:'confirmation_required', required:CONFIRM_PROFILE_WARMUP }, { status:409 });
      const profileKey = String(body.profile_key || '').trim();
      const profile = (await svc.entities.OutboundSendingProfile.filter({ profile_key:profileKey }, '-created_date', 2).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'})))[0] || null;
      if (!profile) return Response.json({ ok:false, error:'sending_profile_not_found' }, { status:404 });
      if (profile.status !== 'paused') return Response.json({ ok:false, error:'sending_profile_must_be_paused_before_warmup', status:profile.status }, { status:409 });
      if (!Number.isInteger(Number(profile.current_daily_cap)) || Number(profile.current_daily_cap) < 1 || Number(profile.current_daily_cap) > 15) return Response.json({ ok:false, error:'canary_daily_cap_must_be_1_to_15' }, { status:409 });
      // The overall deliverability gate may remain BLOCKED because another,
      // unused/paused profile or provider webhook is not ready. Warm-up is
      // profile-scoped, so accept a fresh real-runtime row only when THIS
      // profile's SPF/DKIM/DMARC triple is explicitly proven. This never starts
      // outbound and does not upgrade the aggregate DELIVERABILITY_DNS gate.
      const evidenceRows = await svc.entities.RuntimeGateEvidence.filter({ gate_key:'DELIVERABILITY_DNS', evidence_kind:'REAL_RUNTIME', git_sha:finalSha }, '-observed_at', 20).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'}));
      let evidence:any=null;
      for(const row of evidenceRows){
        const verification=await verifyRuntimeGateEvidence(row,{environment:'production',max_age_hours:24});
        const matchingProfile = (row.details_json?.profiles || []).find((item:any) => item.profile_key === profileKey);
        if(verification.ok&&matchingProfile?.spf_pass===true&&matchingProfile?.dkim_pass===true&&matchingProfile?.dmarc_pass===true){evidence=row;break;}
      }
      if (!evidence) return Response.json({ ok:false, error:'fresh_matching_deliverability_evidence_required', profile_key:profileKey, instruction:'Run Verify real runtime after configuring the paused profile.' }, { status:409 });
      const updated = await svc.entities.OutboundSendingProfile.update(profile.id, { status:'warming', healthy_days:0, last_ramp_at:new Date().toISOString(), last_review_at:new Date().toISOString(), notes:'Founder enabled warm-up after fresh real-runtime SPF/DKIM/DMARC and credential verification.' });
      await svc.entities.OperationalLog.create({ event_type:'sending_profile_warmup_enabled', message:profileKey, data_json:{ profile_key:profileKey, evidence_id:evidence.id, current_daily_cap:profile.current_daily_cap, final_sha:finalSha }, actor_email:actor, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      return Response.json({ ok:true, profile:updated, evidence_id:evidence.id, note:'Warm-up enabled at the existing 1–15/day cap. Outbound itself remains independently paused until GO preflight and explicit canary start.' });
    }
    if (action === 'pause_sending_profile') {
      if (body.confirmation !== CONFIRM_PROFILE_PAUSE) return Response.json({ ok:false, error:'confirmation_required', required:CONFIRM_PROFILE_PAUSE }, { status:409 });
      const profileKey = String(body.profile_key || '').trim();
      const profile = (await svc.entities.OutboundSendingProfile.filter({ profile_key:profileKey }, '-created_date', 2).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'})))[0] || null;
      if (!profile) return Response.json({ ok:false, error:'sending_profile_not_found' }, { status:404 });
      const updated = await svc.entities.OutboundSendingProfile.update(profile.id, { status:'paused', last_review_at:new Date().toISOString(), notes:String(body.reason || 'Founder paused sending profile.').slice(0,500) });
      await svc.entities.OperationalLog.create({ event_type:'sending_profile_paused', message:profileKey, data_json:{ profile_key:profileKey, previous_status:profile.status }, actor_email:actor, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      return Response.json({ ok:true, profile:updated });
    }
    if (action === 'clear_cost_emergency_stop') {
      if (body.confirmation !== CONFIRM_CLEAR_COST) return Response.json({ ok:false, error:'confirmation_required', required:CONFIRM_CLEAR_COST }, { status:409 });
      const snapshot = await costRuntimeSnapshot(svc);
      if (!snapshot.control) return Response.json({ ok:false, error:'active_cost_budget_required' }, { status:409 });
      if (snapshot.validation.blockers.some((blocker:string) => blocker !== 'cost_emergency_stop_active')) return Response.json({ ok:false, error:'cost_budget_still_invalid', blockers:snapshot.validation.blockers }, { status:409 });
      if(snapshot.control.emergency_stop_active!==true)return Response.json({ok:true,already_clear:true,control:snapshot.control,note:'Outbound remains paused until an independent, fresh GO preflight and explicit canary start.'});
      const stopKey=String(snapshot.control.emergency_stop_key||'');
      const cleared=await clearOwnedCostEmergencyStop(svc,{control_id:snapshot.control.id,expected_revision:Number(snapshot.control.reservation_revision),stop_key:stopKey,actor});
      if(!cleared.ok)return Response.json({ok:false,error:cleared.error||'cost_emergency_stop_changed_concurrently',control:cleared.control||null,note:'A concurrent reservation or newer stop won. The stop remains fail-closed; inspect current state before retrying.'},{status:409});
      const control=cleared.control;
      const incidents = await svc.entities.AutonomyIncident.filter({ dedupe_key:'cost-budget-emergency-stop', status:'open' }, '-last_seen_at', 20).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'}));
      for (const incident of incidents) {
        if(stopKey&&String(incident.details_json?.stop_key||'')!==stopKey)continue;
        await svc.entities.AutonomyIncident.updateMany({id:incident.id,status:'open',...(stopKey?{'details_json.stop_key':stopKey}:{})},{$set:{status:'resolved',workflow_state:'resolved',resolved_at:new Date().toISOString(),recovery_json:{source:'founder_reviewed_cost_stop_clear',budget_version:control.version,stop_key:stopKey}}}).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      }
      const verified=await svc.entities.CostBudgetControl.get(control.id).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin.verify_cost_stop_clear',fallback:null,severity:'critical'}));
      if(!verified||verified.emergency_stop_active===true)return Response.json({ok:false,error:'newer_cost_emergency_stop_won',control:verified,note:'A newer cost stop remains active and was not cleared.'},{status:409});
      await svc.entities.OperationalLog.create({ event_type:'cost_emergency_stop_cleared', message:'Founder cleared cost stop after review', data_json:{ budget_version:control.version,stop_key:stopKey,cleared_revision:cleared.reservation_revision }, actor_email:actor, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      return Response.json({ ok:true, control, note:'Outbound remains paused until an independent, fresh GO preflight and explicit canary start.' });
    }
    if (action === 'cost_kill_switch_drill') {
      if (body.confirmation !== CONFIRM_COST_DRILL) return Response.json({ ok:false, error:'confirmation_required', required:CONFIRM_COST_DRILL }, { status:409 });
      const outbound = await getOutboundRow(svc);
      if (outbound?.acquisition_enabled === true) return Response.json({ ok:false, error:'cost_drill_requires_outbound_paused' }, { status:409 });
      const before = await costRuntimeSnapshot(svc);
      if (!before.control || !before.validation.ok) return Response.json({ ok:false, error:'valid_active_cost_budget_required', blockers:before.validation.blockers }, { status:409 });
      const drillKey=`cost-stop-drill:${crypto.randomUUID()}`;
      const activation=await activateCostEmergencyStop(svc, before.control, 'founder_cost_kill_switch_drill', { operator_exercise:true, require_inactive:true, stop_key:drillKey, stop_owner:actor, incident_dedupe_key:`cost-budget-emergency-stop-drill:${drillKey}`, no_paid_provider_call:true });
      const activated=activation.claim?.control||null;
      const incident=activation.incident||null;
      const outboundAfterStop = await getOutboundRow(svc);
      const stopPass = activation.claim?.acquired===true&&activated?.emergency_stop_active === true && activated?.emergency_stop_key===drillKey && incident?.severity === 'critical' && outboundAfterStop?.acquisition_enabled !== true;
      const clear=stopPass?await clearOwnedCostEmergencyStop(svc,{control_id:before.control.id,expected_revision:Number(activated.reservation_revision),stop_key:drillKey,actor}):{ok:false,cleared:false,error:'drill_stop_not_owned'};
      if (clear.ok&&incident?.id) await svc.entities.AutonomyIncident.updateMany({id:incident.id,status:'open','details_json.stop_key':drillKey},{$set:{status:'resolved',workflow_state:'resolved',resolved_at:new Date().toISOString(),recovery_json:{source:'founder_cost_kill_switch_drill',safe_clear:true,no_paid_provider_call:true,stop_key:drillKey}}}).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      const after = await costRuntimeSnapshot(svc);
      const resumePass = clear.ok===true && after.validation.ok === true && after.control?.emergency_stop_active!==true && outboundAfterStop?.acquisition_enabled !== true;
      const pass = stopPass && resumePass;
      const evidence = await recordRuntimeGateEvidence(svc, { gate_key:'COST_ANOMALY_ALERTS', git_sha:finalSha, status:pass ? 'PASS':'FAIL', evidence_kind:'OPERATOR_EXERCISE', source:'goLiveControlAdmin.cost_kill_switch_drill', details_json:{ stop_pass:stopPass, safe_clear_pass:resumePass, stop_key:drillKey, stop_claim_revision:activated?.reservation_revision||null, clear_error:clear.error||null, incident_id:incident?.id || null, outbound_remains_paused:outboundAfterStop?.acquisition_enabled !== true, no_paid_provider_call:true }, observed_at:new Date().toISOString(), expires_at:new Date(Date.now()+169*3600000).toISOString(), recorded_by:actor });
      await svc.entities.OperationalLog.create({ event_type:'cost_kill_switch_drill_completed', message:pass ? 'PASS':'FAIL', data_json:evidence.details_json, actor_email:actor, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:null,severity:'secondary'}));
      return Response.json({ ok:true, pass, stop_pass:stopPass, safe_clear_pass:resumePass, evidence_id:evidence.id, outbound_remains_paused:true });
    }
    if (action === 'emergency_drill') {
      if (body.confirmation !== CONFIRM_DRILL) return Response.json({ ok:false, error:'confirmation_required', required:CONFIRM_DRILL }, { status:409 });
      return Response.json({ ok:true, drill:await emergencyDrill(svc, finalSha, actor), go_live:await collectGoLiveRuntime(svc, body) });
    }
    if (action === 'verify_founder_control') {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const logs = await svc.entities.OperationalLog.filter({ created_at:{ $gte:since } }, '-created_at', 2000).catch((error:any)=>safeBestEffort(error,{operation:'goLiveControlAdmin',fallback:[],severity:'secondary'}));
      const has = (event:string, predicate=(row:any)=>true) => logs.some((row:any) => row.event_type === event && predicate(row));
      const checks = {
        blockers_inspected:has('go_live_blockers_inspected'),
        cost_limits_changed:has('cost_budget_changed'),
        canary_limits_changed:has('commercial_policy_activated', (row:any) => ['merchant_acquisition','partner_acquisition'].includes(String(row.data_json?.snapshot?.engine || '')) && Number(row.data_json?.snapshot?.daily_send_limit) >= 1 && Number(row.data_json?.snapshot?.daily_send_limit) <= 15),
        sending_profile_configured:has('sending_profile_configured'),
        sending_profile_warmup_enabled:has('sending_profile_warmup_enabled'),
        emergency_stop_and_resume:has('emergency_control_changed',(row:any)=>row.data_json?.action==='safe_mode_on'&&row.data_json?.resulting_state?.safe_mode===true)&&has('emergency_control_changed',(row:any)=>row.data_json?.action==='resume_selected'&&row.data_json?.resulting_state?.safe_mode===false),
        approval_approved:has('founder_os_command', (row:any) => row.data_json?.preview?.action === 'resolve_approval' && row.data_json?.preview?.decision === 'approve' && row.data_json?.result?.ok !== false),
        approval_rejected:has('founder_os_command', (row:any) => row.data_json?.preview?.action === 'resolve_approval' && row.data_json?.preview?.decision === 'reject' && row.data_json?.result?.ok !== false),
        canary_control_exercised:has('commercial_canary_control_exercised'),
      };
      const pass = Object.values(checks).every(Boolean);
      const evidence = await recordRuntimeGateEvidence(svc, { gate_key:'FOUNDER_CONTROL', git_sha:finalSha, status:pass ? 'PASS':'BLOCKED', evidence_kind:'OPERATOR_EXERCISE', source:'goLiveControlAdmin.verify_founder_control', details_json:{ checks, window_from:since }, observed_at:new Date().toISOString(), expires_at:new Date(Date.now()+169*3600000).toISOString(), recorded_by:actor });
      return Response.json({ ok:true, pass, checks, evidence_id:evidence.id, go_live:await collectGoLiveRuntime(svc, body) });
    }
    return Response.json({ ok:false, error:'unsupported_action', actions:['status','resend_register_webhook','verify_runtime','configure_cost_budget','configure_sending_profile','enable_sending_profile_warmup','pause_sending_profile','clear_cost_emergency_stop','cost_kill_switch_drill','emergency_drill','verify_founder_control'] }, { status:400 });
  } catch (error:any) {
    console.error('goLiveControlAdmin failed', error);
    return operationErrorResponse(error,'goLiveControlAdmin','go_live_control_failed');
  }
}
