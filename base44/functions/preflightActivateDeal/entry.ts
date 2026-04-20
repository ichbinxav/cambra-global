import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function ok(cond) { return !!cond; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { vertical, resultId } = await req.json().catch(() => ({}));
    const checklist = [];

    // User present
    checklist.push({ key: 'auth', label: 'Usuario autenticado', ok: true });

    // Brand & ownership
    const brands = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
    const brand = brands?.[0] || null;
    checklist.push({ key: 'brand_exists', label: 'Marca registrada', ok: ok(brand), details: brand ? brand.name : 'Cree una marca en Onboarding' });
    checklist.push({ key: 'brand_ownership', label: 'Propiedad de la marca', ok: ok(brand && brand.created_by === me.email) });

    // Vertical
    checklist.push({ key: 'vertical_known', label: 'Vertical conocida', ok: ok(['payments','shipping','saas'].includes(vertical)) });

    // Analyzer
    let result = null; let input = null;
    if (resultId) {
      const r = await base44.entities.AnalyzerResult.filter({ id: resultId });
      result = r?.[0] || null;
      if (result?.input_id) {
        const ins = await base44.entities.AnalyzerInput.filter({ id: result.input_id });
        input = ins?.[0] || null;
      }
    }
    checklist.push({ key: 'analysis_present', label: 'Resultado del analizador disponible', ok: ok(result) });

    // Baseline computable
    const baselineComputable = (() => {
      if (!vertical) return false;
      if (vertical === 'payments') return !!(input?.monthly_revenue && (result?.details?.payment_current_rate ?? null) !== null);
      if (vertical === 'shipping') return !!(result?.details?.shipping_current_avg || input?.monthly_shipping_cost);
      return !!(input?.total_saas_spend);
    })();
    checklist.push({ key: 'baseline_ready', label: 'Baseline calculable', ok: baselineComputable });

    // Provider mapping
    const providerOk = (vertical === 'payments' && !!input?.payment_provider)
      || (vertical === 'shipping' && !!input?.shipping_provider)
      || (vertical === 'saas');
    checklist.push({ key: 'provider_mapping', label: 'Proveedor mapeado', ok: providerOk });

    // Duplicate check
    let duplicate = false;
    if (brand) {
      const existing = await base44.entities.DealActivation.filter({ brand_id: brand.id, vertical });
      duplicate = existing.some(d => ['activated','awaiting_authorization','authorized','migrating','live','monetizing','paused'].includes(d.status));
    }
    checklist.push({ key: 'no_duplicate', label: 'Sin activación duplicada', ok: !duplicate });

    // Billing prerequisites
    checklist.push({ key: 'billing_prereq', label: 'Regla de facturación preparada', ok: true, details: 'Se creará si no existe' });

    const can_activate = checklist.every(i => i.ok);
    return Response.json({ ok: true, can_activate, checklist, brand_id: brand?.id || null, vertical, result_present: !!result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});