import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M4 — getCompanyMemory
 *
 * Returns the current CompanyMemory and latest DiscoveryFindings (status
 * detected or confirmed) for a brand, grouped by category.
 *
 * Payload: { brand_id?: string } — falls back to authenticated user's latest brand.
 * Returns: { ok, memory, findings_by_category }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let { brand_id } = body;

    if (!brand_id) {
      const brands = await base44.entities.Brand.list('-created_date', 1).catch(() => []);
      if (!brands.length) {
        return Response.json({ ok: true, memory: null, findings_by_category: {} });
      }
      brand_id = brands[0].id;
    }

    // Verify ownership (admins bypass)
    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const owned = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
      if (!owned.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const memories = await base44.asServiceRole.entities.CompanyMemory
      .filter({ brand_id }, '-last_seen_at', 1)
      .catch(() => []);
    const memory = memories[0] || null;

    // Latest 200 active findings for this brand
    const allFindings = await base44.asServiceRole.entities.DiscoveryFinding
      .filter({ brand_id }, '-created_at', 200)
      .catch(() => []);
    const findings = allFindings.filter(f => f.status === 'detected' || f.status === 'confirmed');

    const findings_by_category = {};
    for (const f of findings) {
      const cat = f.category || 'other';
      if (!findings_by_category[cat]) findings_by_category[cat] = [];
      findings_by_category[cat].push({
        id: f.id,
        provider_or_tool: f.provider_or_tool,
        confidence_score: f.confidence_score,
        evidence_type: f.evidence_type,
        status: f.status,
        created_at: f.created_at,
      });
    }

    return Response.json({ ok: true, memory, findings_by_category });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});