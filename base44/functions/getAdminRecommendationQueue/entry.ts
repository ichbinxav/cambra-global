import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error:'Unauthorized' }, { status:401 });
    if (user.role !== 'admin') return Response.json({ error:'Forbidden: Admin only' }, { status:403 });

    const svc = base44.asServiceRole;
    const [recommendations, brands] = await Promise.all([
      svc.entities.Recommendation.list('-generated_at', 200),
      svc.entities.Brand.list('-updated_date', 500),
    ]);
    const brandById = new Map((brands || []).map((brand:any) => [String(brand.id), brand]));
    const items = (recommendations || []).map((recommendation:any) => {
      const brand:any = brandById.get(String(recommendation.brand_id || '')) || null;
      return {
        ...recommendation,
        brand_name:brand?.name || null,
        brand_email:brand?.contact_email || null,
        brand_is_demo:brand?.is_demo === true,
      };
    });
    return Response.json({ ok:true, generated_at:new Date().toISOString(), items });
  } catch (error) {
    return internalErrorResponse(error, 'getAdminRecommendationQueue');
  }
});
