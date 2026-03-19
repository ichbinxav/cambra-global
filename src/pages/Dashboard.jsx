import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Zap, Activity, BarChart2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import HeroSavings from "@/components/dashboard/HeroSavings";
import InfraScore from "@/components/dashboard/InfraScore";
import SavingsTrend from "@/components/dashboard/SavingsTrend";
import DealsOverview from "@/components/deals/DealsOverview.jsx";
import DataQualityBanner from "@/components/shared/DataQualityBanner";

export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [user, setUser] = useState(null);
  const [userDeals, setUserDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    const [r, u] = await Promise.all([
      base44.entities.AnalyzerResult.list("-created_date", 10),
      base44.auth.me(),
    ]);
    setResults(r);
    setUser(u);
    const uds = await base44.entities.UserDeal.filter({ user_email: u.email });
    setUserDeals(uds);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const subs = [];
    try {
      const u1 = base44.entities.UserDeal.subscribe(() => loadData());
      const u2 = base44.entities.AnalyzerResult.subscribe(() => loadData());
      if (u1) subs.push(u1);
      if (u2) subs.push(u2);
    } catch {}
    return () => subs.forEach(u => u?.());
  }, []);

  const latest = results[0];
  const chartData = results.slice().reverse().map((r, i) => ({ i, value: r.total_savings || 0 }));
  const score = latest?.infra_score || 0;

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );

  if (!latest) return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border border-orange-500/20 bg-orange-500/[0.04]">
        <AlertTriangle size={16} className="text-orange-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold">No analysis yet</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Connect your tools or run the Analyzer to see your real metrics.</p>
        </div>
        <Link to="/Analyzer">
          <button className="h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold">Get started</button>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Run the Analyzer", desc: "2 min · identify your potential", to: "/Analyzer", icon: BarChart2 },
          { label: "Browse deals", desc: "Unlock savings across your stack", to: "/Deals", icon: Zap },
          { label: "Connect your tools", desc: "Stripe, Shopify & more", to: "/ConnectTools", icon: Activity },
        ].map((a, i) => (
          <Link key={i} to={a.to}>
            <div className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-all">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <a.icon size={14} className="text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-xs font-bold">{a.label}</p>
                <p className="text-[10px] text-muted-foreground/50">{a.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-8">
      <DataQualityBanner result={latest} />
      <HeroSavings latest={latest} score={score} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfraScore score={score} resultId={latest.id} />
        {chartData.length > 1 ? (
          <SavingsTrend chartData={chartData} />
        ) : (
          <DealsOverview userDeals={userDeals} />
        )}
      </div>
      {chartData.length > 1 && <DealsOverview userDeals={userDeals} />}
    </div>
  );
}