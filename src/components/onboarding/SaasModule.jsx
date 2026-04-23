import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import MissingDataChips from './MissingDataChips';

export default function SaasModule(){
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({ email_sms: [], extras: [], gasto_mensual_map: {}, contrato_map: {}, renovaciones_map: {} });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{ (async()=>{
    const me = await base44.auth.me();
    const [b] = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
    setBrandId(b?.id);
    if (!b?.id) return;
    const [sa] = await base44.entities.SaaSProfile.filter({ brand_id: b.id }, '-updated_date', 1);
    setItem(sa || { brand_id: b.id, email_sms: [], extras: [], gasto_mensual_map: {}, contrato_map: {}, renovaciones_map: {} });
    await refreshStatus(b.id);
  })(); },[]);

  const refreshStatus = async (bid)=>{
    const res = await base44.functions.invoke('getOnboardingStatus', {});
    setStatus(res.data?.statuses?.saas || null);
  };

  const save = async () => {
    if (!brandId) return;
    setSaving(true);
    const body = {
      ...item,
      brand_id: brandId,
      // canonical write (EN) + legacy mirror (ES)
      platform: item.plataforma ?? item.platform ?? '',
      support: item.soporte ?? item.support ?? '',
      monthly_spend_map: item.gasto_mensual_map ?? item.monthly_spend_map ?? {},
      renewals_map: item.renovaciones_map ?? item.renewals_map ?? {}
    };
    if (item?.id) await base44.entities.SaaSProfile.update(item.id, body);
    else {
      const created = await base44.entities.SaaSProfile.create(body);
      setItem(created);
    }
    await base44.functions.invoke('computeVerticalStatus', { brandId, vertical: 'saas' });
    await refreshStatus(brandId);
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input placeholder="Plataforma ecom" value={item.plataforma||''} onChange={e=>setItem({...item, plataforma: e.target.value})} />
        <Input placeholder="CRM" value={item.crm||''} onChange={e=>setItem({...item, crm: e.target.value})} />
        <Input placeholder="Email/SMS (coma)" value={(item.email_sms||[]).join(',')} onChange={e=>setItem({...item, email_sms: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />
        <Input placeholder="Soporte" value={item.soporte||''} onChange={e=>setItem({...item, soporte: e.target.value})} />
        <Input placeholder="Analytics" value={item.analytics||''} onChange={e=>setItem({...item, analytics: e.target.value})} />
        <Input placeholder="Subs/Pagos" value={item.subs_payments||''} onChange={e=>setItem({...item, subs_payments: e.target.value})} />
        <Input placeholder="Extras (search,reviews,loyalty)" value={(item.extras||[]).join(',')} onChange={e=>setItem({...item, extras: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />
        <Input placeholder="Herramienta→gasto (tool:€;tool:€)" value={Object.entries(item.gasto_mensual_map||{}).map(([k,v])=>`${k}:${v}`).join(';')} onChange={e=>{
          const obj={}; e.target.value.split(';').map(s=>s.trim()).filter(Boolean).forEach(p=>{const [k,v]=p.split(':'); if(k) obj[k.trim()]=Number(v)||0;}); setItem({...item, gasto_mensual_map: obj});
        }} />
        <Input placeholder="Herramienta→renovación (tool:YYYY-MM-DD)" value={Object.entries(item.renovaciones_map||{}).map(([k,v])=>`${k}:${v}`).join(';')} onChange={e=>{
          const obj={}; e.target.value.split(';').map(s=>s.trim()).filter(Boolean).forEach(p=>{const [k,v]=p.split(':'); if(k) obj[k.trim()]=v;}); setItem({...item, renovaciones_map: obj});
        }} />
        <Input placeholder="Herramienta→contrato (tool:mensual/anual)" value={Object.entries(item.contrato_map||{}).map(([k,v])=>`${k}:${v}`).join(';')} onChange={e=>{
          const obj={}; e.target.value.split(';').map(s=>s.trim()).filter(Boolean).forEach(p=>{const [k,v]=p.split(':'); if(k) obj[k.trim()]=v;}); setItem({...item, contrato_map: obj});
        }} />
        <Input placeholder="Overlapping tools (coma)" value={(item.overlapping_tools||[]).join(',')} onChange={e=>setItem({...item, overlapping_tools: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />
        <Input placeholder="Underused tools (coma)" value={(item.underused_tools||[]).join(',')} onChange={e=>setItem({...item, underused_tools: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} />
        <Input placeholder="Insatisfacción" value={item.dissatisfaction||''} onChange={e=>setItem({...item, dissatisfaction: e.target.value})} />
      </div>
      <MissingDataChips items={status?.missing_fields||[]} />
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving? 'Guardando…':'Guardar módulo'}</Button>
        <a href="/Deals?vertical=saas" className="text-sm underline">Ver deals</a>
        <a href="/Analyzer" className="text-sm underline">Ir al Analyzer</a>
      </div>
    </div>
  );
}