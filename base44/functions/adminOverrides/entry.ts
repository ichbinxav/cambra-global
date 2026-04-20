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
      case 'void_invoice': {
        const { invoice_id } = payload||{}; assert(invoice_id, 'invoice_id required');
        const [inv] = await base44.asServiceRole.entities.Invoice.filter({ id: invoice_id }); assert(inv, 'Invoice not found');
        await base44.asServiceRole.entities.Invoice.update(invoice_id, { status: 'void' });
        await log(inv.deal_activation_id||'', 'override_applied', 'Invoice voided', { invoice_id });
        result = { invoice_status: 'void' }; activationId = inv.deal_activation_id||null; break;
      }
      case 'verify_report': {
        const { report_id } = payload||{}; assert(report_id, 'report_id required');
        const [rep] = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ id: report_id }); assert(rep, 'Report not found');
        await base44.asServiceRole.entities.MonthlySavingsReport.update(report_id, { measurement_mode: 'fully_verified', status: 'calculated', verified_by: me.email, verified_at: new Date().toISOString() });
        await log(rep.deal_activation_id||'', 'override_applied', 'Report verified', { report_id });
        result = { report_status: 'calculated', measurement_mode: 'fully_verified' }; activationId = rep.deal_activation_id||null; break;
      }
      case 'correct_node_fee': {
        const { report_id, node_fee } = payload||{}; assert(report_id && typeof node_fee==='number', 'report_id and node_fee required');
        const [rep] = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ id: report_id }); assert(rep, 'Report not found');
        const old = rep.node_fee||0;
        await base44.asServiceRole.entities.MonthlySavingsReport.update(report_id, { node_fee });
        await log(rep.deal_activation_id||'', 'override_applied', 'Node fee corrected', { report_id, old, node_fee });
        result = { node_fee }; activationId = rep.deal_activation_id||null; break;
      }
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