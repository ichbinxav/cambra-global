import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(null, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const connectorId = typeof body?.connectorId === 'string' ? body.connectorId : '';
    if (!connectorId || !/^cntr_[a-zA-Z0-9]+$/.test(connectorId)) {
      await base44.entities.SecurityAudit.create({ user_email: user.email, event_type: 'integration_access_check', connector: 'slack', success: false });
      return Response.json({ error: 'Invalid connectorId' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId);
    await base44.entities.SecurityAudit.create({ user_email: user.email, event_type: 'integration_access_check', connector: 'slack', success: !!accessToken });
    return Response.json({ connected: !!accessToken });
  } catch (_err) {
    try {
      const base44c = createClientFromRequest(req);
      const me = await base44c.auth.me();
      if (me) await base44c.entities.SecurityAudit.create({ user_email: me.email, event_type: 'integration_access_check', connector: 'slack', success: false });
    } catch {}
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
});