import { Link } from "react-router-dom";
import { ArrowRight, Zap, Clock, CheckCircle2, Users } from "lucide-react";
import { getDealById, formatSavings } from "@/lib/deals.js";

export default function DealsOverview({ userDeals }) {
  const active = userDeals.filter(d => d.status === "active");
  const waitlist = userDeals.filter(d => d.status === "waitlist" || d.status === "pending");

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
      <div className="grid grid-cols-3 divide-x divide-border/30 border-b border-border/30">
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Active deals</p>
          <p className="text-xl font-black">{active.length}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Savings unlocked</p>
          <p className="text-xl font-black text-green-600">{formatSavings(totalSavings)}/yr</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">On waitlist</p>
          <p className="text-xl font-black">{waitlist.length}</p>
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
                {formatSavings(d.estimated_savings)}/yr
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

      {/* Empty / CTA */}
      {active.length === 0 && waitlist.length === 0 && (
        <div className="px-6 py-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">No active deals yet.</p>
          <Link to="/Deals">
            <button className="h-9 px-5 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 mx-auto">
              <Zap size={11} /> Activate savings
            </button>
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <div className="px-6 py-4 border-t border-border/30 flex gap-2">
          <Link to="/Deals">
            <button className="h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
              <Zap size={10} /> Activate more savings
            </button>
          </Link>
          {waitlist.length > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
              <Users size={10} /> {waitlist.length} on waitlist
            </span>
          )}
        </div>
      )}
    </div>
  );
}