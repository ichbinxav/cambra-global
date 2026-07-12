import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getMyActiveBrand } from '@/lib/getMyActiveBrand';
import { Button } from '@/components/ui/button';
import OptionTiles from './OptionTiles';
import SmartNumberField from '@/components/inputs/SmartNumberField.jsx';
import ComboBox from '@/components/inputs/ComboBox';
import MultiComboBox from '@/components/inputs/MultiComboBox';

export default function InsuranceModule() {
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({ coverage_types: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { brand: b } = await getMyActiveBrand();
      setBrandId(b?.id);
      if (b?.insurance_profile) setItem(b.insurance_profile);
    })();
  }, []);

  const save = async () => {
    if (!brandId) return;
    setSaving(true);
    await base44.entities.Brand.update(brandId, { insurance_profile: { ...item, brand_id: brandId } });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Insurance management</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <OptionTiles
            label="How is insurance managed?"
            value={item.management_type || ''}
            onChange={v => setItem({ ...item, management_type: v })}
            options={["Single provider", "Multiple providers", "Through broker", "Not sure"]}
          />
          <ComboBox
            label="Primary insurer"
            value={item.primary_insurer || ''}
            onChange={v => setItem({ ...item, primary_insurer: v })}
            options={["Alan", "AXA", "Generali", "Allianz", "Hiscox", "Zurich", "MMA"]}
            allowCustom
          />
          <MultiComboBox
            label="Coverage types"
            values={item.coverage_types || []}
            onChange={vals => setItem({ ...item, coverage_types: vals })}
            options={["Business liability", "Cyber insurance", "Logistics insurance", "Employee insurance", "Property", "Professional indemnity"]}
          />
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Insurance costs</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SmartNumberField label="Annual premium (€)" value={item.annual_premium || 0} onChange={v => setItem({ ...item, annual_premium: Number(v) })} min={0} max={500000} prefix="€" scale="log" />
          <SmartNumberField label="Number of policies" value={item.policy_count || 0} onChange={v => setItem({ ...item, policy_count: Number(v) })} min={0} max={20} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save module'}</Button>
      </div>
    </div>
  );
}