import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';

export default function AdminControl() {
  const [deals, setDeals] = useState([]);
  const [brands, setBrands] = useState([]);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    (async () => {
      const d = await base44.entities.DealActivation.list();
      setDeals(d);
      const b = await base44.entities.Brand.list();
      setBrands(b);
      const r = await base44.entities.MonthlySavingsReport.list();
      setReports(r);
    })();
  }, []);

  const totals = useMemo(() => {
    const active = deals.filter(d => ['authorized','migrating','live','monetizing'].includes(d.status));
    const projected = active.reduce((s,d)=>s+(d.projected_savings_annual||0),0);
    const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth()-1);
    const ym = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,'0')}`;
    const monthReports = reports.filter(r => r.month === ym);
    const realSavings = monthReports.reduce((s,r)=>s+(r.savings||0),0);
    const nodeMRR = monthReports.reduce((s,r)=>s+(r.node_fee||0),0);
    return { projected, realSavings, nodeMRR, activeDeals: active.length };
  }, [deals, reports]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-black">Admin Control</h1>
      <div className="grid sm:grid-cols-4 gap-3">
        {[{label:'Projected savings', val: `€${totals.projected.toLocaleString()}`}, {label:'Real savings (last month)', val:`€${totals.realSavings.toLocaleString()}`}, {label:'THE NoDE MRR', val:`€${totals.nodeMRR.toLocaleString()}`}, {label:'Active deals', val: totals.activeDeals}].map((c,i)=>(
          <div key={i} className="rounded-xl border p-4 bg-card">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">{c.label}</p>
            <p className="text-xl font-black">{c.val}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4 bg-card">
        <p className="text-sm font-semibold mb-2">Deal pipeline</p>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground/60">
                <th>Company</th><th>Vertical</th><th>Status</th><th>Projected/yr</th>
              </tr>
            </thead>
            <tbody>
              {deals.map(d => (
                <tr key={d.id} className="border-t">
                  <td className="py-2">{brands.find(b=>b.id===d.brand_id)?.name || d.brand_id}</td>
                  <td className="py-2 capitalize">{d.vertical}</td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2">€{(d.projected_savings_annual||0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}