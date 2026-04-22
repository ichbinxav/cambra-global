import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });

    const recs = await base44.entities.Recommendation.list('-generated_at', 200);
    return Response.json({ items: recs||[] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});