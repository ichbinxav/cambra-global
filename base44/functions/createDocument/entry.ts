import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { MAX_DOCUMENT_BYTES } from '../../shared/documentExtraction.ts';

const CATEGORIES = new Set(['invoices','statements','provider_proposals','contracts','signed_mandates','tax_docs','screenshots','benchmark_evidence','migration_docs','pricing_docs','internal_files']);
const EXTENSIONS = new Set(['pdf','png','jpg','jpeg','webp','gif','csv','json']);
const VISIBILITIES = new Set(['admin_only','brand_and_admin','provider_and_admin','public']);
const TRUSTED_UPLOAD_HOSTS = new Set(['media.base44.com']);
const clean = (value:any, max=500) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const extFromName = (name='') => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };
const baseName = (name='') => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(0, i) : name; };
function trustedUpload(raw:any) { try { const u = new URL(String(raw || '')); return u.protocol === 'https:' && !u.username && !u.password && TRUSTED_UPLOAD_HOSTS.has(u.hostname.toLowerCase()) ? u.toString() : null; } catch { return null; } }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req); const user = await base44.auth.me().catch(() => null); if (!user) return Response.json({ error:'Unauthorized' }, { status:401 });
    const body = await req.json().catch(() => ({})); const fileUrl = trustedUpload(body.file_url); const fileName = clean(body.file_name, 240); const fileSize = Number(body.file_size); const category = clean(body.category, 60); const extension = clean(body.file_ext || extFromName(fileName), 12).toLowerCase();
    if (!fileUrl) return Response.json({ error:'untrusted_file_url' }, { status:400 });
    if (!CATEGORIES.has(category)) return Response.json({ error:'invalid_category' }, { status:400 });
    if (!EXTENSIONS.has(extension)) return Response.json({ error:'unsupported_file_type' }, { status:400 });
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_DOCUMENT_BYTES) return Response.json({ error:'invalid_file_size' }, { status:fileSize > MAX_DOCUMENT_BYTES ? 413 : 400 });
    const isAdmin = user.role === 'admin'; let owner_type = 'brand'; let owner_id:any = null;
    if (isAdmin && ['brand','provider','admin'].includes(String(body.owner_type)) && body.owner_id) { owner_type = body.owner_type; owner_id = clean(body.owner_id, 200); }
    else {
      const brands = await base44.entities.Brand.filter({ created_by:user.email }, '-created_date', 1); if (brands?.[0]) owner_id = brands[0].id;
      else { const providers = await base44.entities.Provider.filter({ contact_email:user.email }).catch(() => []); const managed = await base44.entities.Provider.filter({ account_manager:user.email }).catch(() => []); owner_id = providers?.[0]?.id || managed?.[0]?.id || null; owner_type = 'provider'; }
    }
    if (!owner_id) return Response.json({ error:'document_owner_required' }, { status:409 });
    const requestedVisibility = VISIBILITIES.has(String(body.visibility)) ? String(body.visibility) : 'brand_and_admin';
    const visibility = isAdmin ? requestedVisibility : owner_type === 'provider' ? 'provider_and_admin' : 'brand_and_admin';
    const tags = Array.isArray(body.tags) ? body.tags.slice(0, 20).map((x:any) => clean(x, 80)).filter(Boolean) : [];
    const document = await base44.entities.Document.create({ title:clean(body.title || baseName(fileName) || 'document', 240),file_url:fileUrl,file_name:fileName,file_ext:extension,file_size:fileSize,category,tags,visibility,owner_type,owner_id,uploaded_by:user.email,uploaded_at:new Date().toISOString(),review_status:'pending',version:1,notes:clean(body.notes, 2000) });
    if (isAdmin) for (const link of Array.isArray(body.links) ? body.links.slice(0, 50) : []) if (link?.target_type && link?.target_id) await base44.entities.DocumentLink.create({ document_id:document.id,target_type:clean(link.target_type, 80),target_id:clean(link.target_id, 200),is_primary:link.is_primary === true });
    return Response.json({ document });
  } catch (error) { console.error(error); return Response.json({ error:'create_document_failed' }, { status:500 }); }
});
