import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const ALLOWED_EVENTS = new Set([
  'integration_access_check',
  'connect_attempt',
  'disconnect',
  'failure'
]);
const ALLOWED_CONNECTORS = new Set(['drive', 'sheets', 'gmail', 'slack', 'other']);

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response(null, { status: 405 });

    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const event_type = typeof body?.event_type === 'string' ? body.event_type : '';
    const connector = typeof body?.connector === 'string' ? body.connector : 'other';
    const success = typeof body?.success === 'boolean' ? body.success : false;

    if (!ALLOWED_EVENTS.has(event_type) || !ALLOWED_CONNECTORS.has(connector)) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    await base44.entities.SecurityAudit.create({
      user_email: me.email,
      event_type,
      connector,
      success,
    });

    return Response.json({ ok: true });
  } catch (_err) {
    // Do not leak internals
    return Response.json({ ok: false }, { status: 500 });
  }
});