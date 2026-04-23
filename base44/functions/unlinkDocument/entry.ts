import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const isAdmin = user?.role === 'admin';

    const body = await req.json();
    const { link_id } = body || {};
    if (!link_id) return Response.json({ error: 'link_id required' }, { status: 400 });

    const links = await base44.entities.DocumentLink.filter({ id: link_id }, '-created_date', 1);
    const link = links?.[0];
    if (!link) return Response.json({ error: 'Link not found' }, { status: 404 });

    // Check ownership via document
    const docs = await base44.entities.Document.filter({ id: link.document_id }, '-created_date', 1);
    const doc = docs?.[0];
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });

    if (!isAdmin) {
      const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
      const brandId = brands?.[0]?.id || null;
      let providerIds = [];
      try {
        const providers = await base44.entities.Provider.filter({ contact_email: user.email });
        const managed = await base44.entities.Provider.filter({ account_manager: user.email });
        const set = new Set([...(providers||[]).map(p=>p.id), ...(managed||[]).map(p=>p.id)]);
        providerIds = Array.from(set);
      } catch {}
      const allowed = (doc.owner_type === 'brand' && doc.owner_id === brandId) || (doc.owner_type === 'provider' && providerIds.includes(doc.owner_id));
      if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await base44.entities.DocumentLink.delete(link.id);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});