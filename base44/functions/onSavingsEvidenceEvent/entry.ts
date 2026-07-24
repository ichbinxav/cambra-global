import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // SECURITY-1 (2026-07-24) — automations may not carry a user (allowed);
    // any AUTHENTICATED caller must be admin.
    const caller = await base44.auth.me().catch(() => null);
    if (caller && caller.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await req.json();
    const event = payload?.event || {};
    const data = payload?.data || null;
    const type = event?.type; // create | update | delete

    if (!data) return Response.json({ status: 'skipped', reason: 'no data' });

    // SECURITY-1 — anti-forgery: only log audit rows for evidence records that
    // actually exist server-side (forged payloads = fake audit trail noise).
    const evidence = data.id
      ? await base44.asServiceRole.entities.SavingsEvidence.get(data.id).catch(() => null)
      : null;
    if (!evidence) return Response.json({ status: 'skipped', reason: 'unverified_payload' });

    // On create: log 'submitted'
    if (type === 'create') {
      await base44.asServiceRole.entities.VerificationEvent.create({
        entity_type: 'evidence',
        entity_id: data.id,
        action: 'submitted',
        actor_email: data.created_by || 'system',
        occurred_at: new Date().toISOString(),
        metadata_json: { source: 'automation' }
      });
    }

    // On update: if verification_status changed, record transition
    if (type === 'update' && Array.isArray(payload.changed_fields) && payload.changed_fields.includes('verification_status')) {
      const actionMap = {
        submitted: 'submitted',
        under_review: 'moved_to_under_review',
        accepted: 'accepted',
        rejected: 'rejected',
        verified: 'accepted',
        realized: 'snapshot_generated'
      };
      const act = actionMap[data.verification_status] || 'submitted';
      await base44.asServiceRole.entities.VerificationEvent.create({
        entity_type: 'evidence',
        entity_id: data.id,
        action: act,
        actor_email: data.updated_by || 'system',
        occurred_at: new Date().toISOString(),
        metadata_json: { source: 'automation' }
      });
    }

    return Response.json({ status: 'ok' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});