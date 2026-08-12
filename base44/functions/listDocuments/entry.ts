import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

function includesText(s, q) { return (s || '').toLowerCase().includes((q || '').toLowerCase()); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const isAdmin = user?.role === 'admin';

    const body = await req.json();
    const { q, category, review_status, visibility, target_type, target_id, limit = 200, include_links = true } = body || {};

    // Resolve brand/provider scope for non-admins
    let brandId = null;
    let providerIds = [];
    if (!isAdmin) {
      const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
      brandId = brands?.[0]?.id || null;
      try {
        const providers = await base44.entities.Provider.filter({ contact_email: user.email });
        const managed = await base44.entities.Provider.filter({ account_manager: user.email });
        const set = new Set([...(providers||[]).map(p=>p.id), ...(managed||[]).map(p=>p.id)]);
        providerIds = Array.from(set);
      } catch(error){safeBestEffort(error,{operation:'listDocuments',fallback:null,severity:'secondary'})}
    }

    // Pre-filter by ownership for non-admins
    let docs = [];
    if (isAdmin) {
      docs = await base44.entities.Document.list('-created_date', limit);
    } else {
      const arr = [];
      if (brandId) {
        const brandDocs = await base44.entities.Document.filter({ owner_id: brandId, owner_type: 'brand' }, '-created_date', limit);
        arr.push(...(brandDocs||[]).filter(d => ['brand_and_admin','public'].includes(d.visibility)));
      }
      if (providerIds.length) {
        for (const pid of providerIds) {
          const provDocs = await base44.entities.Document.filter({ owner_id: pid, owner_type: 'provider' }, '-created_date', limit);
          arr.push(...(provDocs||[]).filter(d => ['provider_and_admin','public'].includes(d.visibility)));
        }
      }
      // De-dup and cap limit
      const seen = new Set();
      docs = arr.filter(d => { if (seen.has(d.id)) return false; seen.add(d.id); return true; }).slice(0, limit);
    }

    // Optional link-based filter
    if (target_type && target_id) {
      const links = await base44.entities.DocumentLink.filter({ target_type, target_id }, '-created_date', 1000);
      const allowed = new Set((links || []).map(l => l.document_id));
      docs = (docs || []).filter(d => allowed.has(d.id));
    }

    // Field filters
    if (category) docs = docs.filter(d => d.category === category);
    if (review_status) docs = docs.filter(d => d.review_status === review_status);
    if (visibility) docs = docs.filter(d => d.visibility === visibility);
    if (!isAdmin) {
      // Prevent non-admin users from seeing admin_only regardless of filters
      docs = docs.filter(d => d.visibility !== 'admin_only');
    }
    if (q) docs = docs.filter(d => includesText(d.title, q) || includesText(d.file_name, q) || (d.tags || []).some(t => includesText(t, q)));

    // Attach links if requested (only for returned docs)
    if (include_links && docs.length > 0) {
      const byId = new Map();
      docs.forEach(d => byId.set(d.id, d));
      const allLinks = await base44.entities.DocumentLink.list('-created_date', 2000);
      (allLinks || []).forEach(l => {
        const d = byId.get(l.document_id);
        if (d) {
          d.links = d.links || [];
          d.links.push(l);
        }
      });
    }

    return Response.json({ items: docs });
  } catch (error) {
    return internalErrorResponse(error, 'listDocuments');
  }
});