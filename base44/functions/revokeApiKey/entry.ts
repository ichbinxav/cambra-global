import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const { key_id } = await req.json();
    if (!key_id) return Response.json({ error: "key_id required" }, { status: 400 });

    await base44.asServiceRole.entities.ApiKey.update(key_id, {
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: user.email,
    });
    return Response.json({ success: true });
  } catch (error) {
    return internalErrorResponse(error, 'revokeApiKey');
  }
});