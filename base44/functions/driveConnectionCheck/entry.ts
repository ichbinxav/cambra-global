import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
      return Response.json({ error: 'Invalid connectorId' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId);
    return Response.json({ connected: !!accessToken });
  } catch (_err) {
    console.warn('driveConnectionCheck error');
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
});