import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import MissingDataChips from './MissingDataChips';
import TagChipsInput from './TagChipsInput';

export default function PaymentsModule(){
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({ canales: [], paises: [], monedas: [] });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ (async()=>{
    const me = await base44.auth.me();
    const [b] = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
    setBrandId(b?.id);
    if (!b?.id) return;
    const [pp] = await base44.entities.PaymentsProfile.filter({ brand_id: b.id }, '-updated_date', 1);
    setItem(pp || { brand_id: b.id, canales: [], paises: [], monedas: [] });
    await refreshStatus(b.id);
  })(); },[]);

  const refreshStatus = async (bid)=>{
    const res = await base44.functions.invoke('getOnboardingStatus', {});
    setStatus(res.data?.statuses?.payments || null);
  };

  const save = async () => {
    if (!brandId) return;
    setSaving(true);
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
      risk_notes: item.fraude_flags ?? item.risk_notes ?? '',
      contract: {
        renewal_on: item.contrato?.renovacion_en ?? item.contract?.renewal_on ?? '',
        type: item.contrato?.tipo ? (item.contrato.tipo === 'mensual' ? 'monthly' : item.contrato.tipo === 'anual' ? 'annual' : 'other') : (item.contract?.type ?? undefined)
      },
      frustrations: item.frustraciones ?? item.frustrations ?? ''
    };
    if (item?.id) await base44.entities.PaymentsProfile.update(item.id, body);
    else {
      const created = await base44.entities.PaymentsProfile.create(body);
      setItem(created);
    }
    await base44.functions.invoke('computeVerticalStatus', { brandId, vertical: 'payments' });
    await refreshStatus(brandId);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input placeholder="Current PSP (e.g. Stripe)" value={item.psp_actual||''} onChange={e=>setItem({...item, psp_actual: e.target.value})} />
        <Input type="number" step="0.01" placeholder="Blended rate %" value={item.blended_rate||''} onChange={e=>setItem({...item, blended_rate: Number(e.target.value)})} />
        <TagChipsInput
          label="Sales channels"
          values={item.canales||[]}
          onChange={(vals)=>setItem({...item, canales: vals})}
          placeholder="Add channel (online, in_store, omni)"
          suggestions={["online","in_store","omni"]}
        />
        <TagChipsInput
          label="Countries"
          values={item.paises||[]}
          onChange={(vals)=>setItem({...item, paises: vals})}
          placeholder="Add country code or name"
        />
        <TagChipsInput
          label="Currencies"
          values={item.monedas||[]}
          onChange={(vals)=>setItem({...item, monedas: vals})}
          placeholder="Add currency (EUR, USD, ...)"
          suggestions={["EUR","USD","GBP"]}
        />
        <Input type="number" placeholder="Monthly volume (€)" value={item.vol_mensual||''} onChange={e=>setItem({...item, vol_mensual: Number(e.target.value)})} />
        <Input type="number" placeholder="Monthly transactions" value={item.tx_mensuales||''} onChange={e=>setItem({...item, tx_mensuales: Number(e.target.value)})} />
        <Input type="number" step="0.01" placeholder="Average order value (€)" value={item.aov||''} onChange={e=>setItem({...item, aov: Number(e.target.value)})} />
        <Input type="number" step="0.01" placeholder="Refunds %" value={item.refunds_rate||''} onChange={e=>setItem({...item, refunds_rate: Number(e.target.value)})} />
        <Input type="number" step="0.01" placeholder="Chargebacks %" value={item.chargeback_rate||''} onChange={e=>setItem({...item, chargeback_rate: Number(e.target.value)})} />
        <Input type="number" placeholder="Payout timing (days)" value={item.payout_timing||''} onChange={e=>setItem({...item, payout_timing: Number(e.target.value)})} />
        <Input placeholder="Risk notes" value={item.fraude_flags||''} onChange={e=>setItem({...item, fraude_flags: e.target.value})} />
        <Input placeholder="Terminal provider" value={item.terminal_provider||''} onChange={e=>setItem({...item, terminal_provider: e.target.value})} />
        <Input placeholder="Contract renewal (YYYY-MM-DD)" value={item.contrato?.renovacion_en||''} onChange={e=>setItem({...item, contrato: { ...(item.contrato||{}), renovacion_en: e.target.value }})} />
        <Input placeholder="Contract type (monthly/annual)" value={item.contrato?.tipo||''} onChange={e=>setItem({...item, contrato: { ...(item.contrato||{}), tipo: e.target.value }})} />
        <Input placeholder="Frustrations" value={item.frustraciones||''} onChange={e=>setItem({...item, frustraciones: e.target.value})} />
      </div>
      <MissingDataChips items={status?.missing_fields||[]} />
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving? 'Saving…':'Save module'}</Button>
        <a href="/Deals?vertical=payments" className="text-sm underline">View deals</a>
        <a href="/Analyzer" className="text-sm underline">Go to Analyzer</a>
      </div>
    </div>
  );
}