import { Link } from "react-router-dom";
import { ArrowRight, Plug, Upload, Pencil, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONNECTOR_LOGOS = [
  { name: "Stripe", cat: "Payments", color: "#635BFF" },
  { name: "Shopify", cat: "Commerce", color: "#96BF48" },
  { name: "Adyen", cat: "Payments", color: "#0ABF53" },
  { name: "QuickBooks", cat: "Accounting", color: "#2CA01C" },
  { name: "Xero", cat: "Accounting", color: "#13B5EA" },
  { name: "Klaviyo", cat: "SaaS", color: "#000000" },
  { name: "DHL", cat: "Shipping", color: "#FFCC00" },
  { name: "UPS", cat: "Shipping", color: "#351C15" },
  { name: "Sendcloud", cat: "Shipping", color: "#0066FF" },
  { name: "Gorgias", cat: "SaaS", color: "#FF4F00" },
  { name: "Pennylane", cat: "Accounting", color: "#6C3CE1" },
  { name: "Holded", cat: "Accounting", color: "#0052CC" },
];

const MODES = [
  {
    icon: Plug,
    title: "Connect your tools",
    desc: "One-click integrations with Stripe, Shopify, accounting platforms, and more. More connected = more accurate.",
    tag: "Most accurate",
    tagColor: "text-green-600 bg-green-500/[0.06] border-green-500/20",
    accent: true,
  },
  {
    icon: Upload,
    title: "Upload your files",
    desc: "Drop your invoices, CSV exports, or carrier statements. We extract and analyze them automatically.",
    tag: "Flexible",
    tagColor: "text-blue-600 bg-blue-500/[0.06] border-blue-500/20",
  },
  {
    icon: Pencil,
    title: "Enter manually",
    desc: "Use structured inputs if you prefer full control. Always available as a fallback, no account needed.",
    tag: "Always available",
    tagColor: "text-orange-500 bg-orange-500/[0.06] border-orange-500/20",
  },
];

function InitialAvatar({ name, color }) {
  const initials = name.slice(0, 2).toUpperCase();
  const isDark = color === "#000000" || color === "#351C15";
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0"
      style={{ background: color + "18", border: `1px solid ${color}25` }}
    >
      <span style={{ color }}>{initials}</span>
    </div>
  );
}

export default function IntegrationsSection() {
  return (
    <section className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-end mb-14">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> Open integration system
            </p>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9]">
              Connect any tool.<br />
              Analyze everything.
            </h2>
          </div>
          <div>
            <p className="text-muted-foreground leading-relaxed text-base">
              THE NoDE is built as an open integration layer. Connect your platforms directly, upload files, or enter data manually — the more you connect, the sharper your intelligence.
            </p>
            <Link to="/ConnectTools">
              <Button className="mt-6 h-11 rounded-full px-7 text-sm font-bold gap-2 shadow-sm">
                Connect your tools <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* 3 ingestion modes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {MODES.map((mode, i) => (
            <div key={i} className={`p-7 rounded-2xl border flex flex-col gap-4 ${mode.accent ? "bg-foreground text-background border-foreground/10" : "bg-card border-border/50"}`}>
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode.accent ? "bg-background/10" : "bg-secondary"}`}>
                  <mode.icon size={17} className={mode.accent ? "text-background/60" : "text-muted-foreground/50"} />
                </div>
                <span className={`text-[10px] font-semibold tracking-[0.1em] uppercase px-2.5 py-1 rounded-full border ${mode.tagColor}`}>
                  {mode.tag}
                </span>
              </div>
              <div>
                <h3 className={`font-bold text-base mb-1.5 ${mode.accent ? "text-background" : ""}`}>{mode.title}</h3>
                <p className={`text-sm leading-relaxed ${mode.accent ? "text-background/50" : "text-muted-foreground"}`}>{mode.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Connector grid */}
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={12} className="text-muted-foreground/40" />
              <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">Available connectors</span>
            </div>
            <Link to="/ConnectTools" className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1">
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 divide-x divide-y divide-border/30">
            {CONNECTOR_LOGOS.map((c, i) => (
              <div key={i} className="px-4 py-4 flex items-center gap-2.5 hover:bg-secondary/40 transition-colors">
                <InitialAvatar name={c.name} color={c.color} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground/40">{c.cat}</p>
                </div>
              </div>
            ))}
            {/* Generic + future slot */}
            <div className="px-4 py-4 flex items-center gap-2.5 col-span-2 md:col-span-2 bg-secondary/20 cursor-pointer hover:bg-secondary/40 transition-colors group">
              <div className="w-9 h-9 rounded-xl border-2 border-dashed border-border/50 flex items-center justify-center shrink-0 group-hover:border-foreground/30 transition-colors">
                <span className="text-muted-foreground/30 text-lg leading-none group-hover:text-muted-foreground/60 transition-colors">+</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground/60">Connect another tool</p>
                <p className="text-[10px] text-muted-foreground/35">Request or upload files</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}