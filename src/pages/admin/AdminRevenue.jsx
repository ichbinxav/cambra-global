import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import MonthlyReportsTable from "@/components/admin/MonthlyReportsTable";

const COLORS = ["var(--voltio)", "#2FE0A8", "#f97316", "#8b5cf6", "#F5A623", "#06b6d4"];
const REALIZED_STATUSES = ["invoiced", "paid"];

export default function AdminRevenue() {
  const [activations, setActivations] = useState([]);
  const [reports, setReports] = useState([]);
  const [providers, setProviders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.DealActivation.list(),
      base44.entities.Brand.list(),
      base44.entities.MonthlySavingsReport.list("-month", 500),
      base44.entities.Provider.list(),
      base44.entities.Invoice.list("-issued_at", 500),
    ]).then(([acts, _b, msr, prov, invs]) => { setActivations(acts); setReports(msr); setProviders(prov); setInvoices(invs); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  const activeActivations = activations.filter(a => ["activated","migrating","live","monetizing"].includes(a.status));
  const realizedFees = (invoices || []).filter(i => ['issued','sent','due','overdue','paid'].includes(i.status)).reduce((s, i) => s + (i.total_amount || 0), 0);
  const realizedSavings = reports.filter(r => REALIZED_STATUSES.includes(r.status)).reduce((s, r) => s + (r.savings || 0), 0);
  const contractsWithRealized = Array.from(new Set((invoices || []).filter(i => ['issued','sent','due','overdue','paid'].includes(i.status)).map(i => i.deal_activation_id))).length;

  // Monetized by provider (revenue from Invoices, savings from Reports)
  const byProvider = {};
  (reports || []).forEach(r => {
    const key = r.provider_id || 'unknown';
    if (!byProvider[key]) byProvider[key] = { savings: 0, revenue: 0, count: 0 };
    byProvider[key].savings += r.savings || 0;
    byProvider[key].count++;
  });
  (invoices || []).forEach(i => {
    if (['void','failed','refunded'].includes(i.status)) return;
    const key = i.provider_id || 'unknown';
    if (!byProvider[key]) byProvider[key] = { savings: 0, revenue: 0, count: 0 };
    byProvider[key].revenue += i.total_amount || 0;
  });
  const providerData = Object.entries(byProvider)
    .map(([providerId, v]) => ({ name: (providers.find(p => p.id === providerId)?.name) || providerId, savings: Math.round(v.savings), revenue: Math.round(v.revenue), deals: v.count }))
    .sort((a, b) => b.revenue - a.revenue);

  // Helper: months (last 6) monetized (paid invoices by paid_at month)
  const now = new Date();
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const paidSum = (invoices || []).filter(inv => inv.status === 'paid' && inv.paid_at && new Date(inv.paid_at).getMonth() === d.getMonth() && new Date(inv.paid_at).getFullYear() === d.getFullYear())
      .reduce((s, inv) => s + (inv.total_amount || 0), 0);
    monthlyData.push({
      month: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      monetized: Math.round(paidSum),
    });
  }

  // Monthly trend from realized reports computed above (monthlyData)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">Revenue Tracking</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Admin truth: Monetized based on invoices (issued/sent/due/overdue/paid) and Realized from paid invoices</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Live activations", val: activeActivations.length, color: "text-foreground" },
          { label: "Cumulative realized savings", val: `€${Math.round(realizedSavings).toLocaleString()}`, color: "text-green-600" },
          { label: "Cumulative monetized", val: `€${Math.round(realizedFees).toLocaleString()}`, color: "text-amber-600" },
          { label: "Contracts with realized activity", val: contractsWithRealized, color: "text-blue-600" },
        ].map((kpi, i) => (
          <div key={i} className="p-4 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">{kpi.label}</p>
            <p className={`text-2xl font-black tabular-nums ${kpi.color}`}>{kpi.val}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly revenue trend */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Monthly Monetized (realized)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid hsl(var(--border))" }}
                formatter={v => [`€${v}`, "Monetized"]} />
              <Bar dataKey="monetized" fill="#F5A623" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by category */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Monetized by Provider</p>
          {providerData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={providerData} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false} style={{ fontSize: 10 }}>
                  {providerData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => [`€${v}`, "Monetized"]} contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No data yet</div>
          )}
        </div>
      </div>

      {/* Revenue per provider */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 bg-secondary/30">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Revenue per Provider</p>
        </div>
        {providerData.length > 0 ? (
          <div className="divide-y divide-border/20">
            {providerData.map((p, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-background" style={{ background: COLORS[i % COLORS.length] }}>
                  {i + 1}
                </div>
                <p className="text-sm font-semibold flex-1">{p.name}</p>
                <p className="text-xs text-muted-foreground/50">{p.deals} deal{p.deals !== 1 ? "s" : ""}</p>
                <p className="text-sm font-bold text-green-600 w-28 text-right">€{p.savings.toLocaleString()} realized</p>
                <p className="text-sm font-black text-amber-600 w-24 text-right">€{p.revenue.toLocaleString()} monetized</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">No active contracts yet</div>
        )}
      </div>

      {/* Monthly Reports — verify / void / regenerate */}
      <MonthlyReportsTable />

      {/* Notes */}
      <div className="p-4 rounded-xl border border-border/40 bg-secondary/20">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Data integrity</p>
        <p className="text-xs text-muted-foreground/70 leading-relaxed">
          Monetized figures reflect invoiced/paid node fees from Monthly Savings Reports. Pipeline figures based on activated deals are labelled as estimated.
        </p>
      </div>
    </div>
  );
}