import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const isAdmin = user?.role === 'admin';

    const body = await req.json();
    const { document_id, title, category, tags, notes, visibility } = body || {};
    if (!document_id) return Response.json({ error: 'document_id required' }, { status: 400 });

    const docs = await base44.entities.Document.filter({ id: document_id }, '-created_date', 1);
    const doc = docs?.[0];
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });

    // Ownership check (brand or provider owner)
    if (!isAdmin) {
      const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
      const brandId = brands?.[0]?.id || null;
      let providerIds = [];
      try {
        const providers = await base44.entities.Provider.filter({ contact_email: user.email });
        const managed = await base44.entities.Provider.filter({ account_manager: user.email });
        const set = new Set([...(providers||[]).map(p=>p.id), ...(managed||[]).map(p=>p.id)]);
        providerIds = Array.from(set);
      } catch(error){safeBestEffort(error,{operation:'updateDocumentMeta',fallback:null,severity:'secondary'})}
      const allowed = (doc.owner_type === 'brand' && doc.owner_id === brandId) || (doc.owner_type === 'provider' && providerIds.includes(doc.owner_id));
      if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const patch = {};
    if (typeof title === 'string') patch.title = title;
    if (typeof notes === 'string') patch.notes = notes;
    if (typeof category === 'string') patch.category = category;
    if (Array.isArray(tags)) patch.tags = tags;
    if (visibility) {
      if (!isAdmin && (visibility === 'admin_only' || visibility === 'provider_and_admin')) {
        // ignore
      } else {
        patch.visibility = visibility;
      }
    }

    const updated = await base44.entities.Document.update(doc.id, patch);
    return Response.json({ document: updated });
  } catch (error) {
    return internalErrorResponse(error, 'updateDocumentMeta');
  }
});