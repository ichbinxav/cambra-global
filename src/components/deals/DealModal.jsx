import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, ArrowRight, Users, Shield, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { PHASE_CONFIG, formatSavings } from "@/lib/deals.js";

// step: "summary" → "accept" (negotiated only) → "done"

export default function DealModal({ deal, onClose, userDeal, userEmail, onUserDealChange }) {
  const [step, setStep] = useState("summary");
  const [accepted, setAccepted] = useState([]);
  const [loading, setLoading] = useState(false);
  const phase = PHASE_CONFIG[deal.phase];

  const isActive = userDeal?.status === "active";
  const isOnList = userDeal?.status === "waitlist" || userDeal?.status === "pending";

  // For negotiated live deals: summary → accept → done
  // For everything else: summary → done (single action)
  const isNegotiated = deal.mode === "negotiated" && deal.phase === "live" && deal.acceptance_items?.length > 0;

  const allAccepted = accepted.length === deal.acceptance_items?.length;

  const toggleAccept = (i) => {
    setAccepted(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };

  const handlePrimaryAction = async () => {
    if (step === "summary" && isNegotiated) {
      setStep("accept");
      return;
    }
    setLoading(true);
    try {
      const now = new Date().toISOString().split("T")[0];
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      const newStatus = deal.phase === "live" ? "active" : "waitlist";

      if (userDeal) {
        const updated = await base44.entities.UserDeal.update(userDeal.id, {
          status: newStatus,
          start_date: newStatus === "active" ? now : null,
          end_date: newStatus === "active" ? endDate.toISOString().split("T")[0] : null,
        });
        onUserDealChange(updated);
      } else {
        const created = await base44.entities.UserDeal.create({
          user_email: userEmail,
          deal_id: deal.id,
          deal_name: deal.title,
          provider: deal.provider,
          category: deal.category,
          status: newStatus,
          start_date: newStatus === "active" ? now : null,
          end_date: newStatus === "active" ? endDate.toISOString().split("T")[0] : null,
          estimated_savings: deal.estimated_savings,
          is_real_savings: false,
        });
        onUserDealChange(created);
      }
      setStep("done");
      toast.success(
        deal.phase === "live"
          ? `${deal.provider} — preferred terms requested. Check your email.`
          : `You've joined the access list for ${deal.provider}.`
      );
    } catch {
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
        className="relative w-full max-w-lg bg-background border border-border/60 rounded-2xl shadow-2xl"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Step indicator */}
        {isNegotiated && !isActive && !isOnList && step !== "done" && (
          <div className="px-7 pt-5 flex items-center gap-2">
            {["summary", "accept"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${step === s || (step === "done") ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>
                  {i + 1}
                </div>
                <span className={`text-[10px] font-medium transition-colors ${step === s ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {s === "summary" ? "Overview" : "Confirm"}
                </span>
                {i === 0 && <ChevronRight size={11} className="text-border" />}
              </div>
            ))}
          </div>
        )}

        {/* Close */}
        <button onClick={onClose} className="absolute top-5 right-5 text-muted-foreground/40 hover:text-muted-foreground transition-colors z-10">
          <X size={15} />
        </button>

        <AnimatePresence mode="wait">

          {/* ── STEP: SUMMARY ── */}
          {step === "summary" && (
            <motion.div key="summary" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              {/* Header */}
              <div className="px-7 pt-6 pb-5 border-b border-border/40">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                    <deal.icon size={16} className="text-foreground/70" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em]">{deal.provider}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${phase.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full inline-block ${phase.dot}`} />
                        Available via THE NoDE network
                      </span>
                    </div>
                    <h2 className="text-lg font-black tracking-tight leading-tight">{deal.title}</h2>
                    <p className="text-base font-bold text-green-600 mt-1">{deal.advantage}</p>
                  </div>
                </div>
              </div>

              {/* Value block */}
              <div className="px-7 py-5 border-b border-border/40 bg-secondary/20">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1.5">Standard conditions</p>
                    <p className="text-sm font-semibold line-through text-muted-foreground/40">{deal.normal_rate}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1.5">Via THE NoDE</p>
                    <p className="text-sm font-bold">{deal.node_rate}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-border/30">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">Estimated benefit</p>
                  <p className="text-2xl font-black tabular-nums">{formatSavings(deal.estimated_savings)}/yr</p>
                  <p className="text-[10px] text-muted-foreground/40 mt-0.5">{deal.saving_note} · Estimated, subject to your volume</p>
                </div>
              </div>

              {/* Description */}
              <div className="px-7 py-5">
                <p className="text-sm text-muted-foreground/70 leading-relaxed mb-5">{deal.desc}</p>

                {/* Network trust signal */}
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-secondary/40 border border-border/40">
                  <Shield size={12} className="text-muted-foreground/40 shrink-0" />
                  <p className="text-[11px] text-muted-foreground/50 leading-tight">
                    This deal is curated and managed by THE NoDE. Access is exclusive to network members.
                  </p>
                </div>
              </div>

              {/* CTA */}
              <div className="px-7 pb-7">
                {isActive ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/[0.08] border border-green-500/20">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-600">Preferred terms active</p>
                      {userDeal?.end_date && (
                        <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                          Renews {new Date(userDeal.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                    </div>
                  </div>
                ) : isOnList ? (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/[0.08] border border-blue-500/20">
                    <Users size={16} className="text-blue-500 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-blue-600">You're on the access list</p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5">You'll be notified when this becomes available.</p>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={handlePrimaryAction}
                    disabled={loading || deal.phase === "planned"}
                    className="w-full h-12 rounded-xl text-sm font-semibold gap-2 shadow-sm"
                  >
                    {loading ? (
                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="inline-block">✱</motion.span>
                    ) : deal.phase === "planned" ? (
                      "Coming soon — register interest"
                    ) : isNegotiated ? (
                      <>Continue <ArrowRight size={14} /></>
                    ) : (
                      <>{deal.action_label} <ArrowRight size={14} /></>
                    )}
                  </Button>
                )}
                {!isActive && !isOnList && deal.phase !== "planned" && (
                  <p className="text-[11px] text-muted-foreground/35 text-center mt-3">{deal.action_note}</p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── STEP: ACCEPT (negotiated only) ── */}
          {step === "accept" && (
            <motion.div key="accept" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="px-7 pt-6 pb-5 border-b border-border/40">
                <button onClick={() => setStep("summary")} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors mb-4">
                  ← Back
                </button>
                <h2 className="text-lg font-black tracking-tight">Confirm your request</h2>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  Review and accept the terms below to request optimised conditions for <span className="font-semibold text-foreground">{deal.provider}</span>.
                </p>
              </div>

              <div className="px-7 py-6 space-y-3">
                {deal.acceptance_items.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => toggleAccept(i)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${accepted.includes(i) ? "border-foreground/20 bg-foreground/[0.04]" : "border-border/50 hover:border-foreground/20"}`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${accepted.includes(i) ? "bg-foreground border-foreground" : "border-border"}`}>
                      {accepted.includes(i) && <CheckCircle2 size={11} className="text-background" />}
                    </div>
                    <p className="text-sm text-foreground/70 leading-snug">{item}</p>
                  </button>
                ))}
              </div>

              <div className="px-7 pb-7">
                <Button
                  onClick={handlePrimaryAction}
                  disabled={!allAccepted || loading}
                  className="w-full h-12 rounded-xl text-sm font-semibold gap-2 shadow-sm"
                >
                  {loading ? (
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="inline-block">✱</motion.span>
                  ) : (
                    <>{deal.action_label} <ArrowRight size={14} /></>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground/35 text-center mt-3">{deal.action_note}</p>
              </div>
            </motion.div>
          )}

          {/* ── STEP: DONE ── */}
          {step === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
              <div className="px-7 py-12 text-center">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.1 }}
                  className={`w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center ${deal.phase === "live" ? "bg-green-500" : "bg-foreground"}`}
                >
                  {deal.phase === "live" ? (
                    <CheckCircle2 size={28} className="text-white" />
                  ) : (
                    <Users size={24} className="text-background" />
                  )}
                </motion.div>
                <h2 className="text-xl font-black tracking-tight mb-2">
                  {deal.phase === "live" ? "Request submitted" : "You're on the list"}
                </h2>
                <p className="text-sm text-muted-foreground/60 max-w-xs mx-auto leading-relaxed mb-2">
                  {deal.phase === "live"
                    ? `THE NoDE is submitting your request for preferred ${deal.provider} conditions. You'll receive confirmation by email.`
                    : `We'll notify you when preferred ${deal.provider} conditions become available to network members.`
                  }
                </p>
                <p className="text-[11px] text-muted-foreground/35 mb-8">{deal.action_note}</p>
                <div className="flex items-center justify-center gap-2.5 p-3.5 rounded-xl bg-secondary/40 border border-border/40 mb-6 text-left">
                  <Shield size={12} className="text-muted-foreground/40 shrink-0" />
                  <p className="text-[11px] text-muted-foreground/50">
                    This deal is tracked in your contracts. Estimated benefit: <span className="font-semibold text-foreground">{formatSavings(deal.estimated_savings)}/yr</span>
                  </p>
                </div>
                <button onClick={onClose} className="h-10 px-6 rounded-full border border-border/60 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Close
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
        </div>
        </motion.div>
        </motion.div>
        );
        }