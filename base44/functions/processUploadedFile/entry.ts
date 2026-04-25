import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeArray(output) {
  if (!output) return [];
  if (Array.isArray(output)) return output;
  if (Array.isArray(output.records)) return output.records;
  if (Array.isArray(output.transactions)) return output.transactions;
  if (Array.isArray(output.items)) return output.items;
  return typeof output === 'object' ? [output] : [];
}

function sum(arr, keyCandidates) {
  return arr.reduce((acc, it) => {
    for (const k of keyCandidates) {
      if (typeof it[k] === 'number' && !Number.isNaN(it[k])) return acc + it[k];
      if (typeof it[k] === 'string') {
        const v = Number(String(it[k]).replace(/[^0-9.\-]/g, ''));
        if (!Number.isNaN(v)) return acc + v;
      }
    }
    return acc;
  }, 0);
}

function countWithKeys(arr, keys) {
  return arr.filter(it => keys.every(k => it[k] !== undefined && it[k] !== null && String(it[k]).length > 0)).length;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_url, file_name } = await req.json();
    if (!file_url) return Response.json({ error: 'file_url is required' }, { status: 400 });

    // Try three extraction schemas and pick the best match
    const paymentsSchema = {
      type: 'object',
      properties: {
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              amount: { type: 'number' },
              gross_amount: { type: 'number' },
              fee: { type: 'number' },
              fee_amount: { type: 'number' },
              currency: { type: 'string' },
              provider: { type: 'string' },
              type: { type: 'string' }
            },
            required: ['amount']
          }
        }
      }
    };

    const shippingSchema = {
      type: 'object',
      properties: {
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              cost: { type: 'number' },
              price: { type: 'number' },
              weight: { type: 'number' },
              service: { type: 'string' },
              country: { type: 'string' }
            },
            required: ['cost']
          }
        }
      }
    };

    const saasSchema = {
      type: 'object',
      properties: {
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              tool: { type: 'string' },
              plan: { type: 'string' },
              amount: { type: 'number' },
              total: { type: 'number' },
              period_start: { type: 'string' },
              period_end: { type: 'string' },
              tax: { type: 'number' }
            },
            required: ['amount']
          }
        }
      }
    };

    const attempts = [];

    const pay = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: paymentsSchema });
    attempts.push({ key: 'payments', raw: pay, data: normalizeArray(pay?.output), score: 0 });

    const ship = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: shippingSchema });
    attempts.push({ key: 'shipping', raw: ship, data: normalizeArray(ship?.output), score: 0 });

    const saas = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: saasSchema });
    attempts.push({ key: 'saas', raw: saas, data: normalizeArray(saas?.output), score: 0 });

    // Simple heuristic scoring per type
    for (const a of attempts) {
      if (a.key === 'payments') {
        a.score = countWithKeys(a.data, ['amount']) + countWithKeys(a.data, ['fee', 'fee_amount']);
      } else if (a.key === 'shipping') {
        a.score = countWithKeys(a.data, ['cost']) + countWithKeys(a.data, ['weight']);
      } else if (a.key === 'saas') {
        a.score = countWithKeys(a.data, ['amount']) + countWithKeys(a.data, ['plan']);
      }
    }

    attempts.sort((x, y) => y.score - x.score);
    const best = attempts[0];

    let detected = (best?.score || 0) > 0 ? best.key : 'unknown';
    let aggregates = {};

    // Find user's brand
    let brandId = null;
    try {
      const me = await base44.auth.me();
      const list = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
      if (Array.isArray(list) && list[0]?.id) brandId = list[0].id;
    } catch (_) {}

    // Compute aggregates and update profiles/inputs
    let updates = { payments: false, shipping: false, saas: false };

    if (detected === 'payments') {
      const total = sum(best.data, ['gross_amount', 'amount']);
      const fees = sum(best.data, ['fee_amount', 'fee']);
      const pct = total > 0 ? (fees / total) * 100 : 0;
      const provider = (best.data.find(r => r.provider)?.provider) || (file_name||'').toLowerCase().includes('stripe') ? 'Stripe' : undefined;
      aggregates = { payments: { total_volume_eur: total, fee_pct: Number(pct.toFixed(2)), provider: provider || null } };

      if (brandId && (total > 0 || pct > 0)) {
        const [pp] = await base44.entities.PaymentsProfile.filter({ brand_id: brandId }, '-updated_date', 1);
        const body = {
          brand_id: brandId,
          monthly_volume_eur: total,
          blended_rate_percent: Number(pct.toFixed(2)),
        };
        if (provider) body.current_psp = provider;
        if (pp?.id) await base44.entities.PaymentsProfile.update(pp.id, body);
        else await base44.entities.PaymentsProfile.create(body);
        updates.payments = true;
      }
    } else if (detected === 'shipping') {
      const totalCost = sum(best.data, ['cost', 'price']);
      const count = best.data.length;
      const avgWeight = count > 0 ? sum(best.data, ['weight']) / count : 0;
      aggregates = { shipping: { monthly_shipping_cost: totalCost, monthly_shipments: count, avg_weight_kg: Number(avgWeight.toFixed(2)) } };

      if (brandId && (totalCost > 0 || count > 0)) {
        const [sp] = await base44.entities.ShippingProfile.filter({ brand_id: brandId }, '-updated_date', 1);
        const body = {
          brand_id: brandId,
          monthly_orders: count,
          shipping_cost_eur: totalCost,
          avg_weight_kg: Number(avgWeight.toFixed(2))
        };
        if (sp?.id) await base44.entities.ShippingProfile.update(sp.id, body);
        else await base44.entities.ShippingProfile.create(body);
        updates.shipping = true;
      }
    } else if (detected === 'saas') {
      const total = sum(best.data, ['total', 'amount']);
      // Optional breakdown by provider/tool
      const map = {};
      for (const r of best.data) {
        const key = r.provider || r.tool || 'Unknown';
        const val = (typeof r.total === 'number' ? r.total : (typeof r.amount === 'number' ? r.amount : Number(String(r.amount||'').replace(/[^0-9.\-]/g, '')))) || 0;
        map[key] = (map[key] || 0) + (Number.isFinite(val) ? val : 0);
      }
      aggregates = { saas: { total_saas_spend: total, monthly_spend_map: map } };

      if (brandId && total > 0) {
        const [sa] = await base44.entities.SaaSProfile.filter({ brand_id: brandId }, '-updated_date', 1);
        const body = {
          brand_id: brandId,
          monthly_spend_map: map,
        };
        if (sa?.id) await base44.entities.SaaSProfile.update(sa.id, body);
        else await base44.entities.SaaSProfile.create(body);
        updates.saas = true;
      }
    }

    // Also nudge AnalyzerInput with key aggregates if possible (non-blocking)
    try {
      if (brandId) {
        const [ai] = await base44.entities.AnalyzerInput.filter({ brand_id: brandId }, '-updated_date', 1);
        const patch = { brand_id: brandId };
        if (aggregates.payments) {
          patch.monthly_revenue = Math.max(aggregates.payments.total_volume_eur || 0, 0);
          patch.payment_fee_pct = Math.max(aggregates.payments.fee_pct || 0, 0);
          if (aggregates.payments.provider) patch.payment_provider = aggregates.payments.provider;
        }
        if (aggregates.shipping) {
          patch.monthly_shipping_cost = Math.max(aggregates.shipping.monthly_shipping_cost || 0, 0);
          patch.monthly_shipments = Math.max(aggregates.shipping.monthly_shipments || 0, 0);
        }
        if (aggregates.saas) {
          patch.total_saas_spend = Math.max(aggregates.saas.total_saas_spend || 0, 0);
        }
        const hasFields = Object.keys(patch).length > 1;
        if (hasFields) {
          if (ai?.id) await base44.entities.AnalyzerInput.update(ai.id, patch);
          else await base44.entities.AnalyzerInput.create(patch);
        }
      }
    } catch (_) { /* ignore analyzer input issues */ }

    return Response.json({ detected, aggregates, updates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});