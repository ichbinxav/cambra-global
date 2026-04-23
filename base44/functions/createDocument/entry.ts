import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function extFromName(name='') { const i = name.lastIndexOf('.'); return i>0 ? name.slice(i+1).toLowerCase() : ''; }
function baseName(name='') { const i = name.lastIndexOf('.'); return i>0 ? name.slice(0, i) : name; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      file_url,
      file_name,
      file_size,
      category,
      tags = [],
      visibility = 'brand_and_admin',
      owner_type: ownerTypeInput,
      owner_id: ownerIdInput,
      links = [],
      notes,
      title
    } = body || {};

    if (!file_url || !category) return Response.json({ error: 'file_url and category are required' }, { status: 400 });

    const isAdmin = user?.role === 'admin';

    // Resolve owner (brand preferred; fallback to provider; else admin)
    let owner_type = 'brand';
    let owner_id = null;
    if (isAdmin && ownerTypeInput && ownerIdInput) {
      owner_type = ownerTypeInput;
      owner_id = ownerIdInput;
    } else {
      const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
      if (brands && brands[0]) { owner_id = brands[0].id; owner_type = 'brand'; }
      else {
        // try provider scope
        try {
          const providers = await base44.entities.Provider.filter({ contact_email: user.email });
          const managed = await base44.entities.Provider.filter({ account_manager: user.email });
          const pid = (providers?.[0]?.id) || (managed?.[0]?.id) || null;
          if (pid) { owner_type = 'provider'; owner_id = pid; }
          else { owner_type = 'admin'; owner_id = user.id || user.email; }
        } catch {
          owner_type = 'admin'; owner_id = user.id || user.email;
        }
      }
    }

    // Non-admins cannot set admin_only/provider_and_admin visibility
    const finalVisibility = (!isAdmin && (visibility === 'admin_only' || visibility === 'provider_and_admin')) ? 'brand_and_admin' : (visibility || 'brand_and_admin');

    const now = new Date().toISOString();
    const ext = (body.file_ext) || extFromName(file_name || '');
    const doc = await base44.entities.Document.create({
      title: title || baseName(file_name || 'document'),
      file_url,
      file_name,
      file_ext: ext,
      file_size: typeof file_size === 'number' ? file_size : undefined,
      category,
      tags,
      visibility: finalVisibility,
      owner_type,
      owner_id,
      uploaded_by: user.email,
      uploaded_at: now,
      review_status: 'pending',
      version: 1,
      notes: notes || ''
    });

    // Create links if provided
    for (const l of (links || [])) {
      if (!l?.target_type || !l?.target_id) continue;
      await base44.entities.DocumentLink.create({ document_id: doc.id, target_type: l.target_type, target_id: l.target_id, is_primary: !!l.is_primary });
    }

    return Response.json({ document: doc });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});