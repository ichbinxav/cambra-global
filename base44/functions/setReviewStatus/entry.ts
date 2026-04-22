import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });

    const body = await req.json();
    const { document_id, review_status } = body || {};
    if (!document_id || !review_status) return Response.json({ error: 'document_id and review_status required' }, { status: 400 });
    if (!['pending','approved','rejected','superseded'].includes(review_status)) return Response.json({ error: 'Invalid status' }, { status: 400 });

    const docs = await base44.entities.Document.filter({ id: document_id }, '-created_date', 1);
    const doc = docs?.[0];
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });

    const updated = await base44.entities.Document.update(doc.id, { review_status });
    return Response.json({ document: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});