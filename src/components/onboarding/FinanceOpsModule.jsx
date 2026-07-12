import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { getMyActiveBrand } from '@/lib/getMyActiveBrand';
import { Button } from '@/components/ui/button';
import MultiComboBox from '@/components/inputs/MultiComboBox';
import SmartNumberField from '@/components/inputs/SmartNumberField.jsx';
import ComboBox from '@/components/inputs/ComboBox';

export default function FinanceOpsModule() {
  const [brandId, setBrandId] = useState(null);
  const [item, setItem] = useState({ finance_tools: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { brand: b } = await getMyActiveBrand();
      setBrandId(b?.id);
      if (b?.finance_ops_profile) setItem(b.finance_ops_profile);
    })();
  }, []);

  const save = async () => {
    if (!brandId) return;
    setSaving(true);
    await base44.entities.Brand.update(brandId, { finance_ops_profile: { ...item, brand_id: brandId } });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Finance tooling</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MultiComboBox
            label="Finance / accounting tools"
            values={item.finance_tools || []}
            onChange={vals => setItem({ ...item, finance_tools: vals })}
            options={["Pennylane", "QuickBooks", "Xero", "Pleo", "Spendesk", "Sage", "FreshBooks", "Ramp"]}
            allowCustom
          />
          <ComboBox
            label="Accounting firm"
            value={item.accounting_firm || ''}
            onChange={v => setItem({ ...item, accounting_firm: v })}
            options={["In-house", "External firm", "Freelance accountant", "None"]}
            allowCustom
          />
          <ComboBox
            label="Expense management"
            value={item.expense_tool || ''}
            onChange={v => setItem({ ...item, expense_tool: v })}
            options={["Pleo", "Spendesk", "Ramp", "Expensify", "Moss", "None"]}
            allowCustom
          />
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-2xl border border-border/60 glass">
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">Finance operations costs</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SmartNumberField label="Monthly finance tooling spend (€)" value={item.monthly_spend || 0} onChange={v => setItem({ ...item, monthly_spend: Number(v) })} min={0} max={20000} prefix="€" />
          <SmartNumberField label="Monthly accounting fees (€)" value={item.accounting_fees || 0} onChange={v => setItem({ ...item, accounting_fees: Number(v) })} min={0} max={10000} prefix="€" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save module'}</Button>
      </div>
    </div>
  );
}