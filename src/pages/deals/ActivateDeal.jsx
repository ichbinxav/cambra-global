import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ActivateDeal() {
  const [result, setResult] = useState(null);
  const [input, setInput] = useState(null);
  const [brand, setBrand] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const params = new URLSearchParams(window.location.search);
  const vertical = params.get('vertical');
  const resultId = params.get('resultId') || params.get('id');

  useEffect(() => {
    (async () => {
      const authed = await base44.auth.isAuthenticated();
      if (!authed) { base44.auth.redirectToLogin(window.location.href); return; }
      const me = await base44.auth.me();
      const brands = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
      setBrand(brands[0] || null);
      if (resultId) {
        const r = await base44.entities.AnalyzerResult.filter({ id: resultId });
        if (r.length) {
          setResult(r[0]);
          if (r[0].input_id) {
            const ins = await base44.entities.AnalyzerInput.filter({ id: r[0].input_id });
            if (ins.length) setInput(ins[0]);
          }
        }
      }
      setLoading(false);
    })();
  }, [resultId]);

  const summary = useMemo(() => {
    if (!result) return null;
    const monthlyRevenue = input?.monthly_revenue || 0;
    if (vertical === 'payments') {
      const curr = result.details?.payment_current_rate ?? 2.9;
      const next = result.details?.payment_optimal_rate ?? 1.4;
      const currentMonthly = monthlyRevenue * (curr / 100);
      const projectedMonthly = monthlyRevenue * (next / 100);
      return { currentProvider: input?.payment_provider || 'Current PSP', projectedProvider: 'Network PSP', currentMonthly, projectedMonthly };
    }
    if (vertical === 'shipping') {
      const perCurr = result.details?.shipping_current_avg ?? 7.5;
      const perNext = result.details?.shipping_optimal_avg ?? 5.2;
      const shipments = input?.monthly_shipments ?? Math.max(1, Math.round((input?.monthly_shipping_cost || 0) / perCurr));
      return { currentProvider: input?.shipping_provider || 'Current carrier', projectedProvider: 'Network carrier', currentMonthly: perCurr * shipments, projectedMonthly: perNext * shipments };
    }
    // saas
    const currentMonthly = input?.total_saas_spend ?? 2500;
    const projectedMonthly = result.details?.saas_optimal_total ?? currentMonthly * 0.7;
    return { currentProvider: 'Current tools', projectedProvider: 'Group licenses', currentMonthly, projectedMonthly };
  }, [result, input, vertical]);

  if (loading || !result || !summary) {
    return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin"/></div>;
  }

  const estMonthly = Math.max(0, summary.currentMonthly - summary.projectedMonthly);
  const estAnnual = estMonthly * 12;
  const fee = estAnnual * 0.25;
  const net = estAnnual - fee;

  const handleContinue = async () => {
    const me = await base44.auth.me();
    const deal = await base44.entities.DealActivation.create({
      brand_id: brand?.id,
      user_email: me.email,
      vertical,
      provider_from: summary.currentProvider,
      provider_to: summary.projectedProvider,
      projected_savings_monthly: Math.round(estMonthly),
      projected_savings_annual: Math.round(estAnnual),
      node_share_percent: 25,
      billing_model: 'monthly_success_fee',
      status: 'awaiting_authorization',
      activated_at: new Date().toISOString(),
    });

    // lock baseline
    const baselineType = vertical === 'payments' ? 'rate' : 'cost';
    const baselineValue = vertical === 'payments'
      ? (result.details?.payment_current_rate ?? 2.9)
      : (vertical === 'shipping' ? (result.details?.shipping_current_avg ?? 7.5) : (input?.total_saas_spend ?? 2500));

    await base44.entities.Baseline.create({
      company_id: brand?.id,
      deal_id: deal.id,
      vertical,
      baseline_type: baselineType,
      baseline_value: baselineValue,
      snapshot_json: { resultId, inputId: result.input_id, details: result.details },
      source: input ? 'manual' : 'api',
      locked: true,
      locked_at: new Date().toISOString(),
    });

    // default billing rule
    await base44.entities.BillingRule.create({ deal_id: deal.id, start_date: new Date().toISOString().slice(0,10), node_share_percent: 25, model: 'monthly_success_fee' });

    navigate(`/deal/authorize/${deal.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-black">Opportunity summary</h1>
      <div className="rounded-xl border p-5 bg-card">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground/60">Current provider</p>
            <p className="font-semibold">{summary.currentProvider}</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Projected provider</p>
            <p className="font-semibold">{summary.projectedProvider}</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Current cost / month</p>
            <p className="font-bold tabular-nums">€{Math.round(summary.currentMonthly).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Projected cost / month</p>
            <p className="font-bold tabular-nums">€{Math.round(summary.projectedMonthly).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Estimated savings / month</p>
            <p className="font-bold tabular-nums text-green-600">€{Math.round(estMonthly).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Estimated savings / year</p>
            <p className="font-bold tabular-nums text-green-600">€{Math.round(estAnnual).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">THE NoDE fee (25%)</p>
            <p className="font-bold tabular-nums">€{Math.round(fee).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Net savings retained</p>
            <p className="font-bold tabular-nums">€{Math.round(net).toLocaleString()}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleContinue} className="gap-2">Continue <ArrowRight className="w-4 h-4"/></Button>
      </div>
    </div>
  );
}