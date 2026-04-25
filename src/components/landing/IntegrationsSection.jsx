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
    tagColor: "text-chart-1 bg-blue-500/[0.07] border-blue-500/20",
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
    <section className="py-10 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-12 max-w-3xl mx-auto text-center lg:text-left">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center justify-center lg:justify-start gap-2">
            <span className="w-4 h-px bg-border" /> Data ingestion
          </p>
          <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-4 text-center lg:text-left">
            Connect any tool.<br />Analyze everything.
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto text-center lg:text-left">
            THE NoDE works with your existing stack — more connected = sharper intelligence.
          </p>
        </div>

        {/* Primary actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
          <Link to="/ConnectTools?mode=connect" className="block">
            <Button className="w-full h-12 rounded-xl text-sm font-bold gap-2"><Plug className="h-4 w-4" /> Connect tools</Button>
          </Link>
          <Link to="/ConnectTools?mode=upload" className="block">
            <Button variant="outline" className="w-full h-12 rounded-xl text-sm font-bold gap-2"><Upload className="h-4 w-4" /> Upload files</Button>
          </Link>
          <Link to="/ConnectTools?mode=manual" className="block">
            <Button variant="outline" className="w-full h-12 rounded-xl text-sm font-bold gap-2"><Pencil className="h-4 w-4" /> Enter manually</Button>
          </Link>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {CONNECTORS.map((c, i) => (
              <div key={i} className="p-4 rounded-2xl border border-border/50 bg-card hover:border-foreground/20 transition-colors text-center flex flex-col items-center gap-2">
                <Avatar name={c.name} color={c.color} />
                <p className="text-xs font-semibold">{c.name}</p>
                <p className="text-[10px] text-muted-foreground/40">{c.cat}</p>
              </div>
            ))}
            <Link to="/ConnectTools?mode=connect" className="p-4 rounded-2xl border border-dashed border-border/50 hover:border-foreground/20 transition-colors text-center flex flex-col items-center justify-center gap-2">
              <div className="w-9 h-9 rounded-xl border-2 border-dashed border-border/40 flex items-center justify-center">
                <span className="text-muted-foreground/30 text-lg leading-none">+</span>
              </div>
              <p className="text-xs font-semibold text-muted-foreground/50">More tools</p>
            </Link>
          </div>
        </div>

        {/* Security note */}
        <p className="text-center text-[11px] text-muted-foreground/35 flex items-center justify-center gap-1.5">
          <Shield size={10} /> Read-only access · Encrypted · Never shared with third parties
        </p>

        <div className="text-center mt-8">
          <Link to="/ConnectTools">
            <Button className="h-11 rounded-full px-7 text-sm font-bold gap-2 bg-saas-gradient text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10 hover:shadow-blue-500/40">
              Connect your tools <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

      </div>
    </section>
  );
}