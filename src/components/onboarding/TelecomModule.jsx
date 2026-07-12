import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getMyActiveBrand } from '@/lib/getMyActiveBrand';
import { Button } from '@/components/ui/button';
import OptionTiles from './OptionTiles';
import SmartNumberField from '@/components/inputs/SmartNumberField.jsx';
import ComboBox from '@/components/inputs/ComboBox';

export default function TelecomModule() {
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { brand: b } = await getMyActiveBrand();
      setBrandId(b?.id);
      if (b?.telecom_profile) setItem(b.telecom_profile);
    })();
  }, []);

  const save = async () => {
    if (!brandId) return;
    setSaving(true);
    await base44.entities.Brand.update(brandId, { telecom_profile: { ...item, brand_id: brandId } });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Telecom provider</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <OptionTiles
            label="Internet / connectivity provider"
            value={item.isp || ''}
            onChange={v => setItem({ ...item, isp: v })}
            options={["Orange", "SFR", "Bouygues", "Vodafone", "Free Pro", "OVH", "Other"]}
          />
          <ComboBox
            label="Mobile fleet provider"
            value={item.mobile_provider || ''}
            onChange={v => setItem({ ...item, mobile_provider: v })}
            options={["Orange", "SFR", "Bouygues", "Vodafone", "Free Mobile", "Other"]}
            allowCustom
          />
          <SmartNumberField label="Mobile lines" value={item.mobile_lines || 0} onChange={v => setItem({ ...item, mobile_lines: Number(v) })} min={0} max={500} />
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Telecom costs</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SmartNumberField label="Monthly telecom spend (€)" value={item.monthly_spend || 0} onChange={v => setItem({ ...item, monthly_spend: Number(v) })} min={0} max={50000} prefix="€" scale="log" />
          <SmartNumberField label="Number of locations" value={item.location_count || 0} onChange={v => setItem({ ...item, location_count: Number(v) })} min={0} max={100} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save module'}</Button>
      </div>
    </div>
  );
}