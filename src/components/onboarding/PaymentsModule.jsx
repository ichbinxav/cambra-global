import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getMyActiveBrand } from '@/lib/getMyActiveBrand';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import ComboBox from '@/components/inputs/ComboBox';
import MultiComboBox from '@/components/inputs/MultiComboBox';
import { COUNTRIES } from '@/components/inputs/CountrySelect';
import SmartNumberField from '@/components/inputs/SmartNumberField.jsx';
import OptionTiles from '@/components/onboarding/OptionTiles';
import VerticalStatusBadge from '@/components/onboarding/VerticalStatusBadge';

/**
 * @typedef {{
 *   id?: string,
 *   brand_id?: string,
 *   psp_actual?: string,
 *   current_psp?: string,
 *   blended_rate?: number,
 *   blended_rate_percent?: number,
 *   canales: any[],
 *   channels?: any[],
 *   paises: any[],
 *   countries?: any[],
 *   monedas: any[],
 *   currencies?: any[],
 *   vol_mensual?: number,
 *   monthly_volume_eur?: number,
 *   tx_mensuales?: number,
 *   monthly_tx_count?: number,
 *   aov?: number,
 *   average_order_value_eur?: number,
 *   refunds_rate?: number,
 *   refunds_rate_percent?: number,
 *   chargeback_rate?: number,
 *   chargeback_rate_percent?: number,
 *   payout_timing?: number,
 *   payout_days?: number,
 *   fraude_flags?: string[] | string,
 *   risk_notes?: string,
 *   contrato?: { renovacion_en?: string, tipo?: string },
 *   contract?: { renewal_on?: string, type?: string },
 *   frustraciones?: string,
 *   frustrations?: string,
 *   terminal_provider?: string,
 * }} PaymentsProfileDraft
 */

