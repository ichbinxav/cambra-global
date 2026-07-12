import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getMyActiveBrand } from '@/lib/getMyActiveBrand';
import { Button } from '@/components/ui/button';
import MultiComboBox from '@/components/inputs/MultiComboBox';
import SmartNumberField from '@/components/inputs/SmartNumberField.jsx';
import ComboBox from '@/components/inputs/ComboBox';

export default function HRInfraModule() {
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({ hr_tools: [], benefits_tools: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { brand: b } = await getMyActiveBrand();
      setBrandId(b?.id);
      if (b?.hr_profile) setItem(b.hr_profile);
    })();
  }, []);

  const save = async () => {
    if (!brandId) return;
    setSaving(true);
    await base44.entities.Brand.update(brandId, { hr_profile: { ...item, brand_id: brandId } });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">HR & payroll systems</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MultiComboBox
            label="HR / payroll tools"
            values={item.hr_tools || []}
            onChange={vals => setItem({ ...item, hr_tools: vals })}
            options={["PayFit", "Deel", "Lucca", "BambooHR", "Workday", "Personio", "HiBob"]}
            allowCustom
          />
          <MultiComboBox
            label="Benefits platforms"
            values={item.benefits_tools || []}
            onChange={vals => setItem({ ...item, benefits_tools: vals })}
            options={["Swile", "Alan", "Gymlib", "Leeto", "Benefiz"]}
            allowCustom
          />
          <ComboBox
            label="Employee health insurance"
            value={item.health_insurer || ''}
            onChange={v => setItem({ ...item, health_insurer: v })}
            options={["Alan", "Malakoff Humanis", "AG2R La Mondiale", "Apicil", "Harmonie Mutuelle", "None"]}
            allowCustom
          />
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">HR infrastructure costs</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SmartNumberField label="Headcount" value={item.headcount || 0} onChange={v => setItem({ ...item, headcount: Number(v) })} min={0} max={5000} />
          <SmartNumberField label="Monthly HR tooling spend (€)" value={item.monthly_spend || 0} onChange={v => setItem({ ...item, monthly_spend: Number(v) })} min={0} max={50000} prefix="€" />
          <SmartNumberField label="Monthly benefits cost (€)" value={item.monthly_benefits || 0} onChange={v => setItem({ ...item, monthly_benefits: Number(v) })} min={0} max={100000} prefix="€" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save module'}</Button>
      </div>
    </div>
  );
}