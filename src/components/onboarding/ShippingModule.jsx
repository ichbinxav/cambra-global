import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import MissingDataChips from './MissingDataChips';
import MultiComboBox from '@/components/inputs/MultiComboBox';
import { COUNTRIES } from '@/components/inputs/CountrySelect';

export default function ShippingModule(){
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({ carriers: [], paises_serv: [] });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ (async()=>{
    const me = await base44.auth.me();
    const [b] = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
    setBrandId(b?.id);
    if (!b?.id) return;
    const [sp] = await base44.entities.ShippingProfile.filter({ brand_id: b.id }, '-updated_date', 1);
    setItem(sp || { brand_id: b.id, carriers: [], paises_serv: [] });
    await refreshStatus(b.id);
  })(); },[]);

  const refreshStatus = async (bid)=>{
    const res = await base44.functions.invoke('getOnboardingStatus', {});
    setStatus(res.data?.statuses?.shipping || null);
  };

  const save = async () => {
    if (!brandId) return;
    setSaving(true);
    const body = {
      ...item,
      brand_id: brandId,
      // canonical write (EN) + legacy mirror (ES)
      shipping_model: item.modelo ? (item.modelo === 'agregador' ? 'aggregator' : 'direct') : (item.shipping_model ?? undefined),
      served_countries: item.paises_serv ?? item.served_countries ?? [],
      domestic_share_percent: item.domestic_vs_intl ?? item.domestic_share_percent ?? 0,
      monthly_orders: item.pedidos_mensuales ?? item.monthly_orders ?? 0,
      avg_weight_kg: item.avg_weight ?? item.avg_weight_kg ?? 0,
      dimensions: item.dims ?? item.dimensions ?? '',
      return_rate_percent: item.returns_rate ?? item.return_rate_percent ?? 0,
      shipping_cost_eur: item.coste_envio ?? item.shipping_cost_eur ?? 0,
      express_mix_percent: item.mix_express_standard ?? item.express_mix_percent ?? 0
    };
    if (item?.id) await base44.entities.ShippingProfile.update(item.id, body);
    else {
      const created = await base44.entities.ShippingProfile.create(body);
      setItem(created);
    }
    await base44.functions.invoke('computeVerticalStatus', { brandId, vertical: 'shipping' });
    await refreshStatus(brandId);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MultiComboBox label="Carriers" values={item.carriers||[]} onChange={(vals)=>setItem({...item, carriers: vals})} options={["DHL","UPS","FedEx","DPD","PostNL","Royal Mail","Evri","GLS","Colissimo","Chronopost"]} />
        <Input placeholder="Model (aggregator/direct)" value={item.modelo||''} onChange={e=>setItem({...item, modelo: e.target.value})} />
        <Input placeholder="3PL (true/false)" value={String(item.three_pl||'')} onChange={e=>setItem({...item, three_pl: e.target.value==='true'})} />
        <Input placeholder="In-house (true/false)" value={String(item.in_house||'')} onChange={e=>setItem({...item, in_house: e.target.value==='true'})} />
        <MultiComboBox label="Served countries" values={item.paises_serv||[]} onChange={(vals)=>setItem({...item, paises_serv: vals})} options={COUNTRIES} />
        <Input type="number" placeholder="Domestic share % (0-100)" value={item.domestic_vs_intl||''} onChange={e=>setItem({...item, domestic_vs_intl: Number(e.target.value)})} />
        <Input type="number" placeholder="Monthly orders" value={item.pedidos_mensuales||''} onChange={e=>setItem({...item, pedidos_mensuales: Number(e.target.value)})} />
        <Input type="number" step="0.01" placeholder="Avg weight (kg)" value={item.avg_weight||''} onChange={e=>setItem({...item, avg_weight: Number(e.target.value)})} />
        <Input placeholder="Dimensions (LxWxH)" value={item.dims||''} onChange={e=>setItem({...item, dims: e.target.value})} />
        <Input type="number" step="0.01" placeholder="Return rate %" value={item.returns_rate||''} onChange={e=>setItem({...item, returns_rate: Number(e.target.value)})} />
        <Input type="number" step="0.01" placeholder="Cost per shipment €" value={item.coste_envio||''} onChange={e=>setItem({...item, coste_envio: Number(e.target.value)})} />
        <Input type="number" placeholder="Express share % (0-100)" value={item.mix_express_standard||''} onChange={e=>setItem({...item, mix_express_standard: Number(e.target.value)})} />
        <Input placeholder="Warehouse model (own/3pl/hybrid)" value={item.warehouse_model||''} onChange={e=>setItem({...item, warehouse_model: e.target.value})} />
        <Input placeholder="Pain points" value={item.pain_points||''} onChange={e=>setItem({...item, pain_points: e.target.value})} />
      </div>
      <MissingDataChips items={status?.missing_fields||[]} />
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving? 'Saving…':'Save module'}</Button>
        <a href="/Deals?vertical=shipping" className="text-sm underline">View deals</a>
        <a href="/Analyzer" className="text-sm underline">Go to Analyzer</a>
      </div>
    </div>
  );
}