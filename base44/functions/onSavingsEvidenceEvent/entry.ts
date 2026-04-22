import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Automations may not carry a user; proceed regardless but attempt fetch
    await base44.auth.me().catch(() => null);

    const payload = await req.json();
    const event = payload?.event || {};
    const data = payload?.data || null;
    const type = event?.type; // create | update | delete

    if (!data) return Response.json({ status: 'skipped', reason: 'no data' });

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