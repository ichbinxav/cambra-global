import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { COMMUNICATION_STYLE_POLICY_VERSION } from '../../shared/commercialAutonomy.ts';

const DEFAULT_PROHIBITED = [
  'accept_final_offer','sign_contract','accept_lock_in','accept_minimum_commitment','accept_termination_fee',
  'migration_go_live','financial_override','change_recover_economics','send_sensitive_document'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ ok:false, error:'forbidden' }, { status:403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'list');
    const svc = base44.asServiceRole;

    if (action === 'list') {
      const rows = await svc.entities.CommercialPolicy.list('-created_date', 100).catch(() => []);
      return Response.json({ ok:true, policies: rows });
    }

    if (action === 'create_draft') {
      const engine = body?.engine === 'provider_negotiation' ? 'provider_negotiation' : 'merchant_acquisition';
      const version = String(body?.version || `2026.08.09-${engine}-v1`);
      const allowedDefault = engine === 'merchant_acquisition'
        ? ['initial_outreach','routine_reply','follow_up','meeting_offer']
        : ['provider_contact','routine_reply','pricing_request','clarification','counterproposal','technical_question','implementation_question','contract_request'];
      const row = await svc.entities.CommercialPolicy.create({
        policy_key: `${engine}:${version}`,
        version,
        engine,
        status: 'draft',
        countries: Array.isArray(body?.countries) ? body.countries.slice(0, 20) : ['FR','ES'],
        languages: Array.isArray(body?.languages) ? body.languages.filter((x:any)=>['en','fr','es'].includes(x)) : ['en','fr','es'],
        daily_send_limit: Math.max(1, Math.min(Number(body?.daily_send_limit) || 30, 200)),
        min_lead_score: Math.max(0, Math.min(Number(body?.min_lead_score) || 70, 100)),
        business_hours_start: Math.max(0, Math.min(Number(body?.business_hours_start) || 8, 23)),
        business_hours_end: Math.max(1, Math.min(Number(body?.business_hours_end) || 18, 24)),
        max_followups: Math.max(0, Math.min(Number(body?.max_followups) || 3, 5)),
        followup_intervals_hours: Array.isArray(body?.followup_intervals_hours) ? body.followup_intervals_hours.slice(0,5) : [72,120,168],
        allowed_routine_actions: Array.isArray(body?.allowed_routine_actions) ? body.allowed_routine_actions : allowedDefault,
        prohibited_actions: Array.from(new Set([...(Array.isArray(body?.prohibited_actions) ? body.prohibited_actions : []), ...DEFAULT_PROHIBITED])),
        identity_label: String(body?.identity_label || (engine === 'provider_negotiation' ? 'CAMBRA Payments' : 'CAMBRA')),
        style_policy_version: COMMUNICATION_STYLE_POLICY_VERSION,
        claims_policy_json: body?.claims_policy_json || { financial_claims: 'evidence_required', identity: 'no_invented_staff', thread_language: 'preserve' }
      });
      return Response.json({ ok:true, policy: row });
    }

    const policyId = String(body?.policy_id || '');
    if (!policyId) return Response.json({ ok:false, error:'policy_id_required' }, { status:400 });
    const policy = await svc.entities.CommercialPolicy.get(policyId).catch(() => null);
    if (!policy) return Response.json({ ok:false, error:'not_found' }, { status:404 });

    if (action === 'activate') {
      if (body?.confirmation !== 'APPROVE_AUTONOMY_POLICY') return Response.json({ ok:false, error:'confirmation_required' }, { status:409 });
      const peers = await svc.entities.CommercialPolicy.filter({ engine: policy.engine, status:'active' }, '-created_date', 100).catch(() => []);
      for (const peer of peers) if (peer.id !== policy.id) await svc.entities.CommercialPolicy.update(peer.id, { status:'superseded' });
      const now = new Date().toISOString();
      const snapshot = {
        engine: policy.engine, version: policy.version, countries: policy.countries || [], languages: policy.languages || [],
        daily_send_limit: policy.daily_send_limit, min_lead_score: policy.min_lead_score,
        allowed_routine_actions: policy.allowed_routine_actions || [], prohibited_actions: policy.prohibited_actions || [],
        style_policy_version: policy.style_policy_version
      };
      const updated = await svc.entities.CommercialPolicy.update(policy.id, {
        status:'active', approved_by:user.email, approved_at:now, effective_at:now,
        approval_snapshot_json:snapshot
      });
      await svc.entities.OperationalLog.create({ event_type:'commercial_policy_activated', message:`${policy.engine}:${policy.version}`, data_json:{ policy_id:policy.id, approved_by:user.email, snapshot }, actor_email:user.email, created_at:now }).catch(()=>null);
      return Response.json({ ok:true, policy:updated });
    }

    if (action === 'pause') {
      const updated = await svc.entities.CommercialPolicy.update(policy.id, { status:'paused' });
      await svc.entities.OperationalLog.create({ event_type:'commercial_policy_paused', message:`${policy.engine}:${policy.version}`, data_json:{ policy_id:policy.id }, actor_email:user.email, created_at:new Date().toISOString() }).catch(()=>null);
      return Response.json({ ok:true, policy:updated });
    }

    return Response.json({ ok:false, error:'unsupported_action' }, { status:400 });
  } catch (error) {
    console.error('commercialPolicyAdmin failed', error);
    return Response.json({ ok:false, error:'commercial_policy_failed' }, { status:500 });
  }
});
