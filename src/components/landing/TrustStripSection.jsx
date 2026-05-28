import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plug, ShieldCheck, Target, Activity, Gauge, ArrowRight, Sparkles } from "lucide-react";

const TOOLS = [
  { name: "Stripe", url: "https://cdn.simpleicons.org/stripe/635BFF" },
  { name: "Shopify", url: "https://cdn.simpleicons.org/shopify/95BF47" },
  { name: "WooCommerce", url: "https://cdn.simpleicons.org/woocommerce/873EFF" },
  { name: "PayPal", url: "https://cdn.simpleicons.org/paypal/003087" },
  { name: "Xero", url: "https://cdn.simpleicons.org/xero/13B5EA" },
  { name: "QuickBooks", url: "https://cdn.simpleicons.org/intuit/236CFF" },
  { name: "Pennylane", url: "https://www.google.com/s2/favicons?domain=pennylane.com&sz=64" },
  { name: "DHL", url: "https://cdn.simpleicons.org/dhl/D40511" },
  { name: "FedEx", url: "https://cdn.simpleicons.org/fedex/4D148C" },
  { name: "Klaviyo", url: "https://cdn.simpleicons.org/klaviyo/1E2C3B" },
  { name: "HubSpot", url: "https://cdn.simpleicons.org/hubspot/FF7A59" },
  { name: "Slack", url: "https://cdn.simpleicons.org/slack/4A154B" },
];

const STATS = [
  { value: "98", suffix: "%", label: "Accuracy", sub: "vs. raw statements", Icon: Gauge },
  { value: "<3", suffix: "s", label: "Data freshness", sub: "real-time sync", Icon: Activity },
  { value: "22", suffix: "+", label: "Integrations", sub: "PSPs · carriers · ERPs", Icon: Plug },
  { value: "OAuth", suffix: "", label: "Secure access", sub: "read-only · revocable", Icon: ShieldCheck },
];

const PILLARS = [
  {
    Icon: Plug,
    eyebrow: "Connect your tools",
    title: "OAuth + statements",
    detail: "Stripe, Shopify, Xero, carriers — or just upload a PDF. Setup in 3 minutes.",
  },
  {
    Icon: Target,
    eyebrow: "Accuracy",
    title: "Real network benchmarks",
    detail: "Compared against operators of similar GMV, category and geography — not generic averages.",
  },
  {
    Icon: ShieldCheck,
    eyebrow: "Security",
    title: "Read-only, encrypted",
    detail: "We never move money, never store credentials. Revoke access anytime.",
  },
];

