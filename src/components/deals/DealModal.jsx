import { useState } from "react";
import { motion } from "framer-motion";
import { X, CheckCircle2, Zap, Lock, ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { PHASE_CONFIG } from "@/lib/deals.js";

export default function DealModal({ deal, onClose, userDeal, userEmail, onUserDealChange }) {
  const [loading, setLoading] = useState(false);
  const phase = PHASE_CONFIG[deal.phase];

  const isActive = userDeal?.status === "active";
  const isWaitlist = userDeal?.status === "waitlist" || userDeal?.status === "pending";

  const handleAction = async () => {
    setLoading(true);
    try {
      const now = new Date().toISOString().split("T")[0];
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);

      if (userDeal) {
        const updated = await base44.entities.UserDeal.update(userDeal.id, {
          status: deal.phase === "live" ? "active" : "waitlist",
          start_date: deal.phase === "live" ? now : null,
          end_date: deal.phase === "live" ? endDate.toISOString().split("T")[0] : null,
        });
        onUserDealChange(updated);
      } else {
        const created = await base44.entities.UserDeal.create({
          user_email: userEmail,
          deal_id: deal.id,
          deal_name: deal.title,
          provider: deal.provider,
          category: deal.category,
          status: deal.phase === "live" ? "active" : "waitlist",
          start_date: deal.phase === "live" ? now : null,
          end_date: deal.phase === "live" ? endDate.toISOString().split("T")[0] : null,
          estimated_savings: deal.estimated_savings,
          is_real_savings: false,
        });
        onUserDealChange(created);
      }

      toast.success(
        deal.phase === "live"
          ? `${deal.provider} deal activated — check your email for next steps.`
          : `You've joined the waitlist for ${deal.provider}. You'll be notified when it goes live.`
      );
    } catch (e) {
      toast.error("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg bg-background border border-border/60 rounded-2xl shadow-2xl overflow-hidden"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div className="px-7 pt-7 pb-5 border-b border-border/40">
          <button onClick={onClose} className="absolute top-5 right-5 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
            <X size={15} />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0">
              <deal.icon size={16} className="text-foreground/70" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-[0.2em]">{deal.provider}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${phase.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full inline-block ${phase.dot}`} />
                  {phase.label}
                </span>
                {isActive && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-green-500/10 text-green-600 border-green-500/20 flex items-center gap-1">
                    <CheckCircle2 size={9} /> Active
                  </span>
                )}
                {isWaitlist && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-600 border-blue-500/20 flex items-center gap-1">
                    <Users size={9} /> On waitlist
                  </span>
                )}
              </div>
              <h2 className="text-xl font-black tracking-tight">{deal.title}</h2>
              <p className="text-2xl font-black text-node-blue mt-1 tracking-tight">{deal.headline}</p>
            </div>
          </div>
        </div>

        {/* Rate comparison */}
        <div className="px-7 py-5 grid grid-cols-2 gap-3 border-b border-border/40 bg-secondary/20">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-1.5">Standard rate</p>
            <p className="text-sm font-semibold line-through text-muted-foreground/50">{deal.normal_rate}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-1.5">Network rate</p>
            <p className="text-sm font-bold text-foreground">{deal.node_rate}</p>
          </div>
          <div className="col-span-2 pt-3 border-t border-border/30">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-1">Estimated savings</p>
            <p className="text-2xl font-black tabular-nums">
              €{deal.estimated_savings.toLocaleString()}/yr
              <span className="text-xs font-normal text-muted-foreground ml-2">{deal.saving_note}</span>
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-1">Estimated · Subject to your actual volume</p>
          </div>
        </div>

        {/* Description + steps */}
        <div className="px-7 py-5">
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">{deal.desc}</p>
          <div className="space-y-2.5 mb-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-3">How it works</p>
            {deal.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5 ${isActive && i === 0 ? "bg-green-500 text-white" : "bg-secondary text-muted-foreground"}`}>
                  {isActive && i === 0 ? <CheckCircle2 size={11} /> : i + 1}
                </div>
                <p className="text-sm text-muted-foreground">{s}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="px-7 pb-7">
          {isActive ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/[0.08] border border-green-500/20">
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-600">Deal active — check your email for next steps.</p>
                {userDeal?.end_date && (
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">Renews {new Date(userDeal.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                )}
              </div>
            </div>
          ) : isWaitlist ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/20">
              <Users size={16} className="text-blue-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-600">You've joined the waitlist</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">You'll be notified when this deal becomes available.</p>
              </div>
            </div>
          ) : (
            <Button
              onClick={handleAction}
              disabled={loading || deal.phase === "planned"}
              className="w-full h-12 rounded-xl text-sm font-semibold gap-2 shadow-sm"
            >
              {loading ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>✱</motion.div>
              ) : deal.phase === "planned" ? (
                <><Lock size={13} /> Coming 2027</>
              ) : deal.phase === "soon" ? (
                <><Users size={13} /> Join waitlist <ArrowRight size={13} /></>
              ) : (
                <><Zap size={13} /> Activate Deal <ArrowRight size={13} /></>
              )}
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground/40 text-center mt-3">{deal.activation}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}