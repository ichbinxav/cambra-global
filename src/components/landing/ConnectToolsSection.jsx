import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, Lock, Eye, Zap, CheckCircle2 } from "lucide-react";

const CONNECTORS = [
  { name: "Stripe", category: "Payments", color: "#635BFF" },
  { name: "Shopify", category: "Commerce", color: "#96BF48" },
  { name: "Adyen", category: "Payments", color: "#0ABF53" },
  { name: "Klarna", category: "Payments", color: "#FFA8CD" },
  { name: "Sendcloud", category: "Shipping", color: "#1A2B6B" },
  { name: "DHL", category: "Shipping", color: "#FFCC00" },
  { name: "UPS", category: "Shipping", color: "#8B5A2B" },
  { name: "Xero", category: "Accounting", color: "#13B5EA" },
  { name: "QuickBooks", category: "Accounting", color: "#2CA01C" },
  { name: "Klaviyo", category: "Marketing", color: "#000000" },
  { name: "Notion", category: "SaaS", color: "#000000" },
  { name: "Slack", category: "SaaS", color: "#4A154B" },
];

const TRUST = [
  { icon: Eye, label: "Read-only access", desc: "We can never move money or change settings." },
  { icon: Lock, label: "Encrypted at rest", desc: "Bank-grade encryption. Revoke any time." },
  { icon: Shield, label: "SOC 2 aligned", desc: "Audit logs on every data access." },
];

export default function ConnectToolsSection() {
  return (
    <section id="connect" className="relative overflow-hidden bg-[#06080F] text-white py-24 sm:py-32">
      {/* Ambient layers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl"
             style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.5), transparent 60%)" }} />
        <div className="absolute -bottom-40 right-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl"
             style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.4), transparent 60%)" }} />
        <div className="absolute inset-0 opacity-[0.06]"
             style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      </div>

      <div className="relative max-w-6xl mx-auto px-5">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
            </span>
            <Zap size={10} className="opacity-70" />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">Recommended · Highest accuracy</span>
          </div>

          <h2 className="font-display text-[clamp(2.2rem,5vw,3.8rem)] font-black tracking-[-0.045em] leading-[0.92] mb-5">
            <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 45%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 22px rgba(44,167,193,0.35))" }}>
              Connect your tools.
            </span>
            <br />
            <span className="text-white/90">Get a 10× sharper audit.</span>
          </h2>

          <p className="text-base sm:text-lg text-white/60 leading-relaxed max-w-2xl mx-auto">
            Forms tell us what you <em className="not-italic text-white/90">think</em> you pay. Connections show us what you <em className="not-italic text-white/90">actually</em> pay — every fee, refund, surcharge, and hidden line.{" "}
            <span className="text-white font-semibold">Read-only. No write access. Ever.</span>
          </p>
        </div>

        {/* Connector grid */}
        <div className="relative mb-12">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {CONNECTORS.map((c, i) => (
              <div key={c.name}
                   className="group relative aspect-square rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm flex flex-col items-center justify-center p-3 hover:bg-white/[0.06] hover:border-white/20 transition-all hover:-translate-y-1"
                   style={{ animationDelay: `${i * 50}ms` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 font-black text-sm"
                     style={{ background: `linear-gradient(135deg, ${c.color}33, ${c.color}11)`, color: c.color, border: `1px solid ${c.color}44` }}>
                  {c.name[0]}
                </div>
                <p className="text-[11px] font-bold text-white/90 leading-tight text-center">{c.name}</p>
                <p className="text-[9px] uppercase tracking-wider text-white/40 mt-0.5">{c.category}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-white/40 mt-5">+ 40 more · Banking, Insurance, Telecom, HR, FinanceOps</p>
        </div>

        {/* Trust strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {TRUST.map((t) => (
            <div key={t.label} className="relative p-5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
              <div className="w-9 h-9 rounded-xl bg-cambra-mint/15 border border-cambra-mint/30 flex items-center justify-center mb-3">
                <t.icon size={16} className="text-cambra-mint" />
              </div>
              <p className="text-sm font-bold mb-1">{t.label}</p>
              <p className="text-xs text-white/55 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>

        {/* Comparison: forms vs connections */}
        <div className="relative rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-6 sm:p-8 mb-10 overflow-hidden">
          <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-50"
               style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.35), transparent)" }} />
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02]">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/40 font-bold mb-3">Forms only</p>
              <p className="text-2xl font-black tracking-tight mb-1 text-white/90">~70% accuracy</p>
              <p className="text-xs text-white/50 mb-4">Estimated savings range. Good directional starting point.</p>
              <ul className="space-y-2 text-xs text-white/60">
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-white/30" /> Manual input · 2 min</li>
                <li className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-white/30" /> Industry benchmarks</li>
              </ul>
            </div>
            <div className="relative p-5 rounded-2xl border border-cambra-mint/40 bg-cambra-mint/5">
              <div className="absolute -top-2 right-4 px-2 py-0.5 rounded-full bg-cambra-mint text-[#06080F] text-[9px] font-black tracking-wider uppercase">Recommended</div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-cambra-mint font-bold mb-3">Read-only connections</p>
              <p className="text-2xl font-black tracking-tight mb-1" style={{ background: "linear-gradient(135deg, #fff, #2CA7C1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>~98% accuracy</p>
              <p className="text-xs text-white/70 mb-4">Verified savings from real transactions. Continuous monitoring.</p>
              <ul className="space-y-2 text-xs text-white/80">
                <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-cambra-mint" /> Real fees, real volumes, real costs</li>
                <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-cambra-mint" /> Continuous drift detection</li>
                <li className="flex items-center gap-2"><CheckCircle2 size={11} className="text-cambra-mint" /> Provider-specific recommendations</li>
              </ul>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/ConnectTools">
            <Button size="lg" className="h-12 rounded-full px-7 text-sm font-bold gap-2 bg-white text-[#06080F] hover:bg-white/90 shadow-[0_0_40px_rgba(44,167,193,0.45)]">
              Connect your tools <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/Analyzer">
            <Button size="lg" variant="outline" className="h-12 rounded-full px-7 text-sm font-semibold border-white/20 bg-white/[0.03] text-white hover:bg-white/10 hover:text-white">
              Or skip — fill the form
            </Button>
          </Link>
        </div>
        <p className="text-center text-[11px] text-white/40 mt-4">2-minute connection · Disconnect any time · Your data stays yours</p>
      </div>
    </section>
  );
}