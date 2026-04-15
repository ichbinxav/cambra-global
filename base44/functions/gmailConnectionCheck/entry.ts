import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const connectorId = body?.connectorId;
    if (!connectorId) return Response.json({ error: 'Missing connectorId' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getCurrentAppUserConnection(connectorId);
    return Response.json({ connected: !!accessToken });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});