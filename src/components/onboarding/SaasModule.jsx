import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import MissingDataChips from './MissingDataChips';
import TagChipsInput from './TagChipsInput';
import KeyValueListInput from './KeyValueListInput';
import MultiComboBox from '@/components/inputs/MultiComboBox';

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
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input placeholder="E‑commerce platform" value={item.plataforma||''} onChange={e=>setItem({...item, plataforma: e.target.value})} />
        <Input placeholder="CRM" value={item.crm||''} onChange={e=>setItem({...item, crm: e.target.value})} />
        <TagChipsInput label="Email / SMS tools" values={item.email_sms||[]} onChange={(vals)=>setItem({...item, email_sms: vals})} placeholder="Add tool" suggestions={["Klaviyo","Mailchimp","Attentive"]} />
        <Input placeholder="Support" value={item.soporte||''} onChange={e=>setItem({...item, soporte: e.target.value})} />
        <Input placeholder="Analytics" value={item.analytics||''} onChange={e=>setItem({...item, analytics: e.target.value})} />
        <Input placeholder="Subscriptions / Payments" value={item.subs_payments||''} onChange={e=>setItem({...item, subs_payments: e.target.value})} />
        <MultiComboBox label="Extras (search, reviews, loyalty)" values={item.extras||[]} onChange={(vals)=>setItem({...item, extras: vals})} options={["Algolia","Searchanise","Yotpo","Reviews.io","Judge.me","Stamped","LoyaltyLion","Smile.io"]} />
        <KeyValueListInput label="Monthly spend by tool" entries={item.gasto_mensual_map||{}} onChange={(obj)=>setItem({...item, gasto_mensual_map: obj})} keyPlaceholder="Tool" valuePlaceholder="€ per month" />
        <KeyValueListInput label="Renewals" entries={item.renovaciones_map||{}} onChange={(obj)=>setItem({...item, renovaciones_map: obj})} keyPlaceholder="Tool" valuePlaceholder="YYYY-MM-DD" />
        <KeyValueListInput label="Contract type" entries={item.contrato_map||{}} onChange={(obj)=>setItem({...item, contrato_map: obj})} keyPlaceholder="Tool" valuePlaceholder="monthly/annual" />
        <TagChipsInput label="Overlapping tools" values={item.overlapping_tools||[]} onChange={(vals)=>setItem({...item, overlapping_tools: vals})} placeholder="Add tool" />
        <TagChipsInput label="Underused tools" values={item.underused_tools||[]} onChange={(vals)=>setItem({...item, underused_tools: vals})} placeholder="Add tool" />
        <Input placeholder="Dissatisfaction (notes)" value={item.dissatisfaction||item.insatisfaccion||''} onChange={e=>setItem({...item, dissatisfaction: e.target.value})} />
      </div>
      <MissingDataChips items={status?.missing_fields||[]} />
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving? 'Saving…':'Save module'}</Button>
        <a href="/Deals?vertical=saas" className="text-sm underline">View deals</a>
        <a href="/Analyzer" className="text-sm underline">Go to Analyzer</a>
      </div>
    </div>
  );
}