import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';
import { quarantineProbe } from '../../shared/internalGate.ts';

function assert(v,m){ if(!v) throw new Error(m); }
const ALLOWED = {
  detected: ['proposed'],
  proposed: ['activated'],
  activated: ['awaiting_authorization','paused','revoked'],
  awaiting_authorization: ['authorized','revoked'],
  authorized: ['migrating','revoked','paused'],
  migrating: ['live','revoked','paused'],
  live: ['monetizing','paused','revoked'],
  monetizing: ['closed','paused','revoked'],
  paused: ['live','revoked','closed'],
  revoked: [],
  closed: []
};

// [QUARANTINE 2026-08-15] PURGE-2 (2026-07-24): activation-admin family (surface live, no src caller) — kept with probe.
Deno.serve(async (req) => {
  await quarantineProbe(createClientFromRequest(req), "updateDealActivationStatus");
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');

    const { activationId, nextStatus, reason } = await req.json().catch(()=>({}));
    assert(activationId && nextStatus, 'activationId and nextStatus required');

    const acts = await base44.entities.DealActivation.filter({ id: activationId });
    const a = acts?.[0];
    assert(a, 'Activation not found');

    const isOwner = a.user_email === me.email; const amAdmin = me.role === 'admin';
    assert(isOwner || amAdmin, 'Forbidden');

    const allowedNext = ALLOWED[a.status] || [];
    assert(allowedNext.includes(nextStatus), `Invalid transition: ${a.status} -> ${nextStatus}`);

    if (nextStatus === 'authorized') {
      const m = await base44.entities.Mandate.filter({ deal_activation_id: activationId, status: 'active' }, '-created_date', 1);
      assert(m.length > 0, 'Mandate required before authorization');
    }

    await base44.entities.DealActivation.update(activationId, { status: nextStatus, last_updated: new Date().toISOString() });
    await base44.entities.AuthorizationLog.create({
      deal_activation_id: activationId,
      brand_id: a.brand_id || '',
      provider_id: a.provider_id || '',
      action_type: 'status_change',
      description: `Transition ${a.status} -> ${nextStatus}${reason?(' · '+reason):''}`,
      approved_by: me.email,
      approved_at: new Date().toISOString(),
      source: 'function',
      document_version: 'v1'
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});