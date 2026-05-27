import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";

export default function ConnectToolsSection() {
  return (
    <section id="connect" className="relative overflow-hidden bg-[#06080F] text-white py-20 sm:py-24">
      {/* Ambient layers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/3 w-[36rem] h-[36rem] rounded-full blur-3xl"
             style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.45), transparent 60%)" }} />
        <div className="absolute -bottom-32 right-1/4 w-[32rem] h-[32rem] rounded-full blur-3xl"
             style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.35), transparent 60%)" }} />
        <div className="absolute inset-0 opacity-[0.05]"
             style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      </div>

      <div className="relative max-w-3xl mx-auto px-5 text-center">
        <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
          </span>
          <Zap size={10} className="opacity-70" />
          <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">Recommended · Highest accuracy</span>
        </div>

        <h2 className="font-display text-[clamp(2rem,4.8vw,3.4rem)] font-black tracking-[-0.045em] leading-[0.95] mb-5">
          <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 45%, #2CA7C1 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 22px rgba(44,167,193,0.35))" }}>
            Connect your tools.
          </span>
        </h2>

        <p className="text-base sm:text-lg text-white/65 leading-relaxed max-w-xl mx-auto mb-8">
          Read-only connections to Stripe, Shopify, your carriers and accounting tools. <span className="text-white font-semibold">~98% accuracy</span>, real numbers, zero write access.
        </p>

        <Link to="/ConnectTools">
          <Button size="lg" className="h-12 rounded-full px-7 text-sm font-bold gap-2 bg-white text-[#06080F] hover:bg-white/90 shadow-[0_0_40px_rgba(44,167,193,0.45)]">
            Connect your tools <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <p className="text-[11px] text-white/40 mt-4">2-minute connection · Disconnect any time</p>
      </div>
    </section>
  );
}