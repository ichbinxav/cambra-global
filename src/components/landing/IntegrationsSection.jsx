import { Link } from "react-router-dom";
import { ArrowRight, Plug, Upload, Pencil, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONNECTORS = [
  { name: "Stripe",      cat: "Payments",   color: "#635BFF" },
  { name: "Shopify",     cat: "Commerce",   color: "#96BF48" },
  { name: "Adyen",       cat: "Payments",   color: "#0ABF53" },
  { name: "QuickBooks",  cat: "Accounting", color: "#2CA01C" },
  { name: "Xero",        cat: "Accounting", color: "#13B5EA" },
  { name: "Klaviyo",     cat: "SaaS",       color: "#1a1a1a" },
  { name: "DHL",         cat: "Shipping",   color: "#D40511" },
  { name: "UPS",         cat: "Shipping",   color: "#351C15" },
  { name: "Sendcloud",   cat: "Shipping",   color: "#0066FF" },
  { name: "Gorgias",     cat: "SaaS",       color: "#FF4F00" },
  { name: "Pennylane",   cat: "Accounting", color: "#6C3CE1" },
  { name: "Holded",      cat: "Accounting", color: "#0052CC" },
];

const MODES = [
  {
    icon: Plug,
    title: "Connect directly",
    sub: "One-click integrations",
    desc: "Stripe, Shopify, accounting tools and more. Real-time, most accurate.",
    tag: "Most accurate",
    tagColor: "text-green-600 bg-green-500/[0.07] border-green-500/20",
    accent: true,
  },
  {
    icon: Upload,
    title: "Upload files",
    sub: "PDF · CSV · Excel",
    desc: "Drop invoices or carrier statements. We extract and analyze automatically.",
    tag: "Flexible",
    tagColor: "text-blue-600 bg-blue-500/[0.07] border-blue-500/20",
  },
  {
    icon: Pencil,
    title: "Enter manually",
    sub: "Structured inputs",
    desc: "Full control without integrations. Always available, no account needed.",
    tag: "Always available",
    tagColor: "text-orange-500 bg-orange-500/[0.07] border-orange-500/20",
  },
];

function Avatar({ name, color }) {
  const isDark = ["#000000", "#351C15", "#1a1a1a"].includes(color);
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0"
      style={{ background: color + "18", border: `1px solid ${color}25` }}>
      <span style={{ color: isDark ? color + "CC" : color }}>{name.slice(0, 2).toUpperCase()}</span>
    </div>
  );
}

export default function IntegrationsSection() {
  return (
    <section className="py-16 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center justify-center gap-2">
            <span className="w-4 h-px bg-border" /> Data ingestion
          </p>
          <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-4">
            Connect any tool.<br />Analyze everything.
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            THE NoDE works with your existing stack — more connected = sharper intelligence.
          </p>
        </div>

        {/* 3 ingestion modes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {MODES.map((mode, i) => (
            <div key={i} className={`p-7 rounded-2xl border flex flex-col gap-5 ${mode.accent ? "bg-foreground text-background border-foreground/10" : "bg-card border-border/50"}`}>
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${mode.accent ? "bg-background/10" : "bg-secondary border border-border/40"}`}>
                  <mode.icon size={16} className={mode.accent ? "text-background/60" : "text-muted-foreground/50"} />
                </div>
                <span className={`text-[10px] font-bold tracking-[0.1em] uppercase px-2.5 py-1 rounded-full border ${mode.tagColor}`}>
                  {mode.tag}
                </span>
              </div>
              <div>
                <h3 className={`font-bold text-base mb-0.5 ${mode.accent ? "text-background" : ""}`}>{mode.title}</h3>
                <p className={`text-[11px] mb-2 font-medium ${mode.accent ? "text-background/40" : "text-muted-foreground/40"}`}>{mode.sub}</p>
                <p className={`text-sm leading-relaxed ${mode.accent ? "text-background/55" : "text-muted-foreground/70"}`}>{mode.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Connector grid */}
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden mb-5">
          <div className="px-6 py-3.5 border-b border-border/40 flex items-center justify-between bg-secondary/30">
            <div className="flex items-center gap-2">
              <Zap size={11} className="text-muted-foreground/40" />
              <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/45">Available connectors</span>
            </div>
            <Link to="/ConnectTools" className="text-xs text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1">
              View all <ArrowRight size={10} />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 divide-x divide-y divide-border/25">
            {CONNECTORS.map((c, i) => (
              <div key={i} className="px-4 py-3.5 flex items-center gap-2.5 hover:bg-secondary/30 transition-colors">
                <Avatar name={c.name} color={c.color} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">{c.name}</p>
                  <p className="text-[10px] text-muted-foreground/35">{c.cat}</p>
                </div>
              </div>
            ))}
            <Link to="/ConnectTools" className="px-4 py-3.5 flex items-center gap-2.5 hover:bg-secondary/30 transition-colors col-span-2 md:col-span-2 cursor-pointer group bg-secondary/10">
              <div className="w-9 h-9 rounded-xl border-2 border-dashed border-border/40 flex items-center justify-center shrink-0 group-hover:border-foreground/20 transition-colors">
                <span className="text-muted-foreground/30 text-lg leading-none">+</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground/50">More tools</p>
                <p className="text-[10px] text-muted-foreground/30">Request or upload files</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Security note */}
        <p className="text-center text-[11px] text-muted-foreground/35 flex items-center justify-center gap-1.5">
          <Shield size={10} /> Read-only access · Encrypted · Never shared with third parties
        </p>

        <div className="text-center mt-8">
          <Link to="/ConnectTools">
            <Button className="h-11 rounded-full px-7 text-sm font-bold gap-2 shadow-sm">
              Connect your tools <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

      </div>
    </section>
  );
}