import { Button } from "@/components/ui/button";
import { AlertTriangle, Zap, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

function Row({ label, yours, p50, p75, unit }){
  const bad = yours != null && p50 != null && yours > p50;
  return (
    <div className="grid grid-cols-5 gap-3 px-4 py-3 border-b border-border/20 last:border-0 items-center">
      <span className="text-xs text-muted-foreground/60">{label}</span>
      <span className="text-xs font-bold tabular-nums text-center">{yours != null ? `${yours.toFixed( yours>10?1:2)}${unit}` : '—'}</span>
      <span className="text-xs text-muted-foreground/35 tabular-nums text-center">{p50 != null ? `${p50.toFixed( p50>10?1:2)}${unit}` : '—'}</span>
      <span className="text-xs text-muted-foreground/35 tabular-nums text-center">{p75 != null ? `${p75.toFixed( p75>10?1:2)}${unit}` : '—'}</span>
      <span className={`text-xs font-bold text-right tabular-nums ${bad ? 'text-orange-500' : 'text-green-600'}`}>{(yours!=null && p50!=null) ? `${bad?'+':''}${(yours-p50).toFixed( yours>10?1:2)}${unit}` : '—'}</span>
    </div>
  );
}

function Bar({ label, value, weight, rationale }){
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground/60">{value}/100 · w{weight}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-foreground" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {rationale && <p className="text-[10px] text-muted-foreground/50">{rationale}</p>}
    </div>
  );
}

function Insight({ item }){
  const Icon = item.severity === 'critical' ? AlertTriangle : (item.severity === 'warning' ? AlertTriangle : CheckCircle2);
  const color = item.severity === 'critical' ? 'text-red-600' : (item.severity === 'warning' ? 'text-orange-500' : 'text-green-600');
  const bg = item.severity === 'critical' ? 'bg-red-500/[0.06] border-red-500/20' : (item.severity === 'warning' ? 'bg-orange-500/[0.06] border-orange-500/20' : 'bg-green-500/[0.06] border-green-500/20');

  const action = (()=>{
    switch(item.action_key){
      case 'connect_data': return <Link to="/ConnectTools"><Button size="sm" className="h-8 rounded-full text-xs gap-1.5"><Zap className="h-3 w-3"/> Connect data</Button></Link>;
      case 'view_deals_payments': return <Link to="/Deals"><Button size="sm" variant="outline" className="h-8 rounded-full text-xs">View payment deals</Button></Link>;
      case 'view_deals_shipping': return <Link to="/Deals"><Button size="sm" variant="outline" className="h-8 rounded-full text-xs">View shipping deals</Button></Link>;
      case 'complete_onboarding': return <Link to="/Onboarding"><Button size="sm" variant="outline" className="h-8 rounded-full text-xs">Complete onboarding</Button></Link>;
      default: return null;
    }
  })();

  return (
    <div className={`p-4 rounded-xl border ${bg} flex items-start gap-3`}>
      <Icon className={`${color} h-4 w-4 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{item.title}</p>
        <p className="text-[12px] text-muted-foreground/60">{item.message}</p>
        {item.estimated && <p className="text-[10px] text-muted-foreground/40 mt-1">Estimated — connect tools to improve accuracy</p>}
      </div>
      {action}
    </div>
  );
}

export default function IntelligencePanel({ intelligence }){
  const pm = intelligence?.metrics?.payments?.effective_rate;
  const sm = intelligence?.metrics?.shipping?.avg_cost;
  const ss = intelligence?.metrics?.saas?.pct_revenue;
  const breakdown = intelligence?.infra_breakdown || [];
  const insights = intelligence?.insights || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <span className="w-5 h-px bg-border" />
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/45 font-medium">Intelligence</p>
      </div>

      {/* Cohort summary */}
      {intelligence?.cohort && (
        <div className="rounded-2xl border border-border/50 bg-card p-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded-full border">Cohort: {intelligence.cohort.key}</span>
          <span className="px-2 py-0.5 rounded-full border">n={intelligence.cohort.n || 0}</span>
          <span className={`px-2 py-0.5 rounded-full border ${intelligence?.flags?.fallback_used ? 'border-orange-400 text-orange-600' : 'border-green-400 text-green-600'}`}>
            {intelligence?.flags?.fallback_used ? 'Global fallback' : 'Cohort match'}
          </span>
          <span className="ml-auto text-muted-foreground/60">Confidence: {Math.round((intelligence?.flags?.confidence || 0)*100)}%</span>
        </div>
      )}

      {/* Percentiles */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="grid grid-cols-5 gap-3 px-4 py-2.5 bg-secondary/40 border-b border-border/30">
          {['Metric','Yours','p50','p75','Gap'].map((h,i)=>(<span key={i} className={`text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 ${i>0?'text-center':''} ${i===4?'text-right':''}`}>{h}</span>))}
        </div>
        <Row label="Payment fee" yours={pm?.value ?? null} p50={pm?.p50 ?? null} p75={pm?.p75 ?? null} unit="%" />
        <Row label="Cost/shipment" yours={sm?.value ?? null} p50={sm?.p50 ?? null} p75={sm?.p75 ?? null} unit="€" />
        <Row label="SaaS / revenue" yours={ss?.value ?? null} p50={ss?.p50 ?? null} p75={ss?.p75 ?? null} unit="%" />
      </div>

      {/* Breakdown */}
      <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Infra score breakdown</p>
        <div className="grid grid-cols-1 gap-3">
          {breakdown.map((b,i)=> <Bar key={b.key||i} {...b} />)}
        </div>
      </div>

      {/* Insights */}
      {insights.length>0 && (
        <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-2.5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Actionable insights</p>
          {insights.map((it,i)=> <Insight key={i} item={it} />)}
        </div>
      )}
    </div>
  );
}