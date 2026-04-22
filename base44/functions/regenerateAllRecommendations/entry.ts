import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });

    const brands = await base44.asServiceRole.entities.Brand.list();
    const results = [];

    for (const b of brands) {
      try {
        const res = await base44.functions.invoke('regenerateRecommendationsForBrand', { brandId: b.id });
        results.push({ brand_id: b.id, ok: true, count: (res?.data?.items || []).length });
      } catch (e) {
        results.push({ brand_id: b.id, ok: false, error: e?.message || 'error' });
      }
    }

    return Response.json({ ok: true, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});