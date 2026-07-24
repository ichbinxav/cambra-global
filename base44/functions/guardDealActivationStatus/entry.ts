import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

// Endpoint classification: INTERNAL_ONLY (invoked by the DealActivation update
// automation). The check here is idempotent — if the mandate is present, do
// nothing; if it's missing, revert `status` back to what it was.
// asServiceRole justification: needs to overwrite a status change made by any
// user, and to write an AuthorizationLog row that is admin-write RLS.

// [QUARANTINE 2026-08-15] PURGE-2 (2026-07-24): activation-admin family (surface live, no src caller) — kept with probe.
Deno.serve(async (req) => {
  try { await createClientFromRequest(req).asServiceRole.entities.OperationalLog.create({ event_type: "quarantine_probe", message: "quarantined function 'guardDealActivationStatus' was invoked", created_at: new Date().toISOString() }); } catch (_probeErr) { /* probe must never break the function */ }
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data, old_data } = body || {};

    if (!event || event.entity_name !== 'DealActivation' || event.type !== 'update') {
      return Response.json({ ok: true, skipped: 'not DealActivation update' });
    }

    if (data?.status === 'authorized') {
      const mandates = await base44.asServiceRole.entities.Mandate.filter({ deal_activation_id: data.id, status: 'active' }, '-created_date', 1)
        .then(ms => ms.length ? ms : base44.asServiceRole.entities.Mandate.filter({ deal_id: data.id, status: 'active' }, '-created_date', 1));
      const hasMandate = mandates.length > 0;
      if (!hasMandate) {
        const prev = old_data?.status || 'activated';
        await base44.asServiceRole.entities.DealActivation.update(data.id, { status: prev, last_updated: new Date().toISOString() });
        await base44.asServiceRole.entities.AuthorizationLog.create({
          deal_activation_id: data.id,
          brand_id: data.brand_id || '',
          provider_id: data.provider_id || '',
          action_type: 'status_reverted',
          description: 'Attempted authorization without mandate — reverted',
          approved_by: data.user_email || '',
          approved_at: new Date().toISOString(),
          source: 'automation',
          document_version: 'v1'
        });
        return Response.json({ ok: true, reverted: true });
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});