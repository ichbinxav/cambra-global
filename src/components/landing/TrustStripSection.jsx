import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Plug, ShieldCheck, Target } from "lucide-react";

const TOOLS = [
  { name: "Stripe", url: "https://cdn.simpleicons.org/stripe/635BFF" },
  { name: "Shopify", url: "https://cdn.simpleicons.org/shopify/95BF47" },
  { name: "WooCommerce", url: "https://cdn.simpleicons.org/woocommerce/873EFF" },
  { name: "PayPal", url: "https://cdn.simpleicons.org/paypal/003087" },
  { name: "Xero", url: "https://cdn.simpleicons.org/xero/13B5EA" },
  { name: "QuickBooks", url: "https://cdn.simpleicons.org/quickbooks/2CA01C" },
  { name: "DHL", url: "https://cdn.simpleicons.org/dhl/D40511" },
  { name: "FedEx", url: "https://cdn.simpleicons.org/fedex/4D148C" },
  { name: "Klaviyo", url: "https://cdn.simpleicons.org/klaviyo/1E2C3B" },
  { name: "HubSpot", url: "https://cdn.simpleicons.org/hubspot/FF7A59" },
  { name: "Mailchimp", url: "https://cdn.simpleicons.org/mailchimp/FFE01B" },
  { name: "Slack", url: "https://cdn.simpleicons.org/slack/4A154B" },
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
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center mb-6 w-fit mx-auto px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
          >
            <Plug className="h-3.5 w-3.5 text-cambra-mint mr-2" strokeWidth={2} />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              Connect your tools
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="font-display text-[clamp(2.2rem,5.5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.95] mb-5"
          >
            Your data. <span className="text-saas-gradient">Your control.</span>
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
          className="grid grid-cols-4 sm:grid-cols-6 gap-3 sm:gap-4 max-w-4xl mx-auto items-center justify-items-center mb-16"
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
              />
            </motion.div>
          ))}
        </motion.div>

        {/* Pillars — navy cambra cards, vertical stack */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="space-y-3 pt-10"
        >
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.eyebrow}
              initial={{ opacity: 0, x: -16 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.55 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="cambra-card p-5 sm:p-6 hover:shadow-lg transition-shadow duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-white/[0.08] border border-white/15 flex-shrink-0 mt-0.5">
                  <p.Icon className="h-4.5 w-4.5 text-cambra-cyan" strokeWidth={2} />
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
      </div>
    </section>
  );
}