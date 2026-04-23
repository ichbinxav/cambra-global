import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function extFromName(name='') { const i = name.lastIndexOf('.'); return i>0 ? name.slice(i+1).toLowerCase() : ''; }
function baseName(name='') { const i = name.lastIndexOf('.'); return i>0 ? name.slice(0, i) : name; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const isAdmin = user?.role === 'admin';

    const body = await req.json();
    const { document_id, file_url, file_name, file_size, inherit_links = true } = body || {};
    if (!document_id || !file_url) return Response.json({ error: 'document_id and file_url required' }, { status: 400 });

    const docs = await base44.entities.Document.filter({ id: document_id }, '-created_date', 1);
    const orig = docs?.[0];
    if (!orig) return Response.json({ error: 'Document not found' }, { status: 404 });

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
      const allowed = (orig.owner_type === 'brand' && orig.owner_id === brandId) || (orig.owner_type === 'provider' && providerIds.includes(orig.owner_id));
      if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const nextVersion = (Number(orig.version) || 1) + 1;
    const rootId = orig.version_of_id || orig.id;
    const now = new Date().toISOString();
    const newDoc = await base44.entities.Document.create({
      title: baseName(file_name || orig.file_name || 'document'),
      file_url,
      file_name,
      file_ext: extFromName(file_name || orig.file_name || ''),
      file_size: typeof file_size === 'number' ? file_size : undefined,
      category: orig.category,
      tags: orig.tags || [],
      visibility: orig.visibility,
      owner_type: orig.owner_type,
      owner_id: orig.owner_id,
      uploaded_by: user.email,
      uploaded_at: now,
      review_status: 'pending',
      version: nextVersion,
      version_of_id: rootId,
      notes: orig.notes || ''
    });

    if (inherit_links) {
      const links = await base44.entities.DocumentLink.filter({ document_id: orig.id }, '-created_date', 500);
      for (const l of (links || [])) {
        await base44.entities.DocumentLink.create({ document_id: newDoc.id, target_type: l.target_type, target_id: l.target_id, is_primary: l.is_primary });
      }
    }

    // Mark previous as superseded
    await base44.entities.Document.update(orig.id, { review_status: 'superseded' });

    return Response.json({ document: newDoc });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});