import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(c,m){ if(!c) throw new Error(m); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');
    assert(me.role==='admin', 'Forbidden');

    const { action, reason, payload } = await req.json().catch(()=>({}));
    assert(action && reason, 'action and reason required');

    const log = async (activation_id, event_type, message, data={}) => {
      return base44.asServiceRole.entities.OperationalLog.create({
        deal_activation_id: activation_id || '',
        event_type, message,
        data_json: { reason, ...data },
        actor_email: me.email,
        created_at: new Date().toISOString()
      });
    };

    let result = null; let activationId = null;

    switch(action){
      case 'pause_activation': {
        const { activation_id } = payload||{}; assert(activation_id, 'activation_id required');
        const [act] = await base44.asServiceRole.entities.DealActivation.filter({ id: activation_id }); assert(act, 'Activation not found');
        await base44.asServiceRole.entities.DealActivation.update(activation_id, { status: 'paused', last_updated: new Date().toISOString() });
        await log(activation_id, 'status_changed', 'Activation paused');
        result = { status: 'paused' }; activationId = activation_id; break;
      }
      case 'resume_activation': {
        const { activation_id } = payload||{}; assert(activation_id, 'activation_id required');
        const [act] = await base44.asServiceRole.entities.DealActivation.filter({ id: activation_id }); assert(act, 'Activation not found');
        const next = act.status==='paused' ? 'migrating' : act.status;
        await base44.asServiceRole.entities.DealActivation.update(activation_id, { status: next, last_updated: new Date().toISOString() });
        await log(activation_id, 'status_changed', 'Activation resumed', { to: next });
        result = { status: next }; activationId = activation_id; break;
      }
      case 'void_invoice': throw new Error('economic_override_retired_use_canonical_recover_flow');
      case 'verify_report': throw new Error('economic_override_retired_use_canonical_recover_flow');
      case 'correct_node_fee': throw new Error('economic_override_retired_use_canonical_recover_flow');
      case 'revoke_mandate': {
        const { activation_id, reason_text } = payload||{}; assert(activation_id, 'activation_id required');
        const res = await base44.asServiceRole.functions.invoke('revokeMandate', { mandateId: null, dealActivationId: activation_id, reason: reason_text || reason });
        await log(activation_id, 'mandate_revoked', 'Mandate revoked', { response: res.data });
        result = res.data; activationId = activation_id; break;
      }
      case 'regenerate_tasks': {
        const { activation_id } = payload||{}; assert(activation_id, 'activation_id required');
        const res = await base44.asServiceRole.functions.invoke('regenerateMigrationTasks', { activation_id });
        await log(activation_id, 'override_applied', 'Tasks regenerated', { response: res.data });
        result = res.data; activationId = activation_id; break;
      }
      default: throw new Error('Unsupported action');
    }

    return Response.json({ ok:true, result, activation_id: activationId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});