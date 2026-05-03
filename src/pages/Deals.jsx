import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, ArrowRight, Clock, Users, Zap, ChevronRight, AlertTriangle
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { DEALS, CATEGORIES, REGIONS, PHASE_CONFIG, STATUS_CONFIG, formatSavings } from "@/lib/deals.js";
import DealModal from "@/components/deals/DealModal.jsx";

export default function Deals() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeRegion, setActiveRegion] = useState("all");
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [userDeals, setUserDeals] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("discover");

  useEffect(() => {
    const loadData = async () => {
      const [u, uds] = await Promise.all([
        base44.auth.me(),
        base44.entities.UserDeal.list(),
      ]);
      setUser(u);
      setUserDeals(uds);
      setLoading(false);
    };

    loadData();

    // Subscribe to real-time changes
    const subs = [];
    try {
      const unsub = base44.entities.UserDeal.subscribe(() => loadData());
      if (unsub) subs.push(unsub);
    } catch (err) {
      console.warn('Subscription error:', err);
    }

    return () => {
      subs.forEach(unsub => unsub?.());
    };
  }, []);

  const handleUserDealChange = (updated) => {
    // Immediately update local state
    setUserDeals(prev => {
      const exists = prev.find(ud => ud.id === updated.id);
      if (exists) return prev.map(ud => ud.id === updated.id ? updated : ud);
      return [...prev, updated];
    });
    // Reload from DB after 100ms
    setTimeout(() => {
      base44.entities.UserDeal.list().then(uds => setUserDeals(uds));
    }, 100);
  };

  const getUserDeal = (dealId) => userDeals.find(ud => ud.deal_id === dealId);

  const filtered = DEALS.filter(d => {
    const catMatch = activeCategory === "all" || d.category === activeCategory;
    const regMatch = activeRegion === "all" || d.region.includes(activeRegion);
    return catMatch && regMatch;
  });

  const activeDeals = userDeals.filter(d => d.status === "active");
  const waitlistDeals = userDeals.filter(d => d.status === "waitlist" || d.status === "pending");
  const totalActiveSavings = activeDeals.reduce((sum, d) => sum + (d.estimated_savings || 0), 0);

  const expiringSoon = activeDeals.filter(d => {
    if (!d.end_date) return false;
    const days = (new Date(d.end_date) - new Date()) / (1000 * 60 * 60 * 24);
    return days > 0 && days <= 60;
  });

  if (loading) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>

      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Member exclusive</p>
        <h1 className="text-3xl font-black tracking-[-0.03em]">Network Deals</h1>
        <p className="text-muted-foreground text-sm mt-1.5">Pre-negotiated infrastructure discounts across payments, shipping, SaaS, insurance and retail TPE. Available only to THE NoDE members.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-secondary/60 w-fit mb-6">
        {[{ id: "discover", label: "Discover" }, { id: "contracts", label: `My Contracts${activeDeals.length > 0 ? ` (${activeDeals.length})` : ""}` }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 h-8 rounded-lg text-xs font-semibold transition-all ${tab === t.id ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONTRACTS TAB ── */}
      {tab === "contracts" && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            {[
              { label: "Active deals", value: activeDeals.length.toString(), color: "text-foreground" },
              { label: "Savings unlocked", value: `${formatSavings(totalActiveSavings)}/yr`, color: "text-green-600" },
              { label: "On waitlist", value: waitlistDeals.length.toString(), color: "text-blue-600" },
              { label: "Expiring soon", value: expiringSoon.length.toString(), color: expiringSoon.length > 0 ? "text-orange-500" : "text-foreground" },
            ].map((s, i) => (
              <div key={i} className="p-4 rounded-xl border border-border/50 bg-card/60">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">{s.label}</p>
                <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Expiring alert */}
          {expiringSoon.length > 0 && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-orange-500/25 bg-orange-500/[0.05]">
              <AlertTriangle size={14} className="text-orange-500 shrink-0" />
              <p className="text-sm text-orange-600 font-medium">
                {expiringSoon.length} deal{expiringSoon.length > 1 ? "s" : ""} expiring in the next 60 days — renew to keep your rates.
              </p>
            </div>
          )}

          {/* Active contracts */}
          {activeDeals.length > 0 ? (
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
              <div className="px-6 py-3.5 border-b border-border/30 grid grid-cols-[1fr_auto_auto_auto] gap-4 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">
                <span>Deal</span>
                <span className="hidden sm:block">Status</span>
                <span className="hidden sm:block">Expires</span>
                <span>Savings/yr</span>
              </div>
              {[...activeDeals, ...waitlistDeals].map(ud => {
                const deal = DEALS.find(d => d.id === ud.deal_id);
                const sc = STATUS_CONFIG[ud.status] || STATUS_CONFIG.pending;
                const isExpiring = ud.end_date && (new Date(ud.end_date) - new Date()) / (1000 * 60 * 60 * 24) <= 60;
                return (
                  <div key={ud.id} className="px-6 py-4 border-b border-border/20 last:border-0 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center">
                    <div>
                      <p className="text-sm font-semibold">{ud.deal_name}</p>
                      <p className="text-[10px] text-muted-foreground/40">{ud.provider} · {ud.category}</p>
                    </div>
                    <div className="hidden sm:block">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${sc.bg}`}>
                        <span className={sc.color}>{sc.label}</span>
                      </span>
                    </div>
                    <div className="hidden sm:block text-right">
                      {ud.end_date ? (
                        <p className={`text-xs ${isExpiring ? "text-orange-500 font-semibold" : "text-muted-foreground/50"}`}>
                          {isExpiring && "⚠ "}
                          {new Date(ud.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground/30">—</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black tabular-nums ${ud.status === "active" ? "text-green-600" : "text-blue-600"}`}>
                        {ud.status === "active" ? `${formatSavings(ud.estimated_savings)}/yr` : "Pending"}
                      </p>
                      <p className="text-[10px] text-muted-foreground/30">Estimated</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-border/40 rounded-2xl bg-secondary/10">
              <p className="text-muted-foreground text-sm mb-4">No active contracts yet.</p>
              <button onClick={() => setTab("discover")} className="h-9 px-5 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 mx-auto">
                <Zap size={11} /> Discover deals
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── DISCOVER TAB ── */}
      {tab === "discover" && (
        <div>
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Live deals", value: DEALS.filter(d => d.phase === "live").length.toString() },
              { label: "Available savings", value: `€${(DEALS.filter(d => d.phase === "live").reduce((s, d) => s + d.estimated_savings, 0) / 1000).toFixed(0)}K+/yr` },
              { label: "Your active", value: activeDeals.length.toString() },
            ].map((stat, i) => (
              <div key={i} className="p-4 rounded-xl border border-border/50 bg-card/60">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">{stat.label}</p>
                <p className="text-xl font-black tabular-nums tracking-tight">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Member badge */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-secondary/20 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 animate-pulse-slow" />
            <p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">THE NoDE member</span> — you have access to all live deals below. Click any card to activate.</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                className={`px-4 h-8 rounded-full text-xs font-medium transition-all ${activeCategory === cat.id ? "bg-foreground text-background" : "bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-7">
            {REGIONS.map(r => (
              <button key={r.id} onClick={() => setActiveRegion(r.id)}
                className={`px-3 h-7 rounded-full text-[11px] font-medium transition-all ${activeRegion === r.id ? "bg-foreground/10 text-foreground border border-foreground/20" : "text-muted-foreground/50 border border-border/40 hover:text-foreground hover:border-foreground/20"}`}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Deal cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((deal, i) => {
                const phase = PHASE_CONFIG[deal.phase];
                const ud = getUserDeal(deal.id);
                const isActive = ud?.status === "active";
                const isWaitlist = ud?.status === "waitlist" || ud?.status === "pending";
                return (
                  <motion.button
                    key={deal.id} layout
                    className={`group text-left p-6 rounded-2xl border transition-all cursor-pointer ${isActive ? "border-green-500/30 bg-green-500/[0.03]" : isWaitlist ? "border-blue-500/25 bg-blue-500/[0.03]" : "border-border/50 bg-card/60 hover:bg-card hover:border-border"}`}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ delay: i * 0.04, duration: 0.35 }}
                    whileHover={{ y: -2 }}
                    onClick={() => setSelectedDeal(deal)}
                  >
                    <div className="flex items-start justify-between mb-5">
                      <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center">
                        <deal.icon size={14} className="text-foreground/60" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isActive ? (
                          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 flex items-center gap-1">
                            <CheckCircle2 size={9} /> Active
                          </span>
                        ) : isWaitlist ? (
                          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
                            <Users size={9} /> Waitlist
                          </span>
                        ) : (
                          <>
                            <span className={`w-1.5 h-1.5 rounded-full ${phase.dot} ${deal.phase === "live" ? "animate-pulse-slow" : ""}`} />
                            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${phase.badge}`}>{phase.label}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">{deal.provider}</p>
                    <h3 className="font-bold tracking-tight mb-1 text-sm">{deal.title}</h3>
                    <p className="text-sm font-semibold text-green-600 tracking-tight mb-3 leading-snug">{deal.advantage}</p>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/40">
                      <div>
                        <p className="text-[10px] text-muted-foreground/40 mb-0.5">Estimated benefit</p>
                        <p className="text-sm font-bold">{formatSavings(deal.estimated_savings)}/yr</p>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground/40 group-hover:text-foreground transition-colors text-xs">
                        {isActive ? "View contract" : isWaitlist ? "View status" : "Unlock deal"} <ChevronRight size={12} />
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {selectedDeal && (
          <DealModal
            deal={selectedDeal}
            onClose={() => setSelectedDeal(null)}
            userDeal={getUserDeal(selectedDeal.id)}
            userEmail={user?.email}
            onUserDealChange={handleUserDealChange}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}