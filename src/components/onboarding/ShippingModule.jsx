import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import MissingDataChips from './MissingDataChips';
import MultiComboBox from '@/components/inputs/MultiComboBox';
import { COUNTRIES } from '@/components/inputs/CountrySelect';
import ComboBox from '@/components/inputs/ComboBox';
import OptionTiles from '@/components/onboarding/OptionTiles';
import { Switch } from '@/components/ui/switch';
import SmartNumberField from '@/components/inputs/SmartNumberField.jsx';

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
      <div className="space-y-4">
        {/* Carriers y modelo */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Carriers y modelo</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MultiComboBox label="Carriers" values={item.carriers||[]} onChange={(vals)=>setItem({...item, carriers: vals})} options={["DHL","UPS","FedEx","DPD","PostNL","Royal Mail","Evri","GLS","Colissimo","Chronopost"]} />
            <OptionTiles label="Model" value={item.shipping_model||''} onChange={(v)=>setItem({...item, shipping_model: v})} options={["aggregator","direct"]} />
            <div className="space-y-3">
              <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-border/60 glass">
                <span className="text-sm">Uses 3PL</span>
                <Switch checked={!!item.three_pl} onCheckedChange={(v)=>setItem({...item, three_pl: !!v})} />
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-border/60 glass">
                <span className="text-sm">In-house ops</span>
                <Switch checked={!!item.in_house} onCheckedChange={(v)=>setItem({...item, in_house: !!v})} />
              </div>
            </div>
          </div>
        </div>

        {/* Países servidos */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Países servidos</div>
          <MultiComboBox label="Served countries" values={item.paises_serv||[]} onChange={(vals)=>setItem({...item, paises_serv: vals})} options={COUNTRIES} />
        </div>

        {/* Volumen y paquetes */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Volumen y paquetes</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SmartNumberField label="Monthly orders" value={item.pedidos_mensuales||0} onChange={(v)=>setItem({...item, pedidos_mensuales: Number(v)})} min={0} max={1000000} scale="log" />
            <SmartNumberField label="Avg weight" value={item.avg_weight||0} onChange={(v)=>setItem({...item, avg_weight: Number(v)})} min={0} max={200} decimals={2} suffix="kg" />
            <Input placeholder="Dimensions (LxWxH)" value={item.dims||''} onChange={e=>setItem({...item, dims: e.target.value})} />
          </div>
        </div>

        {/* Costes y mix */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Costes y mix</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SmartNumberField label="Return rate" value={item.returns_rate||0} onChange={(v)=>setItem({...item, returns_rate: Number(v)})} min={0} max={100} decimals={1} suffix="%" />
            <SmartNumberField label="Cost per shipment" value={item.coste_envio||0} onChange={(v)=>setItem({...item, coste_envio: Number(v)})} min={0} max={1000} decimals={2} prefix="€" />
            <SmartNumberField label="Express share" value={item.mix_express_standard||0} onChange={(v)=>setItem({...item, mix_express_standard: Number(v)})} min={0} max={100} suffix="%" />
          </div>
        </div>

        {/* Almacén y fricciones */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Almacén y fricciones</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ComboBox label="Warehouse model" value={item.warehouse_model||''} onChange={(v)=>setItem({...item, warehouse_model: v})} options={["own","3pl","hybrid","other"]} allowCustom={false} />
            <Input placeholder="Pain points" value={item.pain_points||''} onChange={e=>setItem({...item, pain_points: e.target.value})} />
          </div>
        </div>
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