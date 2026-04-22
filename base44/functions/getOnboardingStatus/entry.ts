import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
    const brand = brands?.[0];
    if (!brand) return Response.json({ error: 'No brand' }, { status: 400 });

    const sr = base44.asServiceRole;
    const [pp] = await sr.entities.PaymentsProfile.filter({ brand_id: brand.id }, '-updated_date', 1);
    const [sp] = await sr.entities.ShippingProfile.filter({ brand_id: brand.id }, '-updated_date', 1);
    const [sa] = await sr.entities.SaaSProfile.filter({ brand_id: brand.id }, '-updated_date', 1);

    // Ensure latest computed
    const res = await sr.functions.invoke('computeVerticalStatus', { brandId: brand.id });

    return Response.json({ brand_id: brand.id, statuses: res?.data?.statuses || {
      payments: { completeness: pp?.completeness_score||0, readiness: pp?.readiness_score||0, missing_fields: pp?.missing_fields||[] },
      shipping: { completeness: sp?.completeness_score||0, readiness: sp?.readiness_score||0, missing_fields: sp?.missing_fields||[] },
      saas: { completeness: sa?.completeness_score||0, readiness: sa?.readiness_score||0, missing_fields: sa?.missing_fields||[] }
    }});
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});