import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Plug, ShieldCheck, Target } from "lucide-react";

const TOOLS = [
  { name: "Stripe", url: "https://cdn.simpleicons.org/stripe/635BFF" },
  { name: "Shopify", url: "https://cdn.simpleicons.org/shopify/95BF47" },
  { name: "WooCommerce", url: "https://cdn.simpleicons.org/woocommerce/873EFF" },
  { name: "Adyen", url: "https://cdn.simpleicons.org/adyen/0ABF53" },
  { name: "PayPal", url: "https://cdn.simpleicons.org/paypal/003087" },
  { name: "Xero", url: "https://cdn.simpleicons.org/xero/13B5EA" },
  { name: "QuickBooks", url: "https://cdn.simpleicons.org/quickbooks/2CA01C" },
  { name: "DHL", url: "https://cdn.simpleicons.org/dhl/FFCC00" },
  { name: "DPD", url: "https://cdn.simpleicons.org/dpd/DC0032" },
  { name: "Sendcloud", url: "https://cdn.simpleicons.org/sendcloud/0061FE" },
  { name: "Klaviyo", url: "https://cdn.simpleicons.org/klaviyo/000000" },
  { name: "HubSpot", url: "https://cdn.simpleicons.org/hubspot/FF7A59" },
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

export default function TrustStripSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="relative py-20 md:py-28 px-5 border-t border-border/40 bg-background overflow-hidden">
      {/* Ambient backdrop — stronger glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.18]" />
        <div className="absolute -bottom-32 right-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.14]" />
      </div>
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="font-display text-[clamp(2.2rem,5.5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.95] mb-5"
          >
            <span className="text-saas-gradient">Connect your tools.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="text-base md:text-lg text-foreground/65 max-w-2xl mx-auto leading-[1.6]"
          >
            Native integrations with 50+ platforms — or just upload statements. Read-only, encrypted, revoke anytime.
          </motion.p>
        </div>

        {/* Logos grid — bigger, vibrant */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-6 sm:gap-8 max-w-5xl mx-auto items-center justify-items-center mb-16"
        >
          {TOOLS.map((tool, i) => (
            <motion.div
              key={tool.name}
              initial={{ opacity: 0, scale: 0.85, y: 12 }}
              animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.25 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="group relative flex items-center justify-center h-14 w-14 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm hover:border-border/80 hover:scale-110 transition-all duration-300"
              title={tool.name}
            >
              {/* Glow on hover */}
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-60 transition-opacity duration-300" style={{ background: "radial-gradient(circle, rgba(44,167,193,0.3), transparent)" }} />
              <img
                src={tool.url}
                alt={tool.name}
                className="max-h-7 max-w-[70%] object-contain relative z-1"
                loading="lazy"
              />
            </motion.div>
          ))}
        </motion.div>

        {/* Pillars — premium cards */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 pt-12 border-t border-border/40"
        >
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.eyebrow}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.55 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="group relative rounded-2xl border border-border/50 bg-gradient-to-br from-card/80 via-card/70 to-card/60 backdrop-blur-md p-6 sm:p-7 hover:border-border/80 hover:shadow-lg transition-all duration-300 overflow-hidden"
            >
              {/* Hover glow */}
              <div className="absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "radial-gradient(circle at top right, rgba(44,167,193,0.15), transparent)" }} />
              
              <div className="relative z-1 flex items-center gap-3 mb-5">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-gradient-to-br from-secondary/80 to-secondary/60 border border-border/50 group-hover:from-secondary group-hover:to-secondary/70 transition-colors">
                  <p.Icon className="h-4.5 w-4.5 text-cambra-blue" strokeWidth={2} />
                </div>
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
                  {p.eyebrow}
                </span>
              </div>
              <h3 className="relative z-1 font-display text-xl font-black tracking-[-0.025em] mb-2 group-hover:text-foreground transition-colors">
                {p.title}
              </h3>
              <p className="relative z-1 text-[13px] text-foreground/65 group-hover:text-foreground/75 leading-[1.6] transition-colors">
                {p.detail}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}