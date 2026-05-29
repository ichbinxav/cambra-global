import { Link } from "react-router-dom";
import { ArrowRight, Plug, Upload, ScanLine, Shield, Zap } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const CONNECTORS = [
  { name: "Stripe", cat: "Payments", color: "#635BFF" },
  { name: "PayPal", cat: "Payments", color: "#003087" },
  { name: "Adyen", cat: "Payments", color: "#0ABF53" },
  { name: "SumUp", cat: "Payments", color: "#00D639" },
  { name: "DHL", cat: "Logistics", color: "#D40511" },
  { name: "FedEx", cat: "Logistics", color: "#4D148C" },
  { name: "Sendcloud", cat: "Logistics", color: "#0066FF" },
  { name: "ShipBob", cat: "Logistics", color: "#FF4F00" },
  { name: "Shopify", cat: "Commerce SaaS", color: "#96BF48" },
  { name: "WooCommerce", cat: "Commerce SaaS", color: "#873EFF" },
  { name: "Klaviyo", cat: "Commerce SaaS", color: "#1a1a1a" },
  { name: "Gorgias", cat: "Commerce SaaS", color: "#FF4F00" },
];

function ConnectorAvatar({ name, color }) {
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0"
      style={{ background: `${color}15`, border: `1px solid ${color}25` }}
    >
      <span style={{ color }}>{name.slice(0, 2).toUpperCase()}</span>
    </div>
  );
}

export default function IntegrationsSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-16 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div ref={ref} className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-12 items-start">
          {/* LEFT */}
          <div>
            <motion.p
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-4"
            >Audit methods</motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(2rem,4.5vw,3.5rem)] font-black tracking-[-0.04em] leading-[0.92] mb-5"
            >
              Connect any tool.<br />Audit everything.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.2 }}
              className="text-base text-muted-foreground/60 mb-8 max-w-lg leading-relaxed"
            >
              More connections = sharper intelligence. Works with your existing stack.
            </motion.p>

            <div className="space-y-3 mb-8">
              {[
                { icon: Plug, label: "Connect directly", desc: "One-click with Stripe, Shopify, accounting tools.", tag: "Most accurate", color: "#635BFF" },
                { icon: Upload, label: "Upload documents", desc: "Invoices, statements, receipts. AI extracts automatically.", tag: "Flexible", color: "#06B6D4" },
                { icon: ScanLine, label: "Interactive audit", desc: "Visual flow. No documents needed. < 3 min.", tag: "< 3 min", color: "#8B5CF6" },
              ].map((method, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -15 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.15 + i * 0.08 }}
                  className="flex items-start gap-3 p-4 rounded-xl border border-border/40 bg-card/70"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${method.color}12`, border: `1px solid ${method.color}25` }}
                  >
                    <method.icon className="h-4 w-4" style={{ color: method.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold">{method.label}</span>
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: `${method.color}10`, color: method.color }}>{method.tag}</span>
                    </div>
                    <p className="text-xs text-muted-foreground/55">{method.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground/30 flex items-center gap-1.5">
              <Shield className="h-3 w-3" /> Read-only access · Encrypted · Never shared
            </p>
          </div>

          {/* RIGHT — connector grid */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-xl"
          >
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-muted-foreground/30" />
                <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/40">Available integrations</span>
              </div>
              <Link to="/ConnectTools" className="text-[10px] text-muted-foreground/40 hover:text-foreground flex items-center gap-1">
                View all <ArrowRight className="h-2.5 w-2.5" />
              </Link>
            </div>
            <div className="divide-y divide-border/25">
              {CONNECTORS.map((c, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ delay: 0.2 + i * 0.04 }}
                >
                  <Link to="/ConnectTools" className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors">
                    <ConnectorAvatar name={c.name} color={c.color} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{c.name}</p>
                      <p className="text-[9px] text-muted-foreground/35">{c.cat}</p>
                    </div>
                    <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/20 shrink-0" />
                  </Link>
                </motion.div>
              ))}
              <Link to="/ConnectTools" className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/30 transition-colors">
                <div className="w-9 h-9 rounded-xl border-2 border-dashed border-border/30 flex items-center justify-center">
                  <span className="text-muted-foreground/25 text-base leading-none">+</span>
                </div>
                <p className="text-xs text-muted-foreground/40">More integrations available</p>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}