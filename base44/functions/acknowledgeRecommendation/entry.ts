import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const id = body?.id;
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    const rec = await base44.entities.Recommendation.get(id);
    // Validar que la recomendación pertenece a su brand
    const myBrands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 10);
    const ok = !!myBrands.find(b => b.id === rec.brand_id);
    if (!ok && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await base44.entities.Recommendation.update(id, { seen_by_user_at: new Date().toISOString() });
    return Response.json({ ok: true, item: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});