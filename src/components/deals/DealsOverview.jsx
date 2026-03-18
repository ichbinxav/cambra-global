import { Link } from "react-router-dom";
import { ArrowRight, Zap, Clock, CheckCircle2, Users } from "lucide-react";
import { getDealById, formatSavings } from "@/lib/deals.js";

export default function DealsOverview({ userDeals }) {
  const active = userDeals.filter(d => d.status === "active");
  const pending = userDeals.filter(d => d.status === "pending");
  const waitlist = userDeals.filter(d => d.status === "waitlist");
  const expired = userDeals.filter(d => d.status === "expired");
  const allInactive = pending.length + waitlist.length + expired.length;

  const totalSavings = active.reduce((sum, d) => sum + (d.estimated_savings || 0), 0);

  // Expiring within 60 days
  const expiringSoon = active.filter(d => {
    if (!d.end_date) return false;
    const days = (new Date(d.end_date) - new Date()) / (1000 * 60 * 60 * 24);
    return days > 0 && days <= 60;
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border/30 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Deals & contracts</p>
        <Link to="/Deals">
          <button className="text-[11px] font-semibold text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1">
            All deals <ArrowRight size={10} />
          </button>
        </Link>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 divide-x divide-border/30 border-b border-border/30">
        <div className="px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Active</p>
          <p className="text-lg font-black text-green-600">{active.length}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Savings</p>
          <p className="text-lg font-black">{formatSavings(totalSavings)}/yr</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Pending</p>
          <p className="text-lg font-black text-blue-600">{pending.length}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Waitlist</p>
          <p className="text-lg font-black text-orange-600">{waitlist.length}</p>
        </div>
      </div>

      {/* Active deals list */}
      {active.length > 0 && (
        <div className="divide-y divide-border/20">
          {active.slice(0, 3).map(d => (
            <div key={d.id} className="px-6 py-3.5 flex items-center gap-3">
              <CheckCircle2 size={13} className="text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{d.deal_name}</p>
                <p className="text-[10px] text-muted-foreground/40">{d.provider}</p>
              </div>
              <p className="text-xs font-black text-green-600 tabular-nums shrink-0">
                +{formatSavings(d.estimated_savings)}/yr
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Expiring alert */}
      {expiringSoon.length > 0 && (
        <div className="mx-4 mb-4 mt-2 flex items-center gap-2.5 p-3 rounded-xl bg-orange-500/[0.06] border border-orange-500/20">
          <Clock size={12} className="text-orange-500 shrink-0" />
          <p className="text-xs text-orange-600 font-medium">
            {expiringSoon.length} deal{expiringSoon.length > 1 ? "s" : ""} expiring in the next 60 days
          </p>
        </div>
      )}

      {/* Status pipeline */}
      {allInactive > 0 && (
        <div className="px-6 py-4 space-y-2 border-t border-border/30">
          {pending.length > 0 && (
            <p className="text-[11px] text-blue-600"><span className="font-semibold">{pending.length}</span> pending approval</p>
          )}
          {waitlist.length > 0 && (
            <p className="text-[11px] text-orange-600"><span className="font-semibold">{waitlist.length}</span> on waitlist</p>
          )}
          {expired.length > 0 && (
            <p className="text-[11px] text-red-600"><span className="font-semibold">{expired.length}</span> expired</p>
          )}
        </div>
      )}

      {/* Empty / CTA */}
      {active.length === 0 && allInactive === 0 && (
        <div className="px-6 py-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">No deals yet.</p>
          <Link to="/Deals">
            <button className="h-9 px-5 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 mx-auto">
              <Zap size={11} /> Discover savings
            </button>
          </Link>
        </div>
      )}

      {(active.length > 0 || allInactive > 0) && (
        <div className="px-6 py-4 border-t border-border/30">
          <Link to="/Deals">
            <button className="h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 w-full justify-center">
              <Zap size={10} /> Manage deals
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}