function AnimatedNumber({ value, suffix, inView }) {
  const [display, setDisplay] = useState(0);
  const isNumeric = /^\d+$/.test(value);

  useEffect(() => {
    if (!inView || !isNumeric) return;
    const target = parseInt(value, 10);
    const dur = 1400;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.floor(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, isNumeric]);

  return (
    <span className="tabular-nums">
      {isNumeric ? display : value}
      {suffix && <span className="text-cambra-cyan">{suffix}</span>}
    </span>
  );
}

export default function TrustStripSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-16 md:py-24 px-5 border-t border-border/40 bg-background overflow-hidden">
      {/* Ambient backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.18]" />
        <div className="absolute -bottom-32 right-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.14]" />
      </div>
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-2 mb-6 w-fit mx-auto px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              Data layer · Highest accuracy
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="font-display text-[clamp(2.2rem,5.5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.95] mb-5"
          >
            Connect once. <span className="text-saas-gradient">Benchmark forever.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="text-base md:text-lg text-foreground/65 max-w-2xl mx-auto leading-[1.6]"
          >
            Read-only OAuth into Stripe, Shopify, carriers and accounting. Real numbers, zero write access, revoke anytime.
          </motion.p>
        </div>

        {/* Logos grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="grid grid-cols-4 sm:grid-cols-6 gap-3 sm:gap-4 max-w-4xl mx-auto items-center justify-items-center mb-14"
        >
          {TOOLS.map((tool, i) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, scale: 0.85, y: 12 }}
              animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.25 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="group relative flex items-center justify-center h-16 w-full rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm hover:border-border/80 hover:bg-card transition-all duration-300"
              title={tool.name}
            >
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "radial-gradient(circle at center, rgba(44,167,193,0.12), transparent 70%)" }} />
              <img
                src={tool.url}
                alt={tool.name}
                className="h-7 w-7 object-contain relative z-[1] group-hover:scale-110 transition-transform duration-300"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextSibling.style.display = "block";
                }}
              />
              <span className="hidden text-[10px] font-bold tracking-tight text-foreground/70 relative z-[1]">
                {tool.name}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Tech stats grid — NAVY panels */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10"
        >
          {STATS.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.45 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="group relative rounded-2xl border border-white/10 overflow-hidden p-5"
              style={{
                background:
                  "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.18) 0%, transparent 55%), linear-gradient(180deg, hsl(222 55% 9%) 0%, hsl(222 60% 6%) 100%)",
              }}
            >
              {/* hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: "radial-gradient(120% 80% at 100% 100%, rgba(44,167,193,0.18), transparent 60%)",
                }}
              />
              {/* corner marker */}
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-cambra-cyan/70" />
                <span className="text-[8px] font-mono tracking-[0.22em] uppercase text-white/30">
                  0{i + 1}
                </span>
              </div>

              <stat.Icon className="h-3.5 w-3.5 text-cambra-cyan/80 mb-4" strokeWidth={2} />

              <div
                className="text-3xl md:text-4xl font-black tracking-[-0.04em] leading-none mb-2"
                style={{
                  background: "linear-gradient(180deg, #ffffff 0%, #B8D8E0 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "drop-shadow(0 0 14px rgba(44,167,193,0.18))",
                }}
              >
                <AnimatedNumber value={stat.value} suffix={stat.suffix} inView={inView} />
              </div>

              <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70 mb-1">
                {stat.label}
              </div>
              <div className="text-[10px] font-mono text-white/35 truncate">
                {stat.sub}
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Pillars — navy cambra cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.7, delay: 0.7 }}
          className="space-y-3 mb-10"
        >
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.eyebrow}
              initial={{ opacity: 0, x: -16 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.75 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="cambra-card p-5 sm:p-6 hover:shadow-lg transition-shadow duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/[0.08] border border-white/15 flex-shrink-0 mt-0.5">
                  <p.Icon className="h-4 w-4 text-cambra-cyan" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] font-bold tracking-[0.22em] uppercase text-white/50 cc-eyebrow block mb-2">
                    {p.eyebrow}
                  </span>
                  <h3 className="font-display text-lg sm:text-xl font-black tracking-[-0.025em] mb-1.5 text-white">
                    {p.title}
                  </h3>
                  <p className="text-[13px] text-white/65 leading-[1.55]">
                    {p.detail}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 1.0 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link to="/ConnectTools">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="relative h-14 rounded-full px-7 text-[15px] font-black inline-flex items-center justify-center gap-2.5 overflow-hidden group bg-foreground text-background hover:bg-foreground/95 transition"
              style={{
                boxShadow:
                  "0 16px 40px -12px rgba(44,167,193,0.45), 0 4px 14px -2px rgba(31,78,216,0.3)",
              }}
            >
              <motion.span
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(110deg, transparent 35%, rgba(44,167,193,0.35) 50%, transparent 65%)",
                }}
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
              />
              <Sparkles className="relative h-4 w-4" />
              <span className="relative">Connect your tools</span>
              <ArrowRight className="relative h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </motion.button>
          </Link>
          <span className="text-[11px] font-mono text-muted-foreground/60 tracking-wider">
            2-min setup · revoke anytime
          </span>
        </motion.div>
      </div>
    </section>
  );
}