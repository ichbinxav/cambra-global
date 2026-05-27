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
    <section ref={ref} className="relative py-16 md:py-20 px-5 border-t border-border/40 bg-background overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto">
        {/* Tools strip */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
          >
            <Plug className="h-3 w-3 text-cambra-mint" strokeWidth={2.5} />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              Works with your stack
            </span>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-sm md:text-base text-foreground/60 max-w-xl mx-auto mb-10"
          >
            Native integrations across payments, shipping, accounting and SaaS — plus PDF & CSV fallback.
          </motion.p>

          {/* Logos grid */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-6 gap-y-6 max-w-4xl mx-auto items-center"
          >
            {TOOLS.map((tool, i) => (
              <motion.div
                key={tool.name}
                initial={{ opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.03 }}
                className="flex items-center justify-center h-10 group"
                title={tool.name}
              >
                <img
                  src={tool.url}
                  alt={tool.name}
                  className="max-h-6 max-w-[80%] object-contain opacity-50 grayscale group-hover:opacity-100 group-hover:grayscale-0 transition-all duration-300"
                  loading="lazy"
                />
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Pillars */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 pt-10 border-t border-border/40"
        >
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.eyebrow}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.35 + i * 0.08 }}
              className="relative rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm p-5 sm:p-6 hover:border-border transition-colors"
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-secondary/60 border border-border/50">
                  <p.Icon className="h-4 w-4 text-cambra-blue" strokeWidth={2} />
                </div>
                <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground/70">
                  {p.eyebrow}
                </span>
              </div>
              <h3 className="font-display text-lg font-black tracking-[-0.02em] mb-2">
                {p.title}
              </h3>
              <p className="text-[13px] text-foreground/65 leading-[1.55]">
                {p.detail}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}