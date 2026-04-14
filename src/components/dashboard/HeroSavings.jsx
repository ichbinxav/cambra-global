import { CreditCard, Truck, Package } from "lucide-react";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

const SCORE_LABEL = s => s >= 90 ? "Best-in-class" : s >= 80 ? "Strong" : s >= 60 ? "Efficient" : s >= 40 ? "Optimization opportunity detected" : "High optimization potential";

export default function HeroSavings({ latest, score }) {
  return (
    <div className="rounded-2xl border border-foreground/8 bg-foreground text-background overflow-hidden">
      <div className="p-7 sm:p-8">
        <p className="text-[10px] tracking-[0.3em] uppercase opacity-35 mb-3">Optimization potential identified</p>
        <div className="text-[clamp(3.5rem,11vw,6rem)] font-black tracking-[-0.055em] leading-none mb-1 no-blur">
          <span className="tabular-nums"><AnimatedCounter value={latest.total_savings} prefix="€" duration={1.8} /></span>
        </div>
        <p className="text-sm opacity-40 mb-6">per year left unoptimized across your infrastructure</p>

        <div className="grid grid-cols-3 gap-3 mb-6 pb-6 border-b border-background/10">
          {[
            { label: "Payments", value: latest.payment_savings, icon: CreditCard },
            { label: "Shipping", value: latest.shipping_savings, icon: Truck },
            { label: "SaaS", value: latest.saas_savings, icon: Package },
          ].map((item, i) => (
            <div key={i}>
              <p className="text-[10px] uppercase tracking-[0.15em] opacity-35 mb-1">{item.label}</p>
              <p className="text-base sm:text-lg font-black tabular-nums opacity-90">
                €{(item.value || 0).toLocaleString()}
              </p>
              <p className="text-[10px] opacity-30">/yr</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-5">
          <svg className="w-8 h-8 -rotate-90 shrink-0" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 10}
              strokeDashoffset={2 * Math.PI * 10 * (1 - score / 100)}
              style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
          </svg>
          <div className="flex-1">
            <p className="text-xs font-black opacity-80">Infra Score: <span className="font-black tabular-nums">{score}/100</span></p>
            <p className="text-[10px] opacity-35">{SCORE_LABEL(score)}</p>
          </div>
          <div className="hidden sm:block w-24 h-1.5 rounded-full bg-background/10 overflow-hidden">
            <div className="h-full rounded-full bg-background/60 transition-all duration-1000"
              style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}