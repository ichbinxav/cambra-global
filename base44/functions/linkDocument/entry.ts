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
    const { document_id, target_type, target_id, is_primary = false } = body || {};
    if (!document_id || !target_type || !target_id) return Response.json({ error: 'Missing fields' }, { status: 400 });

    const docs = await base44.entities.Document.filter({ id: document_id }, '-created_date', 1);
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
      } catch(error){safeBestEffort(error,{operation:'linkDocument',fallback:null,severity:'secondary'})}
      const allowed = (doc.owner_type === 'brand' && doc.owner_id === brandId) || (doc.owner_type === 'provider' && providerIds.includes(doc.owner_id));
      if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });
      let targetAllowed = target_type === 'brand' ? target_id === brandId : target_type === 'provider' ? providerIds.includes(target_id) : false;
      if (target_type === 'statement_import') {
        const rows = await base44.entities.StatementImport.filter({ id: target_id }, '-created_date', 1);
        targetAllowed = Boolean(rows?.[0] && rows[0].brand_id === brandId);
      } else if (target_type === 'deal_activation') {
        const rows = await base44.entities.DealActivation.filter({ id: target_id, brand_id: brandId }, '-created_date', 1);
        targetAllowed = Boolean(rows?.[0]);
      } else if (target_type === 'monthly_savings_report') {
        const rows = await base44.entities.MonthlySavingsReport.filter({ id: target_id, brand_id: brandId }, '-created_date', 1);
        targetAllowed = Boolean(rows?.[0]);
      } else if (target_type === 'invoice') {
        const rows = await base44.entities.Invoice.filter({ id: target_id, brand_id: brandId }, '-created_date', 1);
        targetAllowed = Boolean(rows?.[0]);
      }
      if (!targetAllowed) return Response.json({ error: 'Target not found or access denied' }, { status: 403 });
    }

    const link = await base44.entities.DocumentLink.create({ document_id, target_type, target_id, is_primary });
    return Response.json({ link });
  } catch (error) {
    return internalErrorResponse(error, 'linkDocument');
  }
});
