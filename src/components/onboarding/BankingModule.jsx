import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import OptionTiles from './OptionTiles';
import SmartNumberField from '@/components/inputs/SmartNumberField.jsx';
import ComboBox from '@/components/inputs/ComboBox';
import MultiComboBox from '@/components/inputs/MultiComboBox';

export default function BankingModule() {
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({ currencies: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me();
      const [b] = await base44.entities.Brand.filter({ created_by_id: me.id }, '-created_date', 1);
      setBrandId(b?.id);
    })();
  }, []);

  const save = async () => {
    if (!brandId) return;
    setSaving(true);
    const body = { ...item, brand_id: brandId };
    // Store in Brand entity as banking_profile nested object for now
    await base44.entities.Brand.update(brandId, { banking_profile: body });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Primary bank</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <OptionTiles
            label="Business bank"
            value={item.primary_bank || ''}
            onChange={v => setItem({ ...item, primary_bank: v })}
            options={["Qonto", "Revolut Business", "BNP Paribas", "Wise", "Mercury", "Société Générale", "Crédit Agricole"]}
          />
          <ComboBox
            label="Search/add bank"
            value={item.primary_bank || ''}
            onChange={v => setItem({ ...item, primary_bank: v })}
            options={["Qonto", "Revolut Business", "BNP Paribas", "Wise", "Mercury"]}
            allowCustom
          />
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">International operations</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <OptionTiles
            label="International operations"
            value={item.international_scope || ''}
            onChange={v => setItem({ ...item, international_scope: v })}
            options={["No", "Europe only", "Global"]}
          />
          <OptionTiles
            label="Currency management"
            value={item.fx_frequency || ''}
            onChange={v => setItem({ ...item, fx_frequency: v })}
            options={["Rarely", "Sometimes", "Frequently"]}
          />
          <MultiComboBox
            label="Operating currencies"
            values={item.currencies || []}
            onChange={vals => setItem({ ...item, currencies: vals })}
            options={["EUR", "USD", "GBP", "AUD", "CAD", "CHF", "SEK", "NOK"]}
            allowCustom
          />
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Banking costs</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SmartNumberField label="Monthly banking fees (€)" value={item.monthly_banking_fees || 0} onChange={v => setItem({ ...item, monthly_banking_fees: Number(v) })} min={0} max={5000} prefix="€" />
          <SmartNumberField label="Monthly FX volume (€)" value={item.monthly_fx_volume || 0} onChange={v => setItem({ ...item, monthly_fx_volume: Number(v) })} min={0} max={1000000} prefix="€" scale="log" />
          <SmartNumberField label="FX spread %" value={item.fx_spread_pct || 0} onChange={v => setItem({ ...item, fx_spread_pct: Number(v) })} min={0} max={5} decimals={2} suffix="%" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save module'}</Button>
      </div>
    </div>
  );
}