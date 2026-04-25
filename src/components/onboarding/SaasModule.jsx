import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import MissingDataChips from './MissingDataChips';
import TagChipsInput from './TagChipsInput';
import KeyValueListInput from './KeyValueListInput';
import MultiComboBox from '@/components/inputs/MultiComboBox';
import ComboBox from '@/components/inputs/ComboBox';
import OptionTiles from '@/components/onboarding/OptionTiles';





export default function SaasModule(){
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({ email_sms: [], extras: [], gasto_mensual_map: {}, contrato_map: {}, renovaciones_map: {} });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/60 glass">
          <p className="text-xs text-muted-foreground">We only ask for the basics. You can expand anytime.</p>
          <Button variant="outline" onClick={()=>setShowAdvanced(v=>!v)} className="h-8 text-xs">
            {showAdvanced ? 'Hide advanced' : 'Enrich your information'}
          </Button>
        </div>
        {/* Core stack */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Core stack</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-3">
              <OptionTiles label="E‑commerce platform" value={item.plataforma||''} onChange={(v)=>setItem({...item, plataforma: v})} options={["Shopify","Shopify Plus","BigCommerce","Magento","WooCommerce","Custom"]} />
              <ComboBox label="Search/add platform" value={item.plataforma||''} onChange={(v)=>setItem({...item, plataforma: v})} options={["Shopify","Shopify Plus","BigCommerce","Magento","WooCommerce","Custom"]} />
            </div>
            {showAdvanced && (
              <ComboBox label="CRM" value={item.crm||''} onChange={(v)=>setItem({...item, crm: v})} options={["HubSpot","Salesforce","Pipedrive","Zoho","None"]} />
            )}
            {showAdvanced && (
              <ComboBox label="Analytics" value={item.analytics||''} onChange={(v)=>setItem({...item, analytics: v})} options={["GA4","Mixpanel","Amplitude","Looker","None"]} />
            )}
          </div>
        </div>

        {/* Messaging and extras */}
        <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Messaging and extras</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MultiComboBox label="Email / SMS tools" values={item.email_sms||[]} onChange={(vals)=>setItem({...item, email_sms: vals})} options={["Klaviyo","Mailchimp","Attentive","Postscript","Omnisend","SmsBump"]} />
            {showAdvanced && (
              <MultiComboBox label="Extras (search, reviews, loyalty)" values={item.extras||[]} onChange={(vals)=>setItem({...item, extras: vals})} options={["Algolia","Searchanise","Yotpo","Reviews.io","Judge.me","Stamped","LoyaltyLion","Smile.io"]} />
            )}
          </div>
        </div>

        {/* Spend and renewals */}
        <div className={`p-4 sm:p-5 rounded-2xl border border-border/60 glass ${showAdvanced ? '' : 'hidden'}`}>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Spend and renewals</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KeyValueListInput label="Monthly spend by tool" entries={item.gasto_mensual_map||{}} onChange={(obj)=>setItem({...item, gasto_mensual_map: obj})} keyPlaceholder="Tool" valuePlaceholder="€ per month" />
            <KeyValueListInput label="Renewals" entries={item.renovaciones_map||{}} onChange={(obj)=>setItem({...item, renovaciones_map: obj})} keyPlaceholder="Tool" valuePlaceholder="YYYY-MM-DD" />
            <KeyValueListInput label="Contract type" entries={item.contrato_map||{}} onChange={(obj)=>setItem({...item, contrato_map: obj})} keyPlaceholder="Tool" valuePlaceholder="monthly/annual" />
          </div>
        </div>

        {/* Overlap and notes */}
        <div className={`p-4 sm:p-5 rounded-2xl border border-border/60 glass ${showAdvanced ? '' : 'hidden'}`}>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Overlap and notes</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TagChipsInput label="Overlapping tools" values={item.overlapping_tools||[]} onChange={(vals)=>setItem({...item, overlapping_tools: vals})} placeholder="Add tool" />
            <TagChipsInput label="Underused tools" values={item.underused_tools||[]} onChange={(vals)=>setItem({...item, underused_tools: vals})} placeholder="Add tool" />
            <Input placeholder="Dissatisfaction (notes)" value={item.dissatisfaction||item.insatisfaccion||''} onChange={e=>setItem({...item, dissatisfaction: e.target.value})} />
          </div>
        </div>
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