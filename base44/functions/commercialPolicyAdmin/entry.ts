import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { COMMUNICATION_STYLE_POLICY_VERSION } from '../../shared/commercialAutonomy.ts';
import { acquisitionEngine, validateCanaryPolicy } from '../../shared/commercialActivation.ts';

const DEFAULT_PROHIBITED = [
  'accept_final_offer','sign_contract','accept_lock_in','accept_minimum_commitment','accept_termination_fee',
  'migration_go_live','financial_override','change_recover_economics','send_sensitive_document'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'commercialPolicyAdmin',fallback:null,severity:'critical'}));
    if (!user || user.role !== 'admin') return Response.json({ ok:false, error:'forbidden' }, { status:403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'list');
    const svc = base44.asServiceRole;

    if (action === 'list') {
      const rows = await svc.entities.CommercialPolicy.list('-created_date', 100).catch((error:any)=>safeBestEffort(error,{operation:'commercialPolicyAdmin',fallback:[],severity:'critical'}));
      return Response.json({ ok:true, policies: rows });
    }

    if (action === 'create_draft') {
      const engine = body?.engine === 'provider_negotiation' ? 'provider_negotiation' : body?.engine === 'partner_acquisition' ? 'partner_acquisition' : 'merchant_acquisition';
      const version = String(body?.version || `2026.08.09-${engine}-v1`);
      const countries = Array.isArray(body?.countries) ? [...new Set(body.countries.map((x:any)=>String(x||'').trim().toUpperCase()).filter(Boolean))].slice(0, 20) : [];
      const profileKeys = Array.isArray(body?.sending_profile_keys) ? [...new Set(body.sending_profile_keys.map((x:any)=>String(x||'').trim()).filter(Boolean))].slice(0, 20) : [];
      const requestedDaily = body?.daily_send_limit === undefined ? 10 : Number(body.daily_send_limit);
      const requestedScore = body?.min_lead_score === undefined ? 70 : Number(body.min_lead_score);
      const allowedDefault = engine === 'merchant_acquisition'
        ? ['initial_outreach','routine_reply','follow_up','meeting_offer']
        : engine === 'partner_acquisition'
          ? ['partner_outreach','routine_reply','follow_up','meeting_offer']
          : ['provider_contact','routine_reply','pricing_request','clarification','counterproposal','technical_question','implementation_question','contract_request','follow_up'];
      const row = await svc.entities.CommercialPolicy.create({
        policy_key: `${engine}:${version}`,
        version,
        engine,
        status: 'draft',
        mode: acquisitionEngine(engine) ? 'CANARY' : String(body?.mode || 'STANDARD'),
        countries,
        icp_json: engine === 'merchant_acquisition' ? (body?.icp_json || { discovery_enabled:false, industry:'ecommerce', verticals:['ecommerce','retail','consumer brands'], titles:['Founder','CEO','CFO','COO','Finance Director','Head of Finance','Head of Payments','Payments Manager','Head of Ecommerce','Ecommerce Director'], seniorities:['owner','founder','c_suite','vp','head','director','manager'], employee_ranges:['10,50','50,200','200,1000'], per_run:100, partitions_per_run:1, enrichment_threshold:45, enrichment_daily_limit:25, enrichment_weekly_limit:125, target_unique_companies:10000, provider_priority:['apollo','public'] }) : engine === 'partner_acquisition' ? (body?.icp_json || { partner_types:['accounting_firm','fractional_cfo','ecommerce_agency','boutique_consultancy'], titles:['partner','founder','managing director','fractional CFO','ecommerce director','consultant'], per_run:20 }) : {},
        excluded_domains: Array.isArray(body?.excluded_domains) ? body.excluded_domains.map((x:any)=>String(x).toLowerCase()).slice(0,200) : [],
        languages: Array.isArray(body?.languages) ? body.languages.filter((x:any)=>['en','fr','es'].includes(x)) : ['en','fr','es'],
        daily_send_limit: Number.isFinite(requestedDaily) ? Math.max(0, Math.min(Math.floor(requestedDaily), 500)) : 0,
        sending_profile_keys: profileKeys,
        min_lead_score: Number.isFinite(requestedScore) ? Math.max(0, Math.min(requestedScore, 100)) : 0,
        min_opportunity_score: Math.max(0,Math.min(100,Number(body?.min_opportunity_score??50))),
        min_confidence: Math.max(0,Math.min(1,Number(body?.min_confidence??0.55))),
        autonomous_replies_enabled: body?.autonomous_replies_enabled!==false,
        meeting_proposals_enabled: body?.meeting_proposals_enabled===true,
        provider_selection_json: body?.provider_selection_json||{mode:'sending_profile_allowlist',fallback_requires_preflight:true},
        approval_thresholds_json: body?.approval_thresholds_json||{material_commitments:'human_required',risk_level:4},
        qualification_rules_json: body?.qualification_rules_json||{positive_reply_alone_is_insufficient:true,evidence_required:true},
        negotiation_authority_json: body?.negotiation_authority_json||{binding_acceptance:false,custom_economics:false,legal_terms:false},
        risk_controls_json: body?.risk_controls_json||{stop_on_reply:true,stop_on_suppression:true,provider_ai_reply:false},
        business_hours_start: Math.max(0, Math.min(Number(body?.business_hours_start) || 8, 23)),
        business_hours_end: Math.max(1, Math.min(Number(body?.business_hours_end) || 19, 24)),
        fallback_timezone: String(body?.fallback_timezone || 'Europe/Paris'),
        minimum_inbound_reply_delay_minutes: 25,
        max_followups: Math.max(0, Math.min(Number(body?.max_followups) || 3, 5)),
        followup_intervals_hours: Array.isArray(body?.followup_intervals_hours) ? body.followup_intervals_hours.slice(0,5) : [72,120,168],
        allowed_routine_actions: Array.isArray(body?.allowed_routine_actions) ? body.allowed_routine_actions : allowedDefault,
        prohibited_actions: Array.from(new Set([...(Array.isArray(body?.prohibited_actions) ? body.prohibited_actions : []), ...DEFAULT_PROHIBITED])),
        identity_label: String(body?.identity_label || (engine === 'provider_negotiation' ? 'CAMBRA Payments' : engine === 'partner_acquisition' ? 'CAMBRA Partnerships' : 'CAMBRA')),
        style_policy_version: COMMUNICATION_STYLE_POLICY_VERSION,
        claims_policy_json: body?.claims_policy_json || { financial_claims: 'evidence_required', identity: 'no_invented_staff', thread_language: 'preserve' }
      });
      return Response.json({ ok:true, policy: row });
    }

    const policyId = String(body?.policy_id || '');
    if (!policyId) return Response.json({ ok:false, error:'policy_id_required' }, { status:400 });
    const policy = await svc.entities.CommercialPolicy.get(policyId).catch((error:any)=>safeBestEffort(error,{operation:'commercialPolicyAdmin',fallback:null,severity:'critical'}));
    if (!policy) return Response.json({ ok:false, error:'not_found' }, { status:404 });

    if (action === 'configure_discovery') {
      if (policy.engine !== 'merchant_acquisition') return Response.json({ ok:false, error:'merchant_acquisition_policy_required' }, { status:409 });
      const enabled = body?.enabled === true;
      const expectedConfirmation = enabled ? 'START_AUTONOMOUS_DISCOVERY' : 'PAUSE_AUTONOMOUS_DISCOVERY';
      if (body?.confirmation !== expectedConfirmation) return Response.json({ ok:false, error:'confirmation_required', expected_confirmation:expectedConfirmation }, { status:409 });
      const countries = Array.isArray(body?.countries)
        ? [...new Set(body.countries.map((value:any) => String(value || '').trim().toUpperCase()).filter(Boolean))].slice(0,33)
        : Array.isArray(policy.countries) ? policy.countries : [];
      if (enabled && !countries.length) return Response.json({ ok:false, error:'discovery_markets_required' }, { status:409 });
      const current = policy.icp_json && typeof policy.icp_json === 'object' ? policy.icp_json : {};
      const boundedArray = (value:any, fallback:any[], max:number) => Array.isArray(value) ? value.map((item:any)=>String(item||'').trim()).filter(Boolean).slice(0,max) : fallback;
      const icp = {
        ...current,
        discovery_enabled: enabled,
        profile_name:String(body?.profile_name??current.profile_name??policy.version).trim().slice(0,120),
        profile_description:String(body?.profile_description??current.profile_description??'').trim().slice(0,500),
        provider_mode:['AUTO','APOLLO','INSTANTLY'].includes(String(body?.provider_mode??current.provider_mode??'AUTO').toUpperCase())?String(body?.provider_mode??current.provider_mode??'AUTO').toUpperCase():'AUTO',
        priority:Math.max(0,Math.min(100,Number(body?.priority??current.priority??50))),
        provider_expiry_at: '2026-09-07T23:59:59.999Z',
        provider_priority: boundedArray(body?.provider_priority, current.provider_priority || ['apollo','public'], 10),
        verticals: boundedArray(body?.verticals, current.verticals || ['ecommerce','retail','consumer brands'], 20),
        titles: boundedArray(body?.titles, current.titles || ['Founder','CEO','CFO','COO','Finance Director','Head of Finance','Head of Payments','Payments Manager','Head of Ecommerce','Ecommerce Director'], 30),
        seniorities: boundedArray(body?.seniorities, current.seniorities || ['owner','founder','c_suite','vp','head','director','manager'], 12),
        employee_ranges: boundedArray(body?.employee_ranges, current.employee_ranges || ['10,50','50,200','200,1000'], 12),
        revenue_ranges: boundedArray(body?.revenue_ranges,current.revenue_ranges||[],12),
        technologies: boundedArray(body?.technologies,current.technologies||[],50),
        excluded_technologies: boundedArray(body?.excluded_technologies,current.excluded_technologies||[],50),
        include_keywords: boundedArray(body?.include_keywords,current.include_keywords||[],50),
        exclude_keywords: boundedArray(body?.exclude_keywords,current.exclude_keywords||[],50),
        per_run: Math.max(1, Math.min(100, Math.floor(Number(body?.per_run ?? current.per_run ?? 100)))),
        partitions_per_run: Math.max(1, Math.min(4, Math.floor(Number(body?.partitions_per_run ?? current.partitions_per_run ?? 1)))),
        enrichment_threshold: Math.max(0, Math.min(100, Number(body?.enrichment_threshold ?? current.enrichment_threshold ?? 45))),
        enrichment_daily_limit: Math.max(0, Math.min(250, Math.floor(Number(body?.enrichment_daily_limit ?? current.enrichment_daily_limit ?? 25)))),
        enrichment_weekly_limit: Math.max(0, Math.min(1250, Math.floor(Number(body?.enrichment_weekly_limit ?? current.enrichment_weekly_limit ?? 125)))),
        target_unique_companies: Math.max(100, Math.min(250000, Math.floor(Number(body?.target_unique_companies ?? current.target_unique_companies ?? 10000)))),
        updated_by: user.email,
        updated_at: new Date().toISOString(),
      };
      const updated = await svc.entities.CommercialPolicy.update(policy.id, { countries, icp_json:icp });
      await svc.entities.OperationalLog.create({ event_type:enabled?'autonomous_discovery_started':'autonomous_discovery_paused', message:`${policy.policy_key}:${enabled?'ACTIVE':'PAUSED'}`, data_json:{ policy_id:policy.id, countries, icp_json:icp, outbound_policy_status_unchanged:policy.status }, actor_email:user.email, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'commercialPolicyAdmin',fallback:null,severity:'critical'}));
      return Response.json({ ok:true, policy:updated, discovery_enabled:enabled, outbound_policy_status:policy.status });
    }

    if (action === 'update_draft') {
      if (policy.status !== 'draft') return Response.json({ ok:false, error:'only_draft_policies_are_editable' }, { status:409 });
      const requestedDaily = Number(body?.daily_send_limit);
      const requestedScore = Number(body?.min_lead_score);
      const patch = {
        countries:Array.isArray(body?.countries) ? [...new Set(body.countries.map((value:any) => String(value || '').trim().toUpperCase()).filter(Boolean))].slice(0,20) : policy.countries || [],
        sending_profile_keys:Array.isArray(body?.sending_profile_keys) ? [...new Set(body.sending_profile_keys.map((value:any) => String(value || '').trim()).filter(Boolean))].slice(0,20) : policy.sending_profile_keys || [],
        daily_send_limit:Number.isFinite(requestedDaily) ? Math.max(0, Math.min(Math.floor(requestedDaily), 500)) : Number(policy.daily_send_limit || 0),
        min_lead_score:Number.isFinite(requestedScore) ? Math.max(0, Math.min(requestedScore, 100)) : Number(policy.min_lead_score || 0),
        min_opportunity_score:Number.isFinite(Number(body?.min_opportunity_score))?Math.max(0,Math.min(100,Number(body.min_opportunity_score))):Number(policy.min_opportunity_score||50),
        min_confidence:Number.isFinite(Number(body?.min_confidence))?Math.max(0,Math.min(1,Number(body.min_confidence))):Number(policy.min_confidence||0.55),
        autonomous_replies_enabled:body?.autonomous_replies_enabled===undefined?policy.autonomous_replies_enabled!==false:body.autonomous_replies_enabled===true,
        meeting_proposals_enabled:body?.meeting_proposals_enabled===undefined?policy.meeting_proposals_enabled===true:body.meeting_proposals_enabled===true,
      };
      if (acquisitionEngine(policy.engine)) {
        const validation = validateCanaryPolicy({ ...policy, ...patch, status:'active' });
        if (!validation.ok) return Response.json({ ok:false, error:'canary_policy_not_ready', blockers:validation.blockers }, { status:400 });
      }
      const updated = await svc.entities.CommercialPolicy.update(policy.id, patch);
      await svc.entities.OperationalLog.create({ event_type:'commercial_policy_draft_updated', message:`${policy.engine}:${policy.version}`, data_json:{ policy_id:policy.id, ...patch }, actor_email:user.email, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'commercialPolicyAdmin',fallback:null,severity:'critical'}));
      return Response.json({ ok:true, policy:updated });
    }

    if (action === 'activate') {
      if (body?.confirmation !== 'APPROVE_AUTONOMY_POLICY') return Response.json({ ok:false, error:'confirmation_required' }, { status:409 });
      if (acquisitionEngine(policy.engine)) {
        const validation=validateCanaryPolicy({...policy,status:'active'});
        if(!validation.ok)return Response.json({ok:false,error:'canary_policy_not_ready',blockers:validation.blockers},{status:409});
      }
      const peers = await svc.entities.CommercialPolicy.filter({ engine: policy.engine, status:'active' }, '-created_date', 100).catch((error:any)=>safeBestEffort(error,{operation:'commercialPolicyAdmin',fallback:[],severity:'critical'}));
      for (const peer of peers) if (peer.id !== policy.id) await svc.entities.CommercialPolicy.update(peer.id, { status:'superseded' });
      const now = new Date().toISOString();
      const snapshot = {
        engine: policy.engine, version: policy.version, mode:policy.mode||null, countries: policy.countries || [], languages: policy.languages || [],
        icp_json: policy.icp_json || {}, excluded_domains: policy.excluded_domains || [],
        daily_send_limit: policy.daily_send_limit, sending_profile_keys:policy.sending_profile_keys||[], min_lead_score: policy.min_lead_score,min_opportunity_score:policy.min_opportunity_score,min_confidence:policy.min_confidence,autonomous_replies_enabled:policy.autonomous_replies_enabled,meeting_proposals_enabled:policy.meeting_proposals_enabled,provider_selection_json:policy.provider_selection_json||{},approval_thresholds_json:policy.approval_thresholds_json||{},qualification_rules_json:policy.qualification_rules_json||{},negotiation_authority_json:policy.negotiation_authority_json||{},risk_controls_json:policy.risk_controls_json||{},
        allowed_routine_actions: policy.allowed_routine_actions || [], prohibited_actions: policy.prohibited_actions || [],
        style_policy_version: policy.style_policy_version, business_hours_start:policy.business_hours_start, business_hours_end:policy.business_hours_end, fallback_timezone:policy.fallback_timezone||'Europe/Paris', minimum_inbound_reply_delay_minutes:25
      };
      const updated = await svc.entities.CommercialPolicy.update(policy.id, {
        status:'active', approved_by:user.email, approved_at:now, effective_at:now,
        approval_snapshot_json:snapshot
      });
      await svc.entities.OperationalLog.create({ event_type:'commercial_policy_activated', message:`${policy.engine}:${policy.version}`, data_json:{ policy_id:policy.id, approved_by:user.email, snapshot }, actor_email:user.email, created_at:now }).catch((error:any)=>safeBestEffort(error,{operation:'commercialPolicyAdmin',fallback:null,severity:'critical'}));
      return Response.json({ ok:true, policy:updated });
    }

    if (action === 'pause') {
      const updated = await svc.entities.CommercialPolicy.update(policy.id, { status:'paused' });
      await svc.entities.OperationalLog.create({ event_type:'commercial_policy_paused', message:`${policy.engine}:${policy.version}`, data_json:{ policy_id:policy.id }, actor_email:user.email, created_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'commercialPolicyAdmin',fallback:null,severity:'critical'}));
      return Response.json({ ok:true, policy:updated });
    }

    return Response.json({ ok:false, error:'unsupported_action' }, { status:400 });
  } catch (error) {
    console.error('commercialPolicyAdmin failed', error);
    return Response.json({ ok:false, error:'commercial_policy_failed' }, { status:500 });
  }
});
