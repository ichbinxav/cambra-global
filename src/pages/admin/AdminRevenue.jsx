import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#8b5cf6", "#f59e0b", "#06b6d4"];
const REVENUE_MODEL_PCT = 0.15; // 15% of savings

export default function AdminRevenue() {
  const [userDeals, setUserDeals] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.UserDeal.list(),
      base44.entities.Brand.list(),
    ]).then(([ud, b]) => { setUserDeals(ud); setBrands(b); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  const activeDeals = userDeals.filter(d => d.status === "active");
  const totalSavings = activeDeals.reduce((s, d) => s + (d.estimated_savings || 0), 0);
  const estRevenue = Math.round(totalSavings * REVENUE_MODEL_PCT);

  // Revenue by provider
  const byProvider = {};
  activeDeals.forEach(d => {
    if (!byProvider[d.provider]) byProvider[d.provider] = { savings: 0, deals: 0 };
    byProvider[d.provider].savings += d.estimated_savings || 0;
    byProvider[d.provider].deals++;
  });
  const providerData = Object.entries(byProvider)
    .map(([name, v]) => ({ name, savings: v.savings, revenue: Math.round(v.savings * REVENUE_MODEL_PCT), deals: v.deals }))
    .sort((a, b) => b.savings - a.savings);

  // Revenue by category
  const byCategory = {};
  activeDeals.forEach(d => {
    if (!byCategory[d.category]) byCategory[d.category] = 0;
    byCategory[d.category] += d.estimated_savings || 0;
  });
  const categoryData = Object.entries(byCategory)
    .map(([name, val]) => ({ name, value: Math.round(val * REVENUE_MODEL_PCT) }));

  // Monthly trend (simulated from created_date)
  const now = new Date();
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const monthDeals = activeDeals.filter(d => {
      const cd = new Date(d.created_date);
      return cd >= start && cd < end;
    });
    const savings = monthDeals.reduce((s, d) => s + (d.estimated_savings || 0), 0);
    monthlyData.push({
      month: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
      savings: Math.round(savings),
      revenue: Math.round(savings * REVENUE_MODEL_PCT),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">Revenue Tracking</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Model: 15% of activated savings · Estimated figures</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Active Contracts", val: activeDeals.length, color: "text-foreground" },
          { label: "Total Savings Activated", val: `€${(totalSavings / 1000).toFixed(1)}K/yr`, color: "text-green-600" },
          { label: "Est. THE NoDE Revenue", val: `€${(estRevenue / 1000).toFixed(1)}K/yr`, color: "text-amber-600" },
          { label: "Avg. per Contract", val: activeDeals.length ? `€${Math.round(estRevenue / activeDeals.length).toLocaleString()}` : "—", color: "text-blue-600" },
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
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Monthly Revenue (est.)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid hsl(var(--border))" }}
                formatter={v => [`€${v}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by category */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Revenue by Category</p>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={false} style={{ fontSize: 10 }}>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => [`€${v}`, "Revenue"]} contentStyle={{ fontSize: 11 }} />
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
                <p className="text-sm font-bold text-green-600 w-28 text-right">€{p.savings.toLocaleString()}/yr saved</p>
                <p className="text-sm font-black text-amber-600 w-24 text-right">€{p.revenue.toLocaleString()}/yr</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">No active contracts yet</div>
        )}
      </div>

      {/* Model explanation */}
      <div className="p-4 rounded-xl border border-border/40 bg-secondary/20">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Revenue Model</p>
        <p className="text-xs text-muted-foreground/70 leading-relaxed">
          THE NoDE revenue is estimated at <strong>15%</strong> of the total annual savings activated by members. This is a model assumption — actual revenue may be based on provider commissions, subscription fees, or a hybrid structure. All figures are <strong>estimated</strong> unless marked as confirmed.
        </p>
      </div>
    </div>
  );
}