export default function PaymentsModule(){
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState(/** @type {PaymentsProfileDraft} */ ({ canales: [], paises: [], monedas: [] }));
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(()=>{ (async()=>{
    // A2 migration — this is the payments-vertical onboarding gateway, so
    // the fix here matters end-to-end: a user whose brand was written by
    // service role could not reach Stripe connect from here because brandId
    // stayed null forever.
    const { brand: b } = await getMyActiveBrand();
    setBrandId(b?.id);
    if (!b?.id) return;
    const [pp] = await base44.entities.PaymentsProfile.filter({ brand_id: b.id }, '-updated_date', 1);
    setItem(/** @type {PaymentsProfileDraft} */ (pp || { brand_id: b.id, canales: [], paises: [], monedas: [] }));
    await refreshStatus();
  })(); },[]);

  // Fetches vertical status (completeness / readiness / missing_fields).
  const refreshStatus = async () => {
    try {
      const res = await base44.functions.invoke('getOnboardingStatus', {});
      setStatus(res?.data?.statuses?.payments || null);
    } catch { /* non-fatal — badge just stays in its previous state */ }
  };

  const save = async () => {
    if (saving || !brandId) return; // double-submit guard (CONSOLIDATE-1 T2)
    setSaving(true);
    try {
    const body = {
      ...item,
      brand_id: brandId,
      // canonical write (EN) + legacy mirror (ES)
      current_psp: item.psp_actual ?? item.current_psp ?? '',
      blended_rate_percent: item.blended_rate ?? item.blended_rate_percent ?? 0,
      channels: item.canales ?? item.channels ?? [],
      countries: item.paises ?? item.countries ?? [],
      currencies: item.monedas ?? item.currencies ?? [],
      monthly_volume_eur: item.vol_mensual ?? item.monthly_volume_eur ?? 0,
      monthly_tx_count: item.tx_mensuales ?? item.monthly_tx_count ?? 0,
      average_order_value_eur: item.aov ?? item.average_order_value_eur ?? 0,
      refunds_rate_percent: item.refunds_rate ?? item.refunds_rate_percent ?? 0,
      chargeback_rate_percent: item.chargeback_rate ?? item.chargeback_rate_percent ?? 0,
      payout_days: item.payout_timing ?? item.payout_days ?? 0,
      risk_notes: Array.isArray(item.fraude_flags) ? item.fraude_flags.join(', ') : (item.fraude_flags ?? item.risk_notes ?? ''),
      contract: {
        renewal_on: item.contrato?.renovacion_en ?? item.contract?.renewal_on ?? '',
        type: item.contrato?.tipo ? (item.contrato.tipo === 'mensual' ? 'monthly' : item.contrato.tipo === 'anual' ? 'annual' : 'other') : (item.contract?.type ?? undefined)
      },
      frustrations: item.frustraciones ?? item.frustrations ?? ''
    };
    if (item?.id) await base44.entities.PaymentsProfile.update(item.id, body);
    else {
      const created = await base44.entities.PaymentsProfile.create(body);
      setItem(/** @type {PaymentsProfileDraft} */ (created));
    }
    await base44.functions.invoke('computeVerticalStatus', { brandId, vertical: 'payments' });
    await refreshStatus();
    } finally {
      setSaving(false); // always released — a failed save no longer wedges the button
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 glass flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">We only ask for the basics. You can expand anytime.</p>
            <VerticalStatusBadge status={status} />
          </div>
          <Button variant="outline" onClick={()=>setShowAdvanced(v=>!v)} className="h-8 text-xs">
            {showAdvanced ? 'Hide advanced' : 'Enrich your information'}
          </Button>
        </div>
        {/* Provider and markets */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Provider and markets</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-3">
              <OptionTiles
                label="Payment provider"
                value={item.psp_actual||''}
                onChange={(v)=>setItem({...item, psp_actual: v})}
                options={["Stripe","Adyen","Mollie","PayPal","Klarna","Square","Braintree","Worldpay","Checkout.com","Shopify Payments"]}
              />
              {showAdvanced && (
                <ComboBox
                  label="Search/add provider"
                  value={item.psp_actual||''}
                  onChange={(v)=>setItem({...item, psp_actual: v})}
                  options={["Stripe","Adyen","Mollie","PayPal","Klarna","Square","Braintree","Worldpay","Checkout.com","Shopify Payments"]}
                  allowCustom
                />
              )}
            </div>

            {showAdvanced && (
              <MultiComboBox
                label="Sales channels"
                values={item.canales||[]}
                onChange={(vals)=>setItem({...item, canales: vals})}
                options={["online","in_store","omni"]}
                allowCustom={false}
              />
            )}

            {showAdvanced && (
              <div className="space-y-3">
                <MultiComboBox
                  label="Countries"
                  values={item.paises||[]}
                  onChange={(vals)=>setItem({...item, paises: vals})}
                  options={COUNTRIES}
                />
                <MultiComboBox
                  label="Currencies"
                  values={item.monedas||[]}
                  onChange={(vals)=>setItem({...item, monedas: vals})}
                  options={["EUR","USD","GBP","AUD","CAD","SEK","NOK","DKK","CHF","JPY"]}
                  allowCustom
                />
              </div>
            )}
          </div>
        </div>

        {/* Volumes and metrics */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Volumes and metrics</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SmartNumberField label="Blended rate %" value={item.blended_rate||0} onChange={(v)=>setItem({...item, blended_rate: Number(v)})} min={0} max={3.5} decimals={2} suffix="%" />
            <SmartNumberField label="Monthly volume (€)" value={item.vol_mensual||0} onChange={(v)=>setItem({...item, vol_mensual: Number(v)})} min={0} max={10000000} prefix="€" scale="log" />
            {showAdvanced && (<>
              <SmartNumberField label="Monthly transactions" value={item.tx_mensuales||0} onChange={(v)=>setItem({...item, tx_mensuales: Number(v)})} min={0} max={200000} scale="log" />
              <SmartNumberField label="Average order value (€)" value={item.aov||0} onChange={(v)=>setItem({...item, aov: Number(v)})} min={0} max={500} prefix="€" />
              <SmartNumberField label="Refunds %" value={item.refunds_rate||0} onChange={(v)=>setItem({...item, refunds_rate: Number(v)})} min={0} max={30} decimals={1} suffix="%" />
              <SmartNumberField label="Chargebacks %" value={item.chargeback_rate||0} onChange={(v)=>setItem({...item, chargeback_rate: Number(v)})} min={0} max={5} decimals={2} suffix="%" />
              <SmartNumberField label="Payout timing" value={item.payout_timing||0} onChange={(v)=>setItem({...item, payout_timing: Number(v)})} min={0} max={30} suffix="d" />
            </>)}
          </div>
        </div>

        {/* Risk and terminals */}
        <div className={`p-4 sm:p-5 rounded-2xl border border-border/60 glass ${showAdvanced ? '' : 'hidden'}`}>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Risk and terminals</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MultiComboBox
              label="Risk flags"
              values={Array.isArray(item.fraude_flags) ? item.fraude_flags : ((item.fraude_flags||'').split(',').map(s=>s.trim()).filter(Boolean))}
              onChange={(vals)=>setItem({...item, fraude_flags: vals})}
              options={["High refunds","High chargebacks","AVS mismatch","BIN country mismatch","3DS friction","Velocity spikes","Disputes trend"]}
            />
            <ComboBox
              label="Terminal provider"
              value={item.terminal_provider||''}
              onChange={(v)=>setItem({...item, terminal_provider: v})}
              options={["Ingenico","Verifone","PAX","SumUp","Square","Castles"]}
              allowCustom
            />
          </div>
        </div>

        {/* Contract and notes */}
        <div className={`p-4 sm:p-5 rounded-2xl border border-border/60 glass ${showAdvanced ? '' : 'hidden'}`}>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Contract and notes</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input type="date" placeholder="Contract renewal" value={item.contrato?.renovacion_en||''} onChange={e=>setItem({...item, contrato: { ...(item.contrato||{}), renovacion_en: e.target.value }})} />
            <ComboBox
              label="Contract type"
              value={item.contrato?.tipo||''}
              onChange={(v)=>setItem({...item, contrato: { ...(item.contrato||{}), tipo: v }})}
              options={["monthly","annual","other"]}
              allowCustom={false}
            />
            <Input placeholder="Frustrations" value={item.frustraciones||''} onChange={e=>setItem({...item, frustraciones: e.target.value})} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving? 'Saving…':'Save module'}</Button>
        <a href="/Analyzer" className="text-sm underline">Go to Analyzer</a>
      </div>
    </div>
  );
}