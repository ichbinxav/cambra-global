import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Shield, Activity, Plug, Gauge } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";

const STATS = [
  { value: "98", suffix: "%", label: "Accuracy", sub: "vs. raw statements", Icon: Gauge },
  { value: "<3", suffix: "s", label: "Data freshness", sub: "real-time sync", Icon: Activity },
  { value: "22", suffix: "+", label: "Integrations", sub: "PSPs · carriers · ERPs", Icon: Plug },
  { value: "OAuth", suffix: "", label: "Secure access", sub: "read-only · revocable", Icon: Shield },
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

export default function ConnectToolsSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 px-5 border-t border-white/5 overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.22) 0%, transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(44,167,193,0.18) 0%, transparent 60%), linear-gradient(180deg, hsl(222 60% 7%) 0%, hsl(222 65% 4%) 100%)",
      }}
    >
      {/* Tech grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 80%)",
        }}
      />

      {/* Floating cyan glow */}
      <motion.div
        className="pointer-events-none absolute -top-40 right-1/4 w-[36rem] h-[36rem] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.35), transparent)" }}
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.1, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute -bottom-40 left-1/4 w-[34rem] h-[34rem] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.35), transparent)" }}
        animate={{ opacity: [0.5, 0.75, 0.5], scale: [1.1, 1, 1.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Scan line */}
      <motion.div
        className="absolute left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, rgba(44,167,193,0.5), transparent)" }}
        animate={{ y: ["-10%", "110%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12 md:mb-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 mb-7 w-fit px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">
              Data layer · Highest accuracy
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(2.4rem,6vw,4.4rem)] font-black tracking-[-0.05em] leading-[0.9] mb-6"
          >
            <span
              style={{
                background:
                  "linear-gradient(135deg, #ffffff 0%, #E8F4F6 55%, #B8D8E0 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Connect once.
            </span>
            <br />
            <span
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--cambra-blue)) 0%, hsl(var(--cambra-cyan)) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Benchmark forever.
            </span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="text-base md:text-lg text-white/65 leading-relaxed max-w-2xl"
          >
            Read-only OAuth into Stripe, Shopify, carriers and accounting.{" "}
            <span className="text-white font-semibold">~98% accuracy</span>, real numbers,{" "}
            <span className="text-cambra-cyan font-mono text-sm">zero write access</span>.
          </motion.p>
        </div>

        {/* Stats grid — tech panels */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {STATS.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="group relative rounded-2xl border border-white/10 overflow-hidden p-5 md:p-6"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                backdropFilter: "blur(8px)",
              }}
            >
              {/* hover glow */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(120% 80% at 0% 0%, rgba(44,167,193,0.15), transparent 60%)",
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
                  background:
                    "linear-gradient(180deg, #ffffff 0%, #B8D8E0 100%)",
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
        </div>

        {/* CTA panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-2xl border border-white/10 overflow-hidden p-6 md:p-10"
          style={{
            background:
              "radial-gradient(120% 80% at 100% 0%, rgba(44,167,193,0.18) 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* inner grid */}
          <div
            className="absolute inset-0 opacity-50 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              maskImage: "radial-gradient(ellipse 80% 80% at 100% 0%, #000 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 100% 0%, #000 30%, transparent 75%)",
            }}
          />

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 mb-3 px-2.5 py-1 rounded-full border border-cambra-cyan/30 bg-cambra-cyan/10">
                <span className="h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
                <span className="text-[9px] font-mono tracking-[0.22em] uppercase text-cambra-cyan">
                  Status · Ready to connect
                </span>
              </div>
              <h3 className="text-xl md:text-2xl font-black tracking-[-0.02em] text-white mb-2">
                Secure read-only access to your real data.
              </h3>
              <p className="text-[12px] font-mono text-white/45 tracking-wider">
                2-min setup · revocable anytime · SOC-2 grade encryption
              </p>
            </div>

            <Link to="/ConnectTools" className="shrink-0">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="relative h-14 rounded-full px-7 text-[15px] font-black inline-flex items-center justify-center gap-2.5 overflow-hidden group bg-white text-[#06080F] hover:bg-white/95 transition w-full md:w-auto"
                style={{
                  boxShadow:
                    "0 16px 40px -12px rgba(44,167,193,0.55), 0 4px 14px -2px rgba(31,78,216,0.35)",
                }}
              >
                {/* Shimmer */}
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
          </div>
        </motion.div>
      </div>
    </section>
  );
}