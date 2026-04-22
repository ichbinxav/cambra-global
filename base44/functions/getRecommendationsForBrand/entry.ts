import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
    const brand = brands?.[0];
    if (!brand) return Response.json({ items: [] });

    const recs = await base44.entities.Recommendation.filter({ brand_id: brand.id }, '-generated_at', 20);
    return Response.json({ items: recs||[] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});