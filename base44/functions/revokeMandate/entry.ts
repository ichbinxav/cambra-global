// revokeMandate — legacy (pre-RECOVER), corrected in the RECOVER-4 audit (2026-08-04).
//
// THREE REAL DEFECTS FIXED, all of them invisible until Recover Margin shipped:
//
//  1. WRITES WENT THROUGH THE USER'S OWN RLS (`base44.entities`). Mandate rows are
//     created by the service role, so `created_by` is never the merchant — the
//     write rule (admin OR created_by) therefore REFUSED every merchant
//     self-revocation, and the admin-only OperationalLog write refused too. The
//     endpoint effectively worked for admins only, silently. Ownership is now
//     proven explicitly and the writes use the service role.
//  2. OWNERSHIP WAS `activation.user_email` ONLY. Mandate.owner_email (the field
//     RECOVER-1 introduced precisely to identify the accepting merchant) was
//     ignored, so a legitimate signer whose activation carries no user_email was
//     locked out of revoking their own authorization.
//  3. IT COULD REWIND A BILLING ACTIVATION. Any status other than
//     migrating/live became 'awaiting_authorization' — including 'monetizing',
//     i.e. a merchant already being invoiced. Revocation stops FUTURE action; it
//     does not un-authorize a past authorization and must never rewind the
//     billing state machine (fees already earned on savings already verified
//     remain due). monetizing/live/migrating now map to 'paused'.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mandateId, dealActivationId, reason } = await req.json().catch(() => ({}));
    if (!mandateId && !dealActivationId) {
      return Response.json({ error: 'mandateId or dealActivationId required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const email = String(me.email || '').toLowerCase();

    let mandate: any = null;
    if (mandateId) {
      const rows = await svc.entities.Mandate.filter({ id: mandateId }, '-created_date', 1).catch(() => []);
      mandate = rows?.[0] || null;
    } else {
      const rows = await svc.entities.Mandate
        .filter({ deal_activation_id: dealActivationId, status: 'active' }, '-created_date', 1).catch(() => []);
      mandate = rows?.[0] || null;
    }
    if (!mandate) return Response.json({ error: 'Mandate not found' }, { status: 404 });
    if (mandate.status === 'revoked') {
      return Response.json({ ok: true, already_revoked: true, mandate_id: mandate.id });
    }

    const acts = await svc.entities.DealActivation
      .filter({ id: mandate.deal_activation_id }, '-created_date', 1).catch(() => []);
    const activation = acts?.[0];
    if (!activation) return Response.json({ error: 'Activation not found' }, { status: 404 });

    const brands = activation.brand_id
      ? await svc.entities.Brand.filter({ id: activation.brand_id }, '-created_date', 1).catch(() => [])
      : [];
    const brand = brands?.[0] || null;

    const allowed =
      me.role === 'admin' ||
      String(mandate.owner_email || '').toLowerCase() === email ||
      String(mandate.signed_by_email || '').toLowerCase() === email ||
      String(activation.user_email || '').toLowerCase() === email ||
      String(brand?.contact_email || '').toLowerCase() === email;
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date().toISOString();
    await svc.entities.Mandate.update(mandate.id, {
      status: 'revoked',
      revoked_at: now,
      revoked_by: email,
      revocation_reason: reason || 'revoked',
    });

    // Revocation stops future action; it never rewinds an activation that is
    // already operating or being billed.
    const next = ['migrating', 'live', 'monetizing'].includes(activation.status)
      ? 'paused'
      : 'awaiting_authorization';
    await svc.entities.DealActivation.update(activation.id, { status: next, last_updated: now });

    await svc.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: activation.brand_id || '',
      provider_id: activation.provider_id || '',
      event_type: 'mandate_revoked',
      message: 'Mandate revoked',
      data_json: {
        reason: reason || 'revoked',
        mandate_id: mandate.id,
        previous_activation_status: activation.status,
        new_activation_status: next,
      },
      actor_email: email,
      created_at: now,
    }).catch(() => null);

    return Response.json({ ok: true, mandate_id: mandate.id, activation_status: next });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}