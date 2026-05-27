import { CreditCard, Truck, Package, Sparkles } from "lucide-react";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

const SCORE_LABEL = s => s >= 90 ? "Best-in-class" : s >= 80 ? "Strong" : s >= 60 ? "Efficient" : s >= 40 ? "Optimization opportunity detected" : "High optimization potential";

export default function HeroSavings({ latest, score }) {
  return (
    <div className="card-hero-black">
      {/* Extra ambient layers */}
      <div className="pointer-events-none absolute -top-40 left-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl"
           style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.45), transparent 65%)" }} />
      <div className="pointer-events-none absolute -bottom-40 -right-20 w-[34rem] h-[34rem] rounded-full blur-3xl"
           style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.40), transparent 65%)" }} />

      <div className="relative p-7 sm:p-9">
        <div className="flex items-center gap-2 mb-4 px-2.5 py-1.5 rounded-full border border-background/15 bg-background/[0.04] backdrop-blur-sm w-fit">
          <Sparkles size={11} className="opacity-70" />
          <span className="text-[10px] font-bold tracking-[0.22em] uppercase opacity-80">Annual savings · live</span>
        </div>

        <div className="text-[clamp(4rem,13vw,7rem)] font-black tracking-[-0.055em] leading-[0.9] mb-2 no-blur">
          <span className="tabular-nums figure-hero">
            <AnimatedCounter value={latest.total_savings} prefix="€" duration={1.8} />
          </span>
        </div>
        <p className="text-xs opacity-50 mb-7">left unoptimized across your infrastructure</p>

        <div className="grid grid-cols-3 gap-3 mb-7 pb-7 border-b border-background/10">
          {[
            { label: "Payments", value: latest.payment_savings, icon: CreditCard, glow: "rgba(31,78,216,0.45)" },
            { label: "Shipping", value: latest.shipping_savings, icon: Truck,      glow: "rgba(34,197,94,0.45)" },
            { label: "SaaS",     value: latest.saas_savings,     icon: Package,    glow: "rgba(251,146,60,0.45)" },
          ].map((item, i) => (
            <div key={i} className="relative p-4 rounded-xl border border-background/10 bg-background/[0.04] backdrop-blur-md overflow-hidden">
              <div className="pointer-events-none absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl opacity-70"
                   style={{ background: `radial-gradient(closest-side, ${item.glow}, transparent)` }} />
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-2">
                  <item.icon size={11} className="opacity-60" />
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-55 font-semibold">{item.label}</p>
                </div>
                <p className="text-xl sm:text-2xl font-black tabular-nums tracking-tight">
                  €{(item.value || 0).toLocaleString()}
                </p>
                <p className="text-[10px] opacity-35 mt-0.5">/yr potential</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-full blur-lg opacity-60" style={{ background: "rgba(44,167,193,0.5)" }} />
            <svg className="relative w-12 h-12 -rotate-90" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
              <circle cx="12" cy="12" r="10" fill="none" stroke="url(#scoreGrad)" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 10}
                strokeDashoffset={2 * Math.PI * 10 * (1 - score / 100)}
                style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#2CA7C1" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black opacity-90">Infra Score: <span className="font-black tabular-nums">{score}/100</span></p>
            <p className="text-[11px] opacity-50 truncate">{SCORE_LABEL(score)}</p>
          </div>
          <div className="hidden sm:block w-32 h-1.5 rounded-full bg-background/10 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000"
                 style={{ width: `${score}%`, background: "linear-gradient(90deg, #ffffff, #2CA7C1)", boxShadow: "0 0 12px rgba(44,167,193,0.5)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}