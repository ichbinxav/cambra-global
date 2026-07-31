import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Check, Sparkles, ShieldCheck, Activity, TrendingUp } from "lucide-react";

const INTELLIGENCE_FEATURES = [
  "Infrastructure audit across 8 operational layers",
  "Comparison with similar businesses",
  "Infrastructure Score™",
  "Estimated savings opportunities",
  "AI recommendations & optimization insights",
  "Dashboard access & reporting",
  "Margin intelligence Copilot",
];

const RECOVERY_FEATURES = [
  "Provider negotiation support",
  "Infrastructure optimization",
  "Savings verification & reporting",
  "Priority migration assistance",
  "Ongoing recovery monitoring",
  "Strategic infrastructure support",
  "Always-updated market comparison",
];

export default function AccessModelCards() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref} className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
      {/* ───────────── CARD 1 — FREE INTELLIGENCE (light, editorial) ───────────── */}
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="group relative rounded-[1.75rem] overflow-hidden border border-border/60 bg-card/95 backdrop-blur-md p-7 sm:p-9 flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-[0_28px_70px_-22px_rgba(31,78,216,0.18)]"
      >
        {/* Ambient analytical gradient */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-24 w-80 h-80 rounded-full blur-3xl opacity-[0.18]" style={{ background: "radial-gradient(closest-side, var(--voltio), transparent)" }} />
          <div className="absolute -bottom-32 -left-24 w-72 h-72 rounded-full blur-3xl opacity-[0.14]" style={{ background: "radial-gradient(closest-side, #39C6F0, transparent)" }} />
          <div
            className="absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(222 25% 8% / 0.025) 1px, transparent 1px), linear-gradient(90deg, hsl(222 25% 8% / 0.025) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 80%)",
            }}
          />
        </div>

        <div className="relative flex flex-col flex-1">
          {/* Step badge */}
          <div className="flex items-center gap-2 mb-7">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-cambra-blue/30 bg-cambra-blue/[0.08]">
              <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-cambra-blue font-bold">Step 01</span>
            </div>
            <Sparkles className="h-3 w-3 text-cambra-blue" strokeWidth={2.2} />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              Analyze
            </span>
          </div>

          {/* Title */}
          <h3 className="font-display text-[clamp(1.75rem,3.4vw,2.4rem)] font-black tracking-[-0.035em] leading-[1] mb-3 text-foreground">
            See the leaks. <span className="text-saas-gradient">Free.</span>
          </h3>
          <p className="text-sm sm:text-[15px] text-foreground/65 leading-relaxed mb-8 max-w-md">
            Run the full audit, compare your costs with the market, and see how much you can recover — no card, no commitment.
          </p>

          {/* Price block */}
          <div className="mb-2 flex items-baseline gap-3">
            <span
              className="font-display text-[clamp(3rem,6vw,4.5rem)] font-black tracking-[-0.05em] leading-none"
              style={{
                background: "linear-gradient(135deg, hsl(var(--cambra-navy)) 0%, hsl(var(--cambra-blue)) 60%, hsl(var(--cambra-cyan)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Free
            </span>
            <span className="text-sm text-muted-foreground/70">during early access</span>
          </div>
          <p className="text-[12px] text-muted-foreground mb-7">
            No card. No commitment. See what you're overpaying — at zero risk.
          </p>

          {/* Value anchor */}
          <div className="mb-8 rounded-2xl border border-border/50 bg-background/60 backdrop-blur-sm px-4 py-3.5 flex items-start gap-3">
            <div className="mt-0.5 h-7 w-7 rounded-full flex items-center justify-center bg-gradient-to-br from-cambra-blue/15 to-cambra-cyan/15 border border-border/40 shrink-0">
              <TrendingUp className="h-3.5 w-3.5 text-cambra-blue" strokeWidth={2.2} />
            </div>
            <p className="text-[12.5px] leading-relaxed text-foreground/75">
              Typical businesses find <span className="font-bold text-foreground tabular-nums">€8k–€120k/year</span> they can recover.
            </p>
          </div>

          {/* Features */}
          <ul className="space-y-2.5 mb-9">
            {INTELLIGENCE_FEATURES.map((f, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.3 + i * 0.04 }}
                className="flex items-start gap-3"
              >
                <span className="mt-1 h-3.5 w-3.5 rounded-full flex items-center justify-center bg-cambra-blue/10 shrink-0">
                  <Check className="h-2.5 w-2.5 text-cambra-blue" strokeWidth={3} />
                </span>
                <span className="text-[13.5px] text-foreground/80 leading-relaxed">{f}</span>
              </motion.li>
            ))}
          </ul>

          {/* CTA */}
          <div className="mt-auto">
            <Link to="/Analyzer" className="block">
              <button className="group/btn relative w-full h-12 rounded-full font-bold text-sm bg-foreground text-background hover:opacity-90 transition flex items-center justify-center gap-2 overflow-hidden">
                <span className="relative">Run free audit</span>
                <ArrowRight className="relative h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
              </button>
            </Link>
            <p className="text-xs text-foreground/75 text-center mt-3 font-semibold tracking-[0.08em] flex items-center justify-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-cambra-blue" strokeWidth={2} />
                <span>3 min setup</span>
              </span>
              <span className="text-foreground/40">•</span>
              <span>No card</span>
              <span className="text-foreground/40">•</span>
              <span>Read-only</span>
            </p>
          </div>
        </div>
      </motion.article>

      {/* ───────────── CARD 2 — RECOVERY MODEL (deep navy, premium) ───────────── */}
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="group relative rounded-[1.75rem] overflow-hidden border border-white/10 p-7 sm:p-9 flex flex-col text-white transition-all hover:-translate-y-0.5"
        style={{
          background:
            "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.22) 0%, transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(44,167,193,0.18) 0%, transparent 60%), linear-gradient(180deg, hsl(222 60% 7%) 0%, hsl(222 65% 4%) 100%)",
          boxShadow:
            "0 1px 0 hsl(0 0% 100% / 0.06) inset, 0 30px 80px -28px rgba(0,0,0,0.7), 0 12px 40px -16px rgba(31,78,216,0.35)",
        }}
      >
        {/* Animated grid + halo */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.55]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 75%)",
            }}
          />
          <motion.div
            className="absolute -top-32 -right-24 w-96 h-96 rounded-full blur-[100px]"
            style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.40), transparent)" }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-32 -left-24 w-80 h-80 rounded-full blur-[100px]"
            style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.40), transparent)" }}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
          {/* Scan line */}
          <motion.div
            className="absolute left-0 right-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(44,167,193,0.5), transparent)" }}
            animate={{ y: ["-5%", "105%"] }}
            transition={{ duration: 7, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="relative flex flex-col flex-1">
          {/* Step badge */}
          <div className="flex items-center gap-2 mb-7">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-cambra-cyan/30 bg-cambra-cyan/[0.10]">
              <span className="text-[9px] font-mono tracking-[0.2em] uppercase text-cambra-cyan font-bold">Step 02</span>
            </div>
            <Activity className="h-3 w-3 text-white/60" strokeWidth={2.2} />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">
              Recover
            </span>
          </div>

          {/* Title */}
          <h3 className="font-display text-[clamp(1.75rem,3.4vw,2.4rem)] font-black tracking-[-0.035em] leading-[1] mb-3">
            <span
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #39C6F0 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Fix them. Together.
            </span>
          </h3>
          <p className="text-sm sm:text-[15px] text-white/65 leading-relaxed mb-8 max-w-md">
            After Step 01, CAMBRA helps you recover the margin we found — negotiation, migration and verification, end-to-end.
          </p>

          {/* Price block */}
          <div className="mb-2 flex items-baseline gap-3">
            <span
              className="font-display text-[clamp(3rem,6vw,4.5rem)] font-black tracking-[-0.05em] leading-none tabular-nums"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #39C6F0 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              25%
            </span>
            <span className="text-sm text-white/60">of verified savings · 24 months</span>
          </div>
          <p className="text-[13px] text-white/70 mb-2">Only on savings we help recover and verify against your real provider data.</p>
          <p className="text-[12px] text-white/55 mb-7">
            No upfront fee. No savings, no fee. After 24 months, 100% of the recovered margin is yours.
          </p>

          {/* Aligned incentives anchor */}
          <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm px-4 py-3.5 flex items-start gap-3">
            <div className="mt-0.5 h-7 w-7 rounded-full flex items-center justify-center bg-cambra-cyan/15 border border-white/10 shrink-0">
              <ShieldCheck className="h-3.5 w-3.5 text-cambra-cyan" strokeWidth={2.2} />
            </div>
            <p className="text-[12.5px] leading-relaxed text-white/75">
              <span className="font-bold text-white">Aligned incentives.</span> We participate only when verified margin is recovered — never before.
            </p>
          </div>

          {/* Features */}
          <ul className="space-y-2.5 mb-9">
            {RECOVERY_FEATURES.map((f, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.4 + i * 0.04 }}
                className="flex items-start gap-3"
              >
                <span className="mt-1 h-3.5 w-3.5 rounded-full flex items-center justify-center bg-cambra-cyan/15 shrink-0">
                  <Check className="h-2.5 w-2.5 text-cambra-cyan" strokeWidth={3} />
                </span>
                <span className="text-[13.5px] text-white/80 leading-relaxed">{f}</span>
              </motion.li>
            ))}
          </ul>

          {/* CTA */}
          <div className="mt-auto">
            <Link to="/Contact" className="block">
              <button className="group/btn relative w-full h-12 rounded-full font-bold text-sm bg-white text-[#06080F] hover:bg-white/90 transition flex items-center justify-center gap-2 overflow-hidden">
                <motion.span
                  aria-hidden
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(110deg, transparent 35%, rgba(44,167,193,0.25) 50%, transparent 65%)" }}
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
                />
                <span className="relative">Unlock savings</span>
                <ArrowRight className="relative h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
              </button>
            </Link>
            <p className="text-[11px] text-white/55 text-center mt-3 font-mono tracking-[0.1em]">
              You keep the majority of recovered margin.
            </p>
          </div>
        </div>
      </motion.article>
    </div>
  );
}