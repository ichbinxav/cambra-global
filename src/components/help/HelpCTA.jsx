import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Activity, Upload, MessageSquare, Plug } from "lucide-react";

const ACTIONS = [
  {
    icon: Activity,
    title: "Run the Analyzer",
    description: "Audit your infrastructure in under 3 minutes.",
    href: "/Analyzer",
    primary: true,
  },
  {
    icon: Upload,
    title: "Upload invoices",
    description: "CAMBRA extracts real infrastructure economics from your statements.",
    href: "/ConnectTools?mode=upload",
  },
  {
    icon: Plug,
    title: "Connect tools",
    description: "Read-only integrations for the sharpest possible benchmarks.",
    href: "/ConnectTools?mode=connect",
  },
  {
    icon: MessageSquare,
    title: "Talk to CAMBRA",
    description: "Book onboarding or escalate an operational question.",
    href: "/Contact",
  },
];

export default function HelpCTA() {
  return (
    <section className="py-16 px-5">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="text-2xl md:text-3xl font-black tracking-[-0.03em]" style={{ color: "var(--ink)" }}>
            Still exploring?
          </h2>
          <p className="hidden md:block text-xs" style={{ color: "var(--gris-2)" }}>
            Pick the path that fits your stack
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {ACTIONS.map((a, i) => (
            <motion.div
              key={a.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Link
                to={a.href}
                className="group block h-full p-5 rounded-2xl transition-all hover:-translate-y-0.5"
                style={{
                  border: a.primary ? "1px solid var(--voltio)" : "1px solid var(--linea)",
                  background: "#fff",
                  boxShadow: a.primary
                    ? "0 10px 30px -12px rgba(91,76,245,0.30)"
                    : "0 4px 20px rgba(12,12,22,0.04)",
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: a.primary ? "var(--voltio)" : "rgba(12,12,22,0.04)",
                      color: a.primary ? "#fff" : "var(--ink)",
                      border: a.primary ? "none" : "1px solid var(--linea)",
                    }}
                  >
                    <a.icon className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-all" style={{ color: "var(--gris-2)" }} />
                </div>
                <h3 className="text-base font-bold tracking-tight mb-1.5" style={{ color: "var(--ink)" }}>{a.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--gris-1)" }}>{a.description}</